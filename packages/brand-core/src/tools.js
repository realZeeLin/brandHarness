/**
 * 工具注册表 —— 九大模块的「工具身份」单一真源。
 * 同一份定义被四种表面复用：DeepSeek Harness 插件（defineTool）、MCP（tools/list）、HTTP API（/api/tools/:name）、CLI（brand call）。
 * parameters 采用 DSH ParameterSchemaSpec 写法（属性级 required: true），toJsonSchema() 投影为标准 JSON Schema。
 */
import * as S from './social.js'
import * as E from './ecommerce.js'
import * as M from './modules.js'
import * as R from './report.js'
import * as K from './skills.js'
import { auditLog } from './audit.js'
import * as I from './ingest.js'

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const strs = description => ({ type: 'array', items: { type: 'string' }, description })
const bool = description => ({ type: 'boolean', description })
const days = num('时间窗天数，默认 14（数据窗口 2026-10-19 → 2026-11-01）')
const brand = str('品牌，默认「福临门」')

export const MODULES = [
  { key: 'overview', name: '综合态势', icon: 'home', desc: '全局指标一屏巡检、找异常' },
  { key: 'social', name: '社媒聆听', icon: 'sm', desc: '声量、话题、原文样本、口碑标签' },
  { key: 'brand', name: '品牌追踪', icon: 'bt', desc: '品牌健康度、母子协同、竞品对比（带覆盖门槛）' },
  { key: 'ecommerce', name: '电商分析', icon: 'ec', desc: '有效评价、卖点错位、痛点、价格偏离' },
  { key: 'opportunity', name: '产品机会挖掘', icon: 'pi', desc: '机会评分、立项证据包' },
  { key: 'campaign', name: '营销活动评估', icon: 'mk', desc: '品牌说 vs 用户说、渠道趋势' },
  { key: 'geo', name: 'GEO 管理', icon: 'geo', desc: 'AI 答案巡检、品牌事实素材' },
  { key: 'assistant', name: 'AI 助手 · 交付', icon: 'ai', desc: '结论卡、报告起草、签发闸门' },
  { key: 'data', name: '数据接入', icon: 'data', desc: '批量导入、数据流推入、四道筛质检' },
  { key: 'system', name: '系统管理', icon: 'admin', desc: '指标字典、留痕、技能库' }
]

const T = []
const def = (name, o) => T.push({ name, ...o })

def('overview_snapshot', { module: 'overview', title: '一屏巡检', expert: 'lead', readOnly: true, description: '综合态势：社媒总量与 NSR、电商有效评价、机会 TOP、最大卖点错位与预警，一次返回。', parameters: { brand, days }, run: a => M.overviewSnapshot(a) })
def('overview_alerts', { module: 'overview', title: '找异常', expert: 'brand', readOnly: true, description: '按日声量 z-score 与负面内容生成预警清单（只在内部提示，不外推）。', parameters: { brand, days }, run: a => M.overviewAlerts(a) })
def('insight_query', { module: 'social', title: '查声量与话题', expert: 'analyst', readOnly: true, description: '查询品牌声量、作者、互动、情感与 NSR、平台分布、关键词命中（含促销话术占比）。channel=ecommerce 时改查「标题提及率 vs 有效评价主动提及率」。', parameters: { brand, keyword: strs('关键词，如 ["非转基因"]'), days, platform: str('平台过滤，如 快手'), cat: str('油种过滤，如 花生油'), channel: str('social（默认）或 ecommerce', { enum: ['social', 'ecommerce'] }) }, run: a => a.channel === 'ecommerce' ? E.ecQuery(a) : S.socialQuery(a) })
def('insight_evidence', { module: 'social', title: '取原文样本', expert: 'analyst', readOnly: true, description: '按关键词取社媒原文（按互动排序，标注是否促销话术），附电商有效评价旁证条数。只回原文，不做二次摘要。', parameters: { brand, keyword: { ...strs('关键词'), required: true }, days, limit: num('返回条数，默认 4，最多 20'), sentiment: str('情感过滤：正面 / 中性 / 负面'), platform: str('平台过滤') }, run: a => S.socialEvidence(a) })
def('social_labels', { module: 'social', title: '口碑标签命中', expert: 'analyst', readOnly: true, description: '口碑标签体系 V1.1（8 类 44 项）在窗口内的覆盖率；零命中标签进入数据缺口清单。', parameters: { brand, days, group: str('只看某一大类，如 食品安全') }, run: a => S.socialLabels(a) })
def('insight_compare', { module: 'brand', title: '竞品 / 品类对比', expert: 'brand', readOnly: true, description: '品牌、油种或平台对比。覆盖门槛：社媒 ≥100 条、电商有效评价 ≥200 条，不达标一侧进入 skipped、不输出倍数（verdict=refuse 时必须拒绝给结论）。', parameters: { dim: { ...str('对比维度', { enum: ['brand', 'cat', 'platform'] }), required: true }, values: { ...strs('对比对象，2 个'), required: true }, days }, run: a => S.compare(a) })
def('brand_health', { module: 'brand', title: '品牌健康度', expert: 'brand', readOnly: true, description: '品牌体检：NSR、负面占比、母品牌「中粮」背书出现率、卖点 / 场景 / 风险结构、货架口碑。', parameters: { brand, days }, run: a => M.brandHealth(a) })
def('ec_overview', { module: 'ecommerce', title: '货架概览', expert: 'analyst', readOnly: true, description: '各平台链接数、评论数、有效评价率、默认好评率、价格中位与负面率。', parameters: { platform: str('京东 或 淘宝/天猫') }, run: a => E.ecOverview(a) })
def('ec_claim_gap', { module: 'ecommerce', title: '算卖点错位', expert: 'analyst', readOnly: true, description: '卖点错位差值 = 标题提及率 − 有效评价主动提及率。默认计算 7 个标准卖点，也可传自定义 claims。', parameters: { claims: strs('自定义卖点词'), platform: str('平台过滤') }, run: a => E.claimGap(a) })
def('ec_pain_points', { module: 'ecommerce', title: '查痛点', expert: 'analyst', readOnly: true, description: '有效评价中的负面观点构成（规则词典 + 否定窗口），附原文样本。', parameters: { platform: str('平台过滤'), limit: num('每个痛点的样本数，默认 3') }, run: a => E.painPoints(a) })
def('ec_price_audit', { module: 'ecommerce', title: '价格偏离巡检', expert: 'analyst', readOnly: true, description: '单升价相对油种基准的偏离分布、规格价差与极端链接。', parameters: {}, run: () => E.priceAudit() })
def('opportunity_score', { module: 'opportunity', title: '机会评分', expert: 'product', readOnly: true, description: '按 KSPEC-PI-01 计算产品机会分（需求强度 / 表达缺口 / 可行性）。', parameters: { ids: strs('机会编号，如 ["OP-001"]') }, run: a => M.opportunityScore(a) })
def('opportunity_pack', { module: 'opportunity', title: '生成立项证据包', expert: 'product', readOnly: true, description: '为一个机会生成立项证据包：评分拆解、评价与社媒原文、反例、验证计划。', parameters: { id: { ...str('机会编号 OP-001 / OP-002 / OP-003'), required: true } }, run: a => M.opportunityPack(a) })
def('campaign_review', { module: 'campaign', title: '品牌说 vs 用户说', expert: 'activity', readOnly: true, description: '卖点采纳率对照（标题表达 vs 评价 / 社媒自然复述）；增量评估需投放数据，未接入时返回 unknown。', parameters: { claims: strs('自定义卖点词') }, run: a => M.campaignReview(a) })
def('channel_trend', { module: 'campaign', title: '渠道趋势（抖音）', expert: 'activity', readOnly: true, description: '抖音 1–10 月销售额环比与 10 月米油渠道结构，附四条口径门禁（区间值不估算、不推同比）。', parameters: {}, run: () => M.channelTrend() })
def('geo_audit', { module: 'geo', title: '查 AI 答案', expert: 'geo', readOnly: true, description: '巡检通用 AI / 电商 AI 导购 / 社媒 AI 搜索中关于福临门的答案：准确率、提及率与纠偏清单。', parameters: { platform: str('平台过滤，如 DeepSeek') }, run: a => M.geoAudit(a) })
def('geo_fact_draft', { module: 'geo', title: '起草事实素材', expert: 'geo', readOnly: true, description: '依据品牌事实库为一条错误答案起草纠偏素材（草稿，须品牌部审定后对外供给）。', parameters: { questionId: { ...str('巡检问题编号，如 Q-01'), required: true } }, run: a => M.geoFactDraft(a) })
def('insight_compose', { module: 'assistant', title: '出结论卡', expert: 'analyst', readOnly: true, description: '把发现写成结论卡。每条 finding 必须带 source{tool,args,path}，系统会重放该工具核对数值；溯源率低于 100% 的卡被拒绝签发。', parameters: { question: { ...str('业务问题'), required: true }, oneLiner: str('一句话结论'), findings: { type: 'array', required: true, description: '[{text, value, unit, source:{tool, args, path}}]', items: { type: 'json' } }, recommendation: str('建议'), nextSteps: strs('下一步'), risks: strs('风险与前提'), strength: str('结论强度：高 / 中 / 低'), taskId: str('任务编号，如 T-2411') }, run: a => R.compose(runTool, a) })
def('insight_publish', { module: 'assistant', title: '签发（人工闸门）', expert: 'lead', readOnly: false, description: '唯一的写盘工具。不带 confirm 只返回 needs_confirmation 预览；签发须人确认并填写 reviewer，落盘带 sha256 与留痕。', parameters: { cardId: { ...str('结论卡编号'), required: true }, confirm: bool('人工确认签发'), reviewer: str('审核人') }, run: a => R.publish(a) })
def('report_draft', { module: 'assistant', title: '起草周报 / 年报', expert: 'brief', readOnly: true, description: '按技能说明取数起草食用油商情周报（五个栏目 + 建议 ≤3 条 + 证据附录），状态 needs_review。', parameters: { kind: str('weekly 或 annual', { enum: ['weekly', 'annual'] }), week: num('周次，默认 46'), save: bool('是否保存草稿到 workspace/reports') }, run: a => R.reportDraft(runTool, a) })
def('dict_lookup', { module: 'system', title: '查字典口径', expert: 'lead', readOnly: true, description: '查询 KSPEC 指标口径：定义、分母与注意事项。', parameters: { q: str('关键词，如 NSR、卖点错位') }, run: a => M.dictLookup(a) })
def('audit_log', { module: 'system', title: '查留痕', expert: 'lead', readOnly: true, description: '查询签发、技能修订、报告起草等写操作留痕。', parameters: { limit: num('条数，默认 20'), action: str('动作前缀，如 card / skill') }, run: a => auditLog(a) })
def('skill_list', { module: 'system', title: '技能清单', expert: 'lead', readOnly: true, description: '列出技能库中的技能说明（名称、版本、维护人、可用工具）。', parameters: {}, run: () => ({ skills: K.listSkills() }) })
def('skill_get', { module: 'system', title: '读技能说明', expert: 'lead', readOnly: true, description: '读取一份技能说明全文与修订记录。', parameters: { name: { ...str('技能名（kebab-case）'), required: true } }, run: a => K.getSkill(a) })
def('skill_save', { module: 'system', title: '沉淀 / 修订技能', expert: 'lead', readOnly: false, description: '新建或修订技能说明（SKILL.md）。写操作：不带 confirm 只返回预检结果；确认后写入并记录修订人与说明。', parameters: { name: { ...str('技能名（kebab-case）'), required: true }, content: { ...str('完整 SKILL.md（含 frontmatter name / description / version）'), required: true }, author: str('修订人'), note: str('修订说明'), confirm: bool('确认写入') }, run: a => K.saveSkill(a) })

def('data_sources', { module: 'data', title: '数据源状态', expert: 'lead', readOnly: true, description: '各数据集基线规模、增量条数、最近同步时间与接入方式（批量导入 / 数据流推入）。', parameters: {}, run: () => I.dataSources() })
def('data_import', { module: 'data', title: '导入 / 推入数据', expert: 'lead', readOnly: false, description: '向数据集导入记录（JSON 数组 / NDJSON / CSV 文本）。每条过四道筛（结构、去重、去无效、相关性）。dryRun=true 只出质检报告；正式写入后算法层立即使用新数据。', parameters: { dataset: { ...str('数据集', { enum: Object.keys(I.DATASETS) }), required: true }, records: { type: 'array', items: { type: 'json' }, description: '记录数组（与 payload 二选一）' }, payload: str('原始文本（CSV / NDJSON / JSON）'), format: str('csv / ndjson / json，缺省自动识别'), dryRun: bool('只预检不入库'), source: str('来源标识，如 小红书采集器') }, run: a => I.importRecords({ ...a, mode: 'batch' }) })

export const TOOLS = T
export const getTool = name => T.find(t => t.name === name)

/** 轻量参数校验（DSH 侧由 defineTool 做严格校验）。 */
export function validate(tool, args) {
  const errs = []
  for (const [k, spec] of Object.entries(tool.parameters)) {
    const v = args[k]
    if (v === undefined || v === null) { if (spec.required) errs.push(`缺少必填参数 ${k}`); continue }
    const t = spec.type
    if (t === 'string' && typeof v !== 'string') errs.push(`${k} 应为字符串`)
    if (t === 'number' && typeof v !== 'number') errs.push(`${k} 应为数字`)
    if (t === 'boolean' && typeof v !== 'boolean') errs.push(`${k} 应为布尔值`)
    if (t === 'array' && !Array.isArray(v)) errs.push(`${k} 应为数组`)
    if (spec.enum && !spec.enum.includes(v)) errs.push(`${k} 只能取 ${spec.enum.join(' / ')}`)
  }
  return errs
}

export async function runTool(name, args = {}) {
  const tool = getTool(name)
  if (!tool) throw new Error(`未知工具 ${name}。可用：${T.map(t => t.name).join(', ')}`)
  const a = args && typeof args === 'object' ? args : {}
  const errs = validate(tool, a)
  if (errs.length) throw new Error(`参数错误（${name}）：${errs.join('；')}`)
  return await tool.run(a)
}

const toNode = spec => {
  if (spec.type === 'json') return {}
  const { required, ...rest } = spec
  if (rest.type === 'array') return { ...rest, items: rest.items ? toNode(rest.items) : {} }
  if (rest.type === 'object') return { ...rest, properties: Object.fromEntries(Object.entries(rest.properties || {}).map(([k, v]) => [k, toNode(v)])) }
  return rest
}
/** ParameterSchemaSpec → JSON Schema（MCP / OpenAI function calling 使用）。 */
export function toJsonSchema(parameters) {
  return { type: 'object', properties: Object.fromEntries(Object.entries(parameters).map(([k, v]) => [k, toNode(v)])), required: Object.entries(parameters).filter(([, v]) => v.required).map(([k]) => k), additionalProperties: false }
}
export const catalog = () => T.map(t => ({ name: t.name, title: t.title, module: t.module, expert: t.expert, readOnly: t.readOnly, description: t.description, inputSchema: toJsonSchema(t.parameters) }))
