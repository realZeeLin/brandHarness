/**
 * 数据接入层：批量导入（JSON / NDJSON / CSV）与数据流推入（逐条 / 小批量 NDJSON）。
 * 每条记录过「四道筛」：① 结构校验 ② 去重（内容哈希）③ 去无效（默认好评 / 零信息）④ 相关性甄别（品牌 + 品类语境）。
 * 通过的记录写入 workspace/data/<dataset>.jsonl 并与基线合并，算法层缓存随即失效，下一次工具调用即用上新数据。
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { workspaceDir, social, ecommerce, demo, increments, resetCache } from './dataset.js'
import { isDefault } from './rules.js'
import { audit } from './audit.js'

const h = s => createHash('sha256').update(String(s)).digest('hex')
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const BRAND_RE = /福临门|中粮|金龙鱼|鲁花|胡姬花|多力|欧丽薇兰|香满园/
const CTX_RE = /油|炒菜|烹饪|厨房|压榨|大豆|花生|玉米|菜籽|葵花|调和/
const POS_RE = /好|香|放心|推荐|满意|不错|划算|新鲜|值得|回购|信赖/
const NEG_RE = /差|漏油|破损|难吃|异味|假|投诉|失望|变质|贵|起沫|呛/

function sentimentOf(text) { const n = NEG_RE.test(text), p = POS_RE.test(text); return n && !p ? '负面' : p && !n ? '正面' : '中性' }

/** 可接入的数据集与字段约定。 */
export const DATASETS = {
  social_posts: {
    name: '社媒内容', module: 'social', mode: ['batch', 'stream'],
    fields: { text: '正文（必填）', date: 'YYYY-MM-DD（必填）', platform: '平台（必填）', title: '标题', author: '作者（入库即脱敏）', brand: '品牌，缺省按正文识别', cat: '油种', sentiment: '正面/中性/负面，缺省自动判定', interactions: '互动数', ctype: 'UGC/PGC', url: '原文链接（不入库，仅用于去重）' },
    example: { text: '福临门花生油炒菜很香，桶也没漏', date: '2026-11-03', platform: '小红书', author: 'xx', interactions: 12 }
  },
  ec_reviews: {
    name: '电商评论', module: 'ecommerce', mode: ['batch', 'stream'],
    fields: { text: '评论原文（必填）', date: 'YYYY-MM-DD（必填）', platform: '京东 / 淘宝/天猫 / 抖音 等（必填）', sku: 'SKU 名称', item: '商品链接序号（可选）' },
    example: { text: '收到的时候瓶口漏油了，客服处理挺快', date: '2026-11-03', platform: '京东', sku: '福临门花生油5L' }
  },
  ec_links: {
    name: '电商商品', module: 'ecommerce', mode: ['batch'],
    fields: { title: '商品标题（必填）', platform: '平台（必填）', price: '价格（必填）', shop: '店铺', shopType: '店铺类型', cat: '油种', ppl: '单升价', sales: '展示销量' },
    example: { title: '福临门 非转基因 压榨一级花生油 5L', platform: '京东', price: 139.9, shop: '福临门食用油京东自营旗舰店', shopType: '平台自营', cat: '花生油' }
  },
  geo_answers: {
    name: 'AI 答案巡检结果', module: 'geo', mode: ['batch', 'stream'],
    fields: { q: '问题（必填）', platform: 'AI 平台（必填）', answer: 'AI 答案（必填）', kind: '通用 AI 助手 / 电商 AI 导购 / 社媒 AI 搜索', factId: '对应事实编号', verdict: '准确 / 错误 / 待核实 / 未提及，缺省「待核实」' },
    example: { q: '福临门是哪家公司的', platform: '元宝', answer: '福临门是中粮集团旗下品牌', verdict: '准确', factId: 'F-001' }
  },
  brand_facts: {
    name: '品牌事实库', module: 'geo', mode: ['batch'],
    fields: { id: '事实编号（必填，同号覆盖）', fact: '事实表述（必填）', evidence: '证据来源（必填）', owner: '负责部门', status: '已审定 / 待补证据' },
    example: { id: 'F-005', fact: '福临门压榨花生油采用物理压榨工艺', evidence: '产品标签', owner: '研究院', status: '待补证据' }
  }
}

/** 简易 CSV 解析（支持引号与逗号转义），首行为表头。 */
export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = [] }
    else cur += c
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row)
  const [head, ...body] = rows
  return body.map(r => Object.fromEntries(head.map((k, i) => [k.trim(), r[i] ?? ''])))
}

/** 把任意载荷（数组 / NDJSON 字符串 / CSV 字符串 / 单条对象）转成记录数组。 */
export function toRecords(payload, format) {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') return Array.isArray(payload.records) ? payload.records : [payload]
  const text = String(payload || '').trim()
  if (!text) return []
  if (format === 'csv' || (!format && !/^[[{]/.test(text))) return parseCsv(text)
  if (format === 'ndjson' || (!format && text.startsWith('{') && text.includes('\n'))) return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const v = JSON.parse(text)
  return Array.isArray(v) ? v : Array.isArray(v.records) ? v.records : [v]
}

function existingKeys(dataset) {
  if (dataset === 'social_posts') return new Set(social().posts.map(p => h(p.plat + '|' + p.text.replace(/\s+/g, '').slice(0, 200))))
  if (dataset === 'ec_reviews') return new Set(ecommerce().reviews.map(r => h(r.plat + '|' + r.date + '|' + r.text)))
  if (dataset === 'ec_links') return new Set(ecommerce().links.map(l => h(l.plat + '|' + l.title + '|' + l.price)))
  if (dataset === 'geo_answers') return new Set(demo().geo.questions.map(q => h(q.platform + '|' + q.q + '|' + q.answer)))
  return new Set()
}

/** 单条记录过四道筛，返回 { ok, row, reason, stage }。 */
function gate(dataset, r, keys, nextId) {
  const s = v => String(v ?? '').trim()
  if (dataset === 'social_posts') {
    const text = s(r.text), date = s(r.date), plat = s(r.platform)
    if (!text || !DATE_RE.test(date) || !plat) return { ok: false, stage: '结构校验', reason: '缺 text / date(YYYY-MM-DD) / platform' }
    const k = h(plat + '|' + text.replace(/\s+/g, '').slice(0, 200)); if (keys.has(k)) return { ok: false, stage: '去重', reason: '与已有内容重复' }
    if (text.length < 6) return { ok: false, stage: '去无效', reason: '零信息内容' }
    const brand = s(r.brand) || (text.match(BRAND_RE) || [])[0]
    if (!brand || !CTX_RE.test(text + s(r.title))) return { ok: false, stage: '相关性甄别', reason: '缺品牌或食用油语境' }
    keys.add(k)
    const full = (s(r.title) ? s(r.title) + ' ' : '') + text
    return { ok: true, row: { id: 'I' + nextId(), title: s(r.title).slice(0, 80) || text.slice(0, 40), summary: text.slice(0, 200), plat, date, author: 'u' + h('brandharness:' + s(r.author)).slice(0, 8), brand: brand === '中粮' ? '福临门' : brand, cat: s(r.cat) || '其他', senti: ['正面', '中性', '负面'].includes(s(r.sentiment)) ? s(r.sentiment) : sentimentOf(text), inter: Number(r.interactions) || 0, tier: '普通个人', ctype: s(r.ctype) || 'UGC', points: [], scenes: [], risk: [], text: full, src: 'import' } }
  }
  if (dataset === 'ec_reviews') {
    const text = s(r.text), date = s(r.date), plat = s(r.platform)
    if (!text || !DATE_RE.test(date) || !plat) return { ok: false, stage: '结构校验', reason: '缺 text / date / platform' }
    const k = h(plat + '|' + date + '|' + text); if (keys.has(k)) return { ok: false, stage: '去重', reason: '与已有评论重复' }
    keys.add(k)
    return { ok: true, row: { plat, date, text, sku: s(r.sku), item: r.item === undefined || r.item === '' ? -1 : Number(r.item), src: 'import' }, note: isDefault(text) ? '默认好评：入库但不计入有效评价' : undefined }
  }
  if (dataset === 'ec_links') {
    const title = s(r.title), plat = s(r.platform), price = Number(r.price)
    if (!title || !plat || !Number.isFinite(price)) return { ok: false, stage: '结构校验', reason: '缺 title / platform / price' }
    const k = h(plat + '|' + title + '|' + price); if (keys.has(k)) return { ok: false, stage: '去重', reason: '与已有商品重复' }
    if (!/福临门|中粮/.test(title)) return { ok: false, stage: '相关性甄别', reason: '标题不含本品牌' }
    keys.add(k)
    return { ok: true, row: { plat, shopType: s(r.shopType) || '个人/其他店铺', cat: s(r.cat) || '其他油种', subBrand: '福临门', shop: s(r.shop) || '（店铺名缺失）', price, ppl: Number(r.ppl) || null, title, sales: r.sales === undefined || r.sales === '' ? null : Number(r.sales), src: 'import' } }
  }
  if (dataset === 'geo_answers') {
    const q = s(r.q), plat = s(r.platform), ans = s(r.answer)
    if (!q || !plat || !ans) return { ok: false, stage: '结构校验', reason: '缺 q / platform / answer' }
    const k = h(plat + '|' + q + '|' + ans); if (keys.has(k)) return { ok: false, stage: '去重', reason: '重复的巡检结果' }
    keys.add(k)
    const verdict = ['准确', '错误', '待核实', '未提及'].includes(s(r.verdict)) ? s(r.verdict) : '待核实'
    return { ok: true, row: { id: 'Q-I' + nextId(), q, platform: plat, kind: s(r.kind) || '通用 AI 助手', answer: ans, fact: s(r.fact) || '待对照品牌事实库', factId: s(r.factId) || 'F-001', verdict, severity: verdict === '错误' ? '高' : verdict === '准确' ? '-' : '中', src: 'import' } }
  }
  if (dataset === 'brand_facts') {
    if (!s(r.id) || !s(r.fact) || !s(r.evidence)) return { ok: false, stage: '结构校验', reason: '缺 id / fact / evidence' }
    return { ok: true, row: { id: s(r.id), fact: s(r.fact), evidence: s(r.evidence), owner: s(r.owner) || '品牌部', status: s(r.status) || '待补证据' } }
  }
  return { ok: false, stage: '结构校验', reason: '未知数据集' }
}

/**
 * data_import：dryRun=true 只出质检报告不入库（导入前预检）；mode=stream 用于数据流推入（同样过筛，逐条追加）。
 */
export function importRecords({ dataset, records, payload, format, dryRun = false, source = 'api', mode = 'batch', actor = 'system' } = {}) {
  if (!DATASETS[dataset]) throw new Error(`未知数据集 ${dataset}，可选：${Object.keys(DATASETS).join(' / ')}`)
  const rows = records ? toRecords(records, format) : toRecords(payload, format)
  if (rows.length > 50000) throw new Error('单次最多 50,000 条，请分批推入')
  const keys = existingKeys(dataset)
  let seq = increments(dataset).length
  const nextId = () => String(++seq).padStart(5, '0')
  const accepted = [], rejected = {}, notes = []
  rows.forEach((r, i) => {
    const g = gate(dataset, r || {}, keys, nextId)
    if (g.ok) { accepted.push(g.row); if (g.note) notes.push(`第 ${i + 1} 条：${g.note}`) }
    else { (rejected[g.stage] ||= { count: 0, samples: [] }).count++; if (rejected[g.stage].samples.length < 3) rejected[g.stage].samples.push({ index: i + 1, reason: g.reason }) }
  })
  const report = { dataset, name: DATASETS[dataset].name, mode, received: rows.length, accepted: accepted.length, rejected, notes: notes.slice(0, 5), dryRun }
  if (!dryRun && accepted.length) {
    const dir = join(workspaceDir(), 'data'); mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, dataset + '.jsonl'), accepted.map(r => JSON.stringify(r)).join('\n') + '\n')
    resetCache()
    const rec = audit({ action: 'data.' + mode, target: dataset, actor, detail: { source, received: rows.length, accepted: accepted.length } })
    report.auditId = rec.id
    writeSourceState(dataset, { lastSync: new Date().toISOString(), lastSource: source, lastMode: mode })
  }
  return report
}

function stateFile() { return join(workspaceDir(), 'data', 'sources.json') }
function writeSourceState(dataset, patch) {
  const f = stateFile(); const st = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
  st[dataset] = { ...(st[dataset] || {}), ...patch }
  mkdirSync(join(workspaceDir(), 'data'), { recursive: true }); writeFileSync(f, JSON.stringify(st, null, 2))
}

/** data_sources：每个数据集的基线规模、增量条数、最近同步时间、接入方式。 */
export function dataSources() {
  const st = existsSync(stateFile()) ? JSON.parse(readFileSync(stateFile(), 'utf8')) : {}
  const sm = social(), ec = ecommerce(), d = demo()
  const base = { social_posts: sm.posts.length, ec_reviews: ec.reviews.length, ec_links: ec.links.length, geo_answers: d.geo.questions.length, brand_facts: d.geo.facts.length }
  const baseline = { social_posts: '2026-11-01 · 三源合并去重', ec_reviews: '2026-11-02 · 京东 / 淘宝天猫采集快照', ec_links: '2026-11-02 · 采集快照', geo_answers: 'Demo 构造巡检案例', brand_facts: '品牌事实库 v1' }
  return { datasets: Object.entries(DATASETS).map(([key, v]) => ({ key, name: v.name, module: v.module, modes: v.mode, rows: base[key], increments: increments(key).length, baseline: baseline[key], lastSync: st[key]?.lastSync || null, lastSource: st[key]?.lastSource || null, fields: v.fields, example: v.example })),
    endpoints: { batch: 'POST /api/data/{dataset}/import  (JSON 数组 / NDJSON / CSV；?dryRun=1 预检)', stream: 'POST /api/data/{dataset}/stream  (NDJSON 逐行推入，适合 Kafka / Flink / 采集器 webhook)', mcp: 'data_import 工具', cli: 'brand import <file> --dataset <name> [--dry-run]' } }
}
