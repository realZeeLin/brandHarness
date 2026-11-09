/** 结论卡（数字逐一溯源）、签发闸门、周报 / 年报起草。run(name,args) 由工具注册表注入。 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceDir } from './dataset.js'
import { audit, sha256 } from './audit.js'

export function getPath(obj, path) {
  return String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj)
}
const fmt = (v, unit = '') => (typeof v === 'number' ? v.toLocaleString('zh-CN') : String(v)) + unit
const cardsDir = () => join(workspaceDir(), 'cards')

/** insight_compose：每个数字必须指回某次工具返回的字段；系统重放该工具核对，指不到就拒发。 */
export async function compose(run, { question, oneLiner = '', findings = [], recommendation = '', nextSteps = [], risks = [], strength, taskId } = {}) {
  if (!question) throw new Error('question 必填')
  if (!findings.length) throw new Error('findings 至少 1 条，每条含 text / value / source{tool,args,path}')
  const caveats = new Set(), verified = []
  for (const f of findings) {
    const src = f.source || {}
    let actual, ok = false, error
    try {
      const res = await run(src.tool, src.args || {})
      actual = getPath(res, src.path)
      ok = actual !== undefined && (f.value === undefined || String(actual) === String(f.value) || Number(actual) === Number(f.value))
      for (const c of res?.caveats || []) caveats.add(c)
    } catch (e) { error = e.message }
    verified.push({ ...f, value: f.value ?? actual, actual, verified: ok, error, display: fmt(f.value ?? actual, f.unit || '') })
  }
  const okN = verified.filter(f => f.verified).length
  const rate = Math.round(okN / verified.length * 100)
  const id = taskId || 'C-' + sha256(question + Date.now()).slice(0, 6).toUpperCase()
  const card = {
    cardId: id, question, oneLiner, findings: verified, recommendation, nextSteps, risks,
    strength: rate < 100 ? '不可签发' : (strength || '中'),
    trace: { verified: okN, total: verified.length, rate },
    caveats: [...caveats], status: rate === 100 ? 'draft' : 'rejected',
    createdAt: new Date().toISOString()
  }
  mkdirSync(cardsDir(), { recursive: true })
  writeFileSync(join(cardsDir(), id + '.json'), JSON.stringify(card, null, 2))
  audit({ action: 'card.compose', target: id, detail: { trace: card.trace, status: card.status } })
  return card
}

export function cardMarkdown(card) {
  const lines = [`## ${card.cardId} · ${card.question}`, '', `**一句话结论**：${card.oneLiner}`, '', `**结论强度**：${card.strength}　**数字溯源**：${card.trace.verified}/${card.trace.total}`, '', '### 结论与依据']
  card.findings.forEach((f, i) => lines.push(`${i + 1}. **${f.text}** — ${f.display}`, `   - 来源：\`${f.source.tool}\` → \`${f.source.path}\`${f.verified ? ' ✓' : ' ✗ 未通过核对'}`))
  if (card.recommendation) lines.push('', '### 建议', card.recommendation)
  if (card.nextSteps?.length) lines.push('', '### 下一步', ...card.nextSteps.map(s => `- ${s}`))
  if (card.risks?.length) lines.push('', '### 风险与前提', ...card.risks.map(s => `- ${s}`))
  if (card.caveats?.length) lines.push('', '### 口径说明', ...card.caveats.map(s => `- ${s}`))
  return lines.join('\n')
}

/** insight_publish：唯一的写盘工具；没有 confirm 只生成预览。 */
export function publish({ cardId, confirm = false, reviewer = '' } = {}) {
  const f = join(cardsDir(), cardId + '.json')
  if (!existsSync(f)) throw new Error(`结论卡不存在：${cardId}（先调用 insight_compose）`)
  const card = JSON.parse(readFileSync(f, 'utf8'))
  if (card.status === 'rejected') return { status: 'refused', cardId, reason: `数字溯源 ${card.trace.verified}/${card.trace.total}，低于 100% 不得签发` }
  if (!confirm) return { status: 'needs_confirmation', cardId, written: false, preview: cardMarkdown(card).slice(0, 600), note: '签发是人工闸门：须由分析师 / 品牌经理确认（confirm=true，并填写 reviewer）' }
  if (!reviewer) return { status: 'needs_reviewer', cardId, written: false, note: '签发须填写审核人' }
  const out = join(workspaceDir(), 'insights'); mkdirSync(out, { recursive: true })
  const signed = { ...card, status: 'published', reviewer, publishedAt: new Date().toISOString() }
  const hash = sha256(signed)
  writeFileSync(join(out, cardId + '.json'), JSON.stringify({ ...signed, sha256: hash }, null, 2))
  writeFileSync(join(out, cardId + '.md'), cardMarkdown(signed) + `\n\n---\n签发：${reviewer} · ${signed.publishedAt} · sha256 ${hash.slice(0, 16)}…\n`)
  const rec = audit({ action: 'card.publish', target: cardId, actor: reviewer, detail: { sha256: hash } })
  return { status: 'published', cardId, written: true, sha256: hash, reviewer, auditId: rec.id, file: `workspace/insights/${cardId}.md` }
}

/** report_draft：按技能说明取数起草周报 / 年报；每节附来源。 */
export async function reportDraft(run, { kind = 'weekly', week = 46, save = false } = {}) {
  const src = []
  const call = async (tool, args = {}) => { const r = await run(tool, args); src.push({ tool, args }); return r }
  const q = await call('insight_query', { brand: '福临门', days: 14 })
  const labels = await call('social_labels', { days: 14 })
  const gap = await call('ec_claim_gap', {})
  const price = await call('ec_price_audit', {})
  const cmp = await call('insight_compare', { dim: 'brand', values: ['福临门', '金龙鱼'], days: 14 })
  const alerts = await call('overview_alerts', { days: 14 })
  const geo = await call('geo_audit', {})
  const rev = gap.claims.filter(c => c.gapPt < 0)
  const sections = [
    { h: '声量与话题', items: [`近 14 天福临门有效讨论 ${q.posts.toLocaleString()} 条，作者 ${q.authors.toLocaleString()} 人，NSR ${q.nsr}%（负面 ${q.sentiment.neg} 条，样本少，负向结论谨慎）`, `平台前三：${q.platforms.slice(0, 3).map(p => `${p.name} ${p.n}`).join(' · ')}`, `口碑标签第一大类：${labels.groups[0].group}（${labels.groups[0].posts} 次命中，代表标签「${labels.groups[0].top}」）；零命中标签 ${labels.dataGaps.length} 个记入数据缺口`] },
    { h: '卖点', items: rev.map(c => `「${c.claim}」评价提及 ${c.reviewRate}% 高于标题 ${c.titleRate}%（差 ${Math.abs(c.gapPt)}pt），建议详情页首屏补充`).concat([`「${gap.claims[0].claim}」标题 ${gap.claims[0].titleRate}% vs 评价 ${gap.claims[0].reviewRate}%，建议从卖点降级为信任状`]) },
    { h: '价格', items: price.highest.slice(0, 2).map(h => `${h.platform}「${h.shop}」${h.cat} 单升价 ¥${h.pricePerL}，为基准 ${h.ratio} 倍（第三方虚高）`) },
    { h: '竞品', items: [cmp.verdict === 'refuse' ? `竞品对比不出结论：${cmp.skipped.join('；')}——属采集覆盖缺口，不代表市场份额` : '竞品对比见附表'] },
    { h: '风险与 AI 答案', items: [...alerts.alerts.slice(0, 2).map(a => `[${a.level}] ${a.type}：${a.detail}`), `AI 答案巡检 ${geo.total} 题，准确率 ${geo.accuracy}%，纠偏清单 ${geo.correctionList.length} 条（Demo 构造案例）`] },
    { h: '本周建议（≤3 条）', items: [`详情页首屏补「${rev[0]?.claim || '日期新鲜'}」表达 — 电商运营部`, '「中粮背书」「一级品质」移至主图第二屏作为信任状 — 品牌部', `AI 答案纠偏清单 ${geo.correctionList.length} 条提交品牌部审定 — GEO 优化官`] }
  ]
  const title = kind === 'weekly' ? `食用油商情周报 · 第 ${week} 周（福临门）` : '2027 福临门油脂电商经营报告（大纲草稿）'
  const md = [`# ${title}`, '', `> 状态：**待分析师审核**　|　窗口 ${q.window.start} → ${q.window.end}　|　由「商情简报员」按技能 edible-oil-weekly-brief 起草`, '']
    .concat(sections.flatMap(s => [`## ${s.h}`, ...s.items.map(i => `- ${i}`), '']))
    .concat(['## 证据附录', ...src.map((s, i) => `${i + 1}. \`${s.tool}\` ${JSON.stringify(s.args)}`), '', '## 审核要点', '- 数字可追溯到工具返回', '- 每条结论有证据', '- 措辞合规、无不当比较', '- 建议可执行、有负责部门']).join('\n')
  const id = (kind === 'weekly' ? 'W' : 'Y') + '-' + (kind === 'weekly' ? week : 2027)
  if (save) { const d = join(workspaceDir(), 'reports'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, id + '.md'), md); audit({ action: 'report.draft', target: id, detail: { kind } }) }
  return { reportId: id, title, status: 'needs_review', sections, markdown: md, sources: src }
}
