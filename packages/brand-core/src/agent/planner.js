/**
 * 离线智能体（harness-lite 规划器）：没有模型密钥时也能完整演示「路由 → 计划 → 调工具 → 核对 → 交付 → 人审 → 回写」。
 * 工具调用全部真实执行（数字来自算法层），模型只负责组织语言 —— 这里用模板组织语言，在线模式由 DeepSeek 组织。
 * 设计模式：总控路由（Router）+ 专家执行（Orchestrator-Workers）+ 技能 SOP + 工具层 + 校验闸门 + 人在环 + 回写沉淀。
 */
import { runTool } from '../tools.js'
import { experts } from '../modules.js'
import { listSkills } from '../skills.js'

export const SCENARIOS = [
  { id: 't2411', expert: 'analyst', skill: 'claim-gap-diagnosis', scene: 6, label: 'T-2411 主图卖点', prompt: '福临门主图要不要继续加码「非转基因」这个卖点？要能拿去立项会。', re: /非转基因|主图|加码|卖点.*(要不要|该不该)/ },
  { id: 'cat', expert: 'analyst', skill: 'claim-gap-diagnosis', scene: 5, label: '品类声量对比', prompt: '花生油和玉米油这两周声量差多少？差在哪里？', re: /花生油.*玉米油|玉米油.*花生油|品类.*(对比|声量)|油种.*对比/ },
  { id: 'guard', expert: 'brand', skill: 'competitor-guardrail', scene: 3, label: '竞品对比（护栏）', prompt: '福临门和金龙鱼的声量差多少？给我一个市场地位判断。', re: /金龙鱼|鲁花|胡姬花|竞品|市场地位|份额/ },
  { id: 'weekly', expert: 'brief', skill: 'edible-oil-weekly-brief', scene: 6, label: '第 46 周商情周报', prompt: '起草本周食用油商情周报（第 46 周），按技能说明来。', re: /周报|月报|商情/ },
  { id: 'opportunity', expert: 'product', skill: 'opportunity-evidence-pack', scene: 1, label: '立项证据包', prompt: '给我排一下产品机会，并为防漏抗摔包装生成立项证据包。', re: /机会|立项|证据包|漏油|包装改良|新品/ },
  { id: 'geo', expert: 'geo', skill: 'geo-fact-correction', scene: 4, label: 'AI 答案纠偏', prompt: '巡检一下 AI 平台怎么讲福临门，有错的起草纠偏素材。', re: /AI ?答案|GEO|豆包|Kimi|DeepSeek.*(说|讲)|纠偏|品牌事实|大模型推荐/i },
  { id: 'campaign', expert: 'activity', skill: 'campaign-review', scene: 7, label: '活动与渠道复盘', prompt: '复盘一下卖点在用户侧的复述情况，再看抖音渠道趋势能不能叫稳定增长。', re: /活动|投放|复盘|抖音|渠道|种草|达人/ },
  { id: 'annual', expert: 'lead', skill: 'fulinmen-annual-report', scene: 0, label: '2027 年度报告', prompt: '出一份 2027 福临门油脂电商经营报告的大纲草稿，调度各专家分工。', re: /年度|年报|2027|经营报告|全年/ },
  { id: 'data', expert: 'lead', skill: null, scene: 0, label: '数据接入', prompt: '现在有哪些数据源？我想把小红书新采的笔记推进来。', re: /数据源|导入|推入|接入|上传|数据流|更新数据/ },
  { id: 'capture', expert: 'lead', skill: null, scene: 0, label: '沉淀为技能', prompt: '把刚才这次分析的做法沉淀成一个技能。', re: /沉淀|写成技能|保存.*技能|技能.*(新建|沉淀|回写)/ },
  { id: 'overview', expert: 'lead', skill: null, scene: 0, label: '一屏巡检', prompt: '今天福临门整体情况怎么样？有没有异常？', re: /态势|巡检|异常|预警|整体|概况|今天|怎么样/ }
]

const MODULE_SCENARIO = { overview: 'overview', social: 't2411', brand: 'guard', ecommerce: 't2411', opportunity: 'opportunity', campaign: 'campaign', geo: 'geo', assistant: 'weekly', data: 'data', system: 'capture' }

export function route(message, { scenario, module } = {}) {
  if (scenario) return SCENARIOS.find(s => s.id === scenario) || SCENARIOS.at(-1)
  if (module && MODULE_SCENARIO[module]) return SCENARIOS.find(s => s.id === MODULE_SCENARIO[module])
  const text = String(message || '')
  return SCENARIOS.find(s => s.re.test(text)) || SCENARIOS.find(s => s.id === 'overview')
}

const fmt = n => typeof n === 'number' ? n.toLocaleString('zh-CN') : n
const nameOf = id => experts().find(e => e.id === id)?.name || id

/**
 * plan(message, opts) —— 异步生成器，逐个产出事件：
 * route / plan / step / think / tool / text / quotes / table / card / gate / deliverable / skill / suggest / done
 */
export async function* plan(message, opts = {}) {
  const sc = route(message, opts)
  const queue = []
  let wake
  const emit = e => { queue.push(e); wake?.() }
  const t0 = Date.now()
  const ctx = {
    emit,
    async call(name, args, { expert = sc.expert, transport = 'MCP' } = {}) {
      const id = 'tc' + Math.random().toString(36).slice(2, 8)
      emit({ type: 'tool', phase: 'start', id, name, args, expert, transport })
      const s = Date.now()
      try {
        const result = await runTool(name, args)
        emit({ type: 'tool', phase: 'end', id, name, args, expert, transport, ms: Date.now() - s + (opts.pace ? 300 : 0), result })
        return result
      } catch (e) { emit({ type: 'tool', phase: 'error', id, name, args, expert, transport, error: e.message }); throw e }
    },
    step: (i, status = 'done') => emit({ type: 'step', index: i, status })
  }
  const skill = sc.skill ? listSkills().find(s => s.name === sc.skill) : null
  emit({ type: 'route', scenario: sc.id, label: sc.label, expert: sc.expert, expertName: nameOf(sc.expert), skill: skill ? { name: skill.name, title: skill.title, version: skill.version } : null, scene: sc.scene })
  const runner = RUNNERS[sc.id](ctx, { message, sc, skill, history: opts.history || [] }).then(() => emit({ type: 'done', scenario: sc.id, ms: Date.now() - t0 }), e => emit({ type: 'error', message: e.message }))
  let finished = false
  runner.finally(() => { finished = true; wake?.() })
  while (true) {
    while (queue.length) { const e = queue.shift(); yield e; if (e.type === 'done' || e.type === 'error') return }
    if (finished && !queue.length) return
    await new Promise(r => { wake = r })
    wake = null
  }
}

const planEv = (ctx, steps) => ctx.emit({ type: 'plan', steps })
const text = (ctx, md) => ctx.emit({ type: 'text', md })
const think = (ctx, t) => ctx.emit({ type: 'think', text: t })

const RUNNERS = {
  async t2411(ctx) {
    think(ctx, '这是「卖点沟通」决策。拆成三问：消费者关心程度、品牌现在讲得怎样、两边差多少。社媒和电商两个口径都要取，不能只看声量。')
    planEv(ctx, ['查社媒声量与「非转基因」命中', '取原文判断声音来源', '查电商标题与有效评价两套口径', '查口碑标签「转基因关注」', '写结论卡并逐数溯源', '提交签发（人工闸门）'])
    const q = await ctx.call('insight_query', { brand: '福临门', keyword: ['非转基因'], days: 14 })
    const k = q.keywords[0]; ctx.step(0)
    text(ctx, `「非转基因」近两周命中 **${fmt(k.posts)} 条**，占福临门有效讨论 ${k.share}%，作者 ${fmt(k.authors)} 人，头号平台 ${k.topPlatform.name}（${k.topPlatform.n} 条）。但**规模不等于需求**——先看这些声音是谁发出来的。`)
    const ev = await ctx.call('insight_evidence', { brand: '福临门', keyword: ['非转基因'], days: 14, limit: 4 })
    ctx.emit({ type: 'quotes', items: ev.items }); ctx.step(1)
    text(ctx, `按互动取的 ${ev.returned} 条原文里有 **${ev.promoInSample} 条是促销 / 到货话术**；全量命中中促销话术占 ${k.promoShare}%。这个词在社媒上的体量主要来自渠道推货，不是消费者主动在谈。再看评价端。`)
    const e = await ctx.call('insight_query', { brand: '福临门', keyword: ['非转基因'], channel: 'ecommerce' }, { transport: 'API' })
    const g = e.keywords[0]; ctx.step(2)
    text(ctx, `两边对上：**品牌在标题里讲到 ${g.titleRate}%（${g.titleMentions}/${fmt(g.links)} 个在售链接），消费者在有效评价里主动提的只有 ${g.reviewRate}%（${fmt(g.reviewMentions)}/${fmt(g.validReviews)}），错位 ${g.gapPt} 个百分点。** 不是「讲得少」，是「讲了没人接」。`)
    const lab = await ctx.call('social_labels', { brand: '福临门', days: 14, group: '食品安全' })
    const gm = lab.labels.find(l => l.name === '转基因关注'); ctx.step(3)
    const card = await ctx.call('insight_compose', {
      taskId: 'T-2411', question: '福临门主图是否加码「非转基因」',
      oneLiner: `卖点已经讲满（标题 ${g.titleRate}%），但有效评价只有 ${g.reviewRate}% 主动提——问题在「讲了没人接」，加码应改讲法，不是加次数。`,
      findings: [
        { text: '消费者的主动提及远低于品牌自述', unit: 'pt', value: g.gapPt, source: { tool: 'insight_query', args: { brand: '福临门', keyword: ['非转基因'], channel: 'ecommerce' }, path: 'keywords[0].gapPt' } },
        { text: '社媒有真实规模，但主要由渠道促销稿推动', unit: ' 条', value: k.posts, source: { tool: 'insight_query', args: { brand: '福临门', keyword: ['非转基因'], days: 14 }, path: 'keywords[0].posts' } },
        { text: '「转基因关注」是食品安全类第一位的固定关注点', unit: '%', value: gm.coverRate, source: { tool: 'social_labels', args: { brand: '福临门', days: 14, group: '食品安全' }, path: `labels[${lab.labels.indexOf(gm)}].coverRate` } },
        { text: '有效评价分母（已剔除默认好评）', unit: ' 条', value: g.validReviews, source: { tool: 'insight_query', args: { brand: '福临门', keyword: ['非转基因'], channel: 'ecommerce' }, path: 'keywords[0].validReviews' } }
      ],
      recommendation: '不在主图上继续堆「非转基因」字样：①主图把标签改成一句可感知的解释（如「非转基因大豆 · 烟点高、煎炸不易起沫」）；②详情页把压榨工艺做成可视化；③主图改版做 2 周 A/B，验收看有效评价主动提及率是否从 ' + g.reviewRate + '% 抬升。',
      nextSteps: ['解释型主图 vs 标签型主图 A/B（2 周）', '详情页工艺可视化模块', '补小红书 / 黑猫投诉数据源，补齐负面样本缺口'],
      risks: [`负面样本仅 ${q.sentiment.neg} 条，不能据此判断「没有舆情风险」`, '社媒窗口 14 天，无法给环比', '标题提及率按链接数计，未按销量加权'],
      strength: '中'
    }, { transport: 'MCP' })
    ctx.step(4)
    ctx.emit({ type: 'card', card })
    text(ctx, `结论卡 ${card.trace.verified}/${card.trace.total} 个数字通过重放核对（每个都能点开看取自哪个字段）。签发是人工闸门：我准备好一切，但不替你做决定。`)
    const pub = await ctx.call('insight_publish', { cardId: card.cardId, confirm: false }, { expert: 'lead' })
    ctx.emit({ type: 'gate', cardId: card.cardId, status: pub.status, note: pub.note }); ctx.step(5, 'waiting')
    ctx.emit({ type: 'suggest', items: ['把这次分析沉淀成技能', '为非转基因标识生成立项证据包', '同样的方法看「日期新鲜」'] })
  },

  async cat(ctx) {
    think(ctx, '品类对比要看两侧：社媒是传播面、电商是转化面。只比一边容易得出反向结论。先过覆盖门槛。')
    planEv(ctx, ['双侧对比并过覆盖门槛', '拆解差距来自哪些平台', '给出可执行建议'])
    const c = await ctx.call('insight_compare', { dim: 'cat', values: ['花生油', '玉米油'], days: 14 })
    ctx.step(0)
    const [a, b] = c.sides
    text(ctx, `社媒侧花生油 ${fmt(a.socialPosts)} vs 玉米油 ${fmt(b.socialPosts)}（**${c.gaps.social.ratio} 倍**），但电商有效评价 ${a.validReviews} vs ${b.validReviews} 基本持平。**差距在传播面，不在货架面。**`)
    ctx.emit({ type: 'table', title: '差距来源（平台）', columns: ['平台', '花生油', '玉米油', '差', '结构性'], rows: c.gaps.drivers.map(d => [d.platform, d.a, d.b, d.diff, d.structural ? '是' : '否']) })
    ctx.step(1)
    const st = c.gaps.drivers.filter(d => d.structural).map(d => d.platform)
    text(ctx, `三条可执行：\n1. **玉米油优先补资讯场**（${st.join(' / ') || '今日头条 / 百家号'}）——玉米油几乎没有内容，是结构性空白，不是加预算能解决的\n2. **花生油查声量构成**：资讯稿占比偏高，确认非自然传播部分\n3. **周报纳入评价量**：只盯声量会持续高估花生油的实际转化`)
    ctx.step(2)
    ctx.emit({ type: 'suggest', items: ['把这次分析沉淀成技能', '看玉米油的卖点错位', '起草本周商情周报'] })
  },

  async guard(ctx) {
    think(ctx, '先看两侧覆盖率。竞品样本在这套语料里一直很薄，先判断能不能比，再决定说什么。')
    planEv(ctx, ['对比并过覆盖门槛', '判断能否给结论', '列出补数清单'])
    const c = await ctx.call('insight_compare', { dim: 'brand', values: ['福临门', '金龙鱼'], days: 14 })
    ctx.step(0); ctx.step(1)
    const j = c.sides[1]
    text(ctx, `**这个对比我不给结论。**\n\n金龙鱼在当前语料里社媒只有 ${j.socialPosts} 条、电商有效评价 ${j.validReviews} 条，工具已标成 ${j.coverage.social} / ${j.coverage.ecommerce} 并跳过差距计算（${c.skipped.join('；')}）。任何「福临门是金龙鱼的 N 倍」的说法，都是把采集覆盖缺口误读成市场份额。`)
    text(ctx, '能说的只有一句：**当前语料里金龙鱼几乎没有声量**——这反映采集覆盖，不是市场地位。要做真正的竞品对比，先补三件事：\n1. 社媒侧补竞品关键词采集（金龙鱼、鲁花、胡姬花），可走「数据接入 → 社媒内容」推入\n2. 电商侧补竞品链接与评价\n3. 补齐后用同一门槛重跑本对比')
    ctx.step(2)
    ctx.emit({ type: 'suggest', items: ['现在有哪些数据源？怎么推入竞品数据', '看福临门自身的品牌健康度'] })
  },

  async weekly(ctx) {
    think(ctx, '按技能「食用油商情周报」：五个栏目 + 建议不超过 3 条，每个数字附来源，起草后自检，提交分析师审核。')
    planEv(ctx, ['加载技能说明', '取数起草五个栏目', '自检：数字逐一对工具返回', '提交分析师审核'])
    await ctx.call('skill_get', { name: 'edible-oil-weekly-brief' }, { transport: 'Skill' })
    ctx.step(0)
    const r = await ctx.call('report_draft', { kind: 'weekly', week: 46, save: true }, { expert: 'brief', transport: 'API' })
    ctx.step(1)
    text(ctx, `周报草稿已生成，调用了 ${r.sources.length} 个工具，放在右侧交付物栏。状态：**${r.status}**——审核要点：数字可追溯、每条结论有证据、措辞合规、建议有负责部门。`)
    ctx.step(2)
    ctx.emit({ type: 'deliverable', kind: 'report', id: r.reportId, title: r.title, status: '待审核', markdown: r.markdown })
    ctx.step(3, 'waiting')
    ctx.emit({ type: 'suggest', items: ['把审核意见回写到周报技能', '展开「卖点」栏目的证据'] })
  },

  async opportunity(ctx) {
    think(ctx, '产品机会官：先评分排序，再为选中的机会生成立项证据包（评分拆解 + 原文 + 反例 + 验证计划）。')
    planEv(ctx, ['机会评分', '生成立项证据包 OP-001', '提交研究院真人验证'])
    const s = await ctx.call('opportunity_score', {}, { expert: 'product' })
    ctx.emit({ type: 'table', title: '产品机会排序（' + s.formula + '）', columns: ['编号', '机会', '机会分', '等级', '需求', '缺口', '可行性'], rows: s.opportunities.map(o => [o.id, o.name, o.score, o.grade, o.parts.demand, o.parts.gap, o.parts.feasibility]) })
    ctx.step(0)
    const p = await ctx.call('opportunity_pack', { id: 'OP-001' }, { expert: 'product' })
    ctx.step(1)
    text(ctx, `「${p.name}」机会分 ${p.score.score}：包装相关负面评价 **${p.evidence.sample.painReviews} 条**，是有效评价里第一位的痛点；但标题几乎不讲防漏（${p.score.evidence.titleRate}%）。同时存在 ${p.evidence.sample.counterHits} 条「没有漏油 / 包装完好」的反例——说明问题集中在部分渠道与物流环节，改良要先做运输验证。`)
    ctx.emit({ type: 'quotes', items: p.evidence.reviews.map(r => ({ platform: r.platform, date: r.date, sentiment: '负面', quote: r.quote })) })
    const md = [`# 立项证据包 · ${p.id} ${p.name}`, '', `机会分 **${p.score.score}**（需求 ${p.score.parts.demand} / 缺口 ${p.score.parts.gap} / 可行性 ${p.score.parts.feasibility}）`, '', '## 证据', ...p.evidence.reviews.map(r => `- ${r.platform} ${r.date}：「${r.quote}」`), '', '## 反例', ...p.evidence.counterExamples.map(r => `- ${r.platform} ${r.date}：「${r.quote}」`), '', `## 动作与负责人`, `- ${p.action}（${p.owner}）`, '', '## 验证计划', ...p.validation.map(v => `- ${v}`)].join('\n')
    ctx.emit({ type: 'deliverable', kind: 'pack', id: p.id, title: '立项证据包 · ' + p.name, status: '草稿', markdown: md })
    ctx.step(2, 'waiting')
    ctx.emit({ type: 'suggest', items: ['为 OP-003 非转基因标识也生成证据包', '把这次分析沉淀成技能'] })
  },

  async geo(ctx) {
    think(ctx, 'GEO 优化官：问题集巡检 → 用事实库诊断 → 起草纠偏素材。平台只对内运行，对外内容须品牌部审定。')
    planEv(ctx, ['巡检 AI 答案', '对照品牌事实库诊断', '起草纠偏素材', '提交品牌部审定'])
    const a = await ctx.call('geo_audit', {}, { expert: 'geo' })
    ctx.emit({ type: 'table', title: 'AI 答案巡检（' + a.source + '）', columns: ['问题', '平台', 'AI 说法', '判定', '严重度'], rows: a.questions.map(q => [q.q, q.platform, q.answer, q.verdict, q.severity]) })
    ctx.step(0); ctx.step(1)
    text(ctx, `巡检 ${a.total} 题，准确率 **${a.accuracy}%**、提及率 ${a.mentionRate}%，纠偏清单 ${a.correctionList.length} 条。最严重的是把福临门说成「民营企业」「益海嘉里旗下」——这两条事实库已审定，可以直接起草。`)
    const d = await ctx.call('geo_fact_draft', { questionId: 'Q-01' }, { expert: 'geo' })
    const d3 = await ctx.call('geo_fact_draft', { questionId: 'Q-03' }, { expert: 'geo' })
    ctx.step(2)
    text(ctx, `Q-03（花生油是否转基因）**不起草**：事实 ${d3.fact.id} 状态「${d3.fact.status}」，${d3.caveats[0]}。没有证据就不对外说话。`)
    ctx.emit({ type: 'deliverable', kind: 'geo', id: 'GEO-Q01', title: d.draft.title, status: '待品牌部审定', markdown: `# ${d.draft.title}\n\n**AI 错误说法（${d.platform}）**：${d.wrongAnswer}\n\n**事实**：${d.draft.body}\n\n**供给渠道**：\n${d.draft.channels.map(c => '- ' + c).join('\n')}\n\n**复测**：${d.draft.retest}\n\n> 合规：只用权威事实与优质内容，不批量投喂、不造假、不夸大。` })
    ctx.step(3, 'waiting')
    ctx.emit({ type: 'suggest', items: ['推入本周新的 AI 巡检结果', '把纠偏流程沉淀成技能'] })
  },

  async campaign(ctx) {
    think(ctx, '活动复盘官：品效分开算。先对照「品牌说 vs 用户说」，再看渠道趋势；增量没有投放数据就写未知。')
    planEv(ctx, ['卖点采纳率对照', '抖音渠道趋势与口径门禁', '结论与缺口'])
    const c = await ctx.call('campaign_review', {}, { expert: 'activity' })
    ctx.emit({ type: 'table', title: '品牌说 vs 用户说', columns: ['卖点', '标题表达%', '评价复述%', '社媒提及%', '采纳率'], rows: c.rows.map(r => [r.claim, r.brandSays, r.userSaysReview, r.userSaysSocial, r.adoption]) })
    ctx.step(0)
    const t = await ctx.call('channel_trend', {}, { expert: 'activity', transport: 'API' })
    ctx.emit({ type: 'chart', title: '抖音品牌销售额环比 %（1–10 月，接口返回值）', labels: t.months, values: t.salesMoM })
    ctx.step(1)
    const top = [...c.rows].sort((a, b) => b.adoption - a.adoption)[0]
    text(ctx, `**用户主动复述最多的是「${top.claim}」**（采纳率 ${top.adoption}），而品牌主推的「${c.rows[0].claim}」采纳率只有 ${c.rows[0].adoption}。\n\n抖音：${t.stability.reading}。10 月销售额 +12.94%、销量 ${t.octVolumeMoM}%，量额背离按结构变化处理。\n\n增量评估：**${c.increment.reason}**`)
    ctx.step(2)
    ctx.emit({ type: 'suggest', items: ['推入投放花费数据后重算增量', '起草本周商情周报'] })
  },

  async annual(ctx) {
    think(ctx, '总助手：这是年度经营计划任务，拆成 6 类决策，按章节分派给专家，汇总成大纲草稿，最后提交人审。')
    planEv(ctx, ['加载技能「年度 AI 报告」', '洞察分析师：基线诊断', '产品机会官：机会与动作包', '品牌追踪官：品牌健康度', '活动复盘官：渠道趋势', 'GEO 优化官：AI 答案', '商情简报员：汇编草稿并提交人审'])
    await ctx.call('skill_get', { name: 'fulinmen-annual-report' }, { transport: 'Skill' }); ctx.step(0)
    const ov = await ctx.call('overview_snapshot', {}, { expert: 'analyst' })
    const gap = await ctx.call('ec_claim_gap', {}, { expert: 'analyst' }); ctx.step(1)
    const opp = await ctx.call('opportunity_score', {}, { expert: 'product' }); ctx.step(2)
    const bh = await ctx.call('brand_health', {}, { expert: 'brand' }); ctx.step(3)
    const tr = await ctx.call('channel_trend', {}, { expert: 'activity' }); ctx.step(4)
    const geo = await ctx.call('geo_audit', {}, { expert: 'geo' }); ctx.step(5)
    const md = [
      '# 2027 福临门油脂电商经营报告（大纲草稿）', '', '> 总助手调度 5 位专家协作起草 · 状态：待分析师审核 · 品牌部审定后签发', '',
      '## 第 1 章 报告是怎么生成的', '- 五步闭环：定问题 → 找证据 → 出洞察 → 做判断 → 回写沉淀', `- 数据：社媒 ${fmt(ov.social.posts)} 条有效讨论；电商 ${fmt(ov.ecommerce.links)} 条链接 / ${fmt(ov.ecommerce.reviews)} 条评论，其中有效文字评价 ${fmt(ov.ecommerce.validReviews)} 条（${ov.ecommerce.validRate}%）`, '',
      '## 第 2 章 2026 品类诊断（洞察分析师）', ...gap.claims.slice(0, 3).map(c => `- 卖点错位「${c.claim}」：标题 ${c.titleRate}% vs 评价 ${c.reviewRate}%（${c.reading}）`), ...gap.claims.filter(c => c.gapPt < 0).map(c => `- 反向错位「${c.claim}」：消费者在意、标题少写（${c.reviewRate}% vs ${c.titleRate}%）`), '',
      '## 第 3 章 2027 产品与运营计划（产品机会官 · 活动复盘官）', ...opp.opportunities.map(o => `- ${o.id} ${o.name}：机会分 ${o.score}（${o.grade}）— ${o.action}｜${o.owner}`), `- 抖音：${tr.stability.reading}；油脂走「商品卡」承接（10 月商品卡占比 ${tr.octMix.find(m => m.metric === '商品卡占比').oil}）`, '',
      '## 第 4 章 品牌与 AI 答案（品牌追踪官 · GEO 优化官）', `- NSR ${bh.social.nsr}%，母品牌「中粮」在讨论中出现率 ${bh.endorsement.share}%`, `- AI 答案准确率 ${geo.accuracy}%，纠偏清单 ${geo.correctionList.length} 条`, '',
      '## 第 5 章 可落地性与验收', '- 基线（2026 测试样本）→ 2027 季度目标 → 三层验收', '- 数据缺口清单：竞品采集、投放花费、销售额（当前均「未接入」，对应结论写「未知」）'
    ].join('\n')
    ctx.emit({ type: 'deliverable', kind: 'report', id: 'Y-2027', title: '2027 福临门油脂电商经营报告（大纲）', status: '待审核', markdown: md })
    ctx.step(6, 'waiting')
    text(ctx, '大纲已汇编到右侧。五位专家各自负责的章节都带了工具来源；数据缺口（竞品、投放、销售额）明确标为「未知」，不估算。')
    ctx.emit({ type: 'suggest', items: ['展开第 3 章动作包', '起草本周商情周报'] })
  },

  async data(ctx) {
    think(ctx, '数据接入：先看各数据集现状，再说明批量导入与数据流推入两种方式；所有新数据都过四道筛。')
    planEv(ctx, ['查看数据源状态', '说明接入方式', '预检一条样例数据'])
    const d = await ctx.call('data_sources', {}, { transport: 'API' })
    ctx.emit({ type: 'table', title: '数据源', columns: ['数据集', '模块', '当前条数', '增量', '基线', '最近同步'], rows: d.datasets.map(x => [x.name, x.module, x.rows, x.increments, x.baseline, x.lastSync ? x.lastSync.slice(0, 16).replace('T', ' ') : '—']) })
    ctx.step(0)
    text(ctx, `两种接入方式，同一套质检：\n1. **批量导入**：\`${d.endpoints.batch}\`，也可以在右侧「数据」面板直接粘贴 CSV\n2. **数据流推入**：\`${d.endpoints.stream}\`，采集器 / 消息队列逐行推送，入库即参与计算\n\n智能体侧对应 MCP 工具 \`data_import\`，命令行 \`${d.endpoints.cli}\`。`)
    ctx.step(1)
    const pre = await ctx.call('data_import', { dataset: 'social_posts', dryRun: true, source: '小红书采集器（样例）', records: [d.datasets[0].example, { text: '今天天气不错', date: '2026-11-03', platform: '小红书' }, { text: '福临门', date: '11-03', platform: '小红书' }] }, { transport: 'API' })
    ctx.step(2)
    text(ctx, `预检样例：收到 ${pre.received} 条，通过 **${pre.accepted}** 条；${Object.entries(pre.rejected).map(([k, v]) => `${k}拦截 ${v.count} 条（${v.samples[0].reason}）`).join('；')}。预检不入库，确认后去掉 dryRun 即写入。`)
    ctx.emit({ type: 'deliverable', kind: 'data', id: 'DATA', title: '数据接入面板', status: '可用' })
    ctx.emit({ type: 'suggest', items: ['推入后重跑 T-2411 看数字变化', '今天福临门整体情况怎么样？'] })
  },

  async capture(ctx, { history }) {
    think(ctx, '把一次成功的分析沉淀成技能说明：何时使用、可用工具、步骤、约束、输出。技能是文字，业务能读能改；保存是写操作，需要你确认。')
    planEv(ctx, ['回看本次会话的工具链', '起草技能说明', '确认后写入技能库（留痕）'])
    const tools = [...new Set(history.flatMap(h => h.tools || []))]
    const used = tools.length ? tools : ['insight_query', 'insight_evidence', 'social_labels', 'insight_compose', 'insight_publish']
    const topic = history.at(-1)?.label || '卖点沟通诊断'
    ctx.step(0)
    const name = 'my-' + (history.at(-1)?.scenario || 'claim') + '-playbook'
    const content = `---\nname: ${name}\ndescription: 由一次「${topic}」分析沉淀的工作方法；适用于同类卖点 / 话题判断\ntitle: ${topic} · 工作方法\nversion: v0.1\nowner: 我（待指定维护人）\nexpert: analyst\nboard: 食用油\ntools: [${used.join(', ')}]\ntrigger: 品牌经理交办同类判断时\n---\n\n# ${topic} · 工作方法\n\n## 何时使用\n- 业务要判断「某个卖点 / 话题要不要加码」时\n\n## 可用工具\n${used.map(t => '- `' + t + '`').join('\n')}\n\n## 步骤\n1. 社媒查声量与关键词命中，同时看促销话术占比\n2. 取原文，判断声音来自消费者还是渠道\n3. 电商查「标题提及率 vs 有效评价主动提及率」，两套分母不混算\n4. 口碑标签核对关注度\n5. 写结论卡，每个数字带 source，溯源率 100% 才可提交\n6. 提交签发，由品牌经理确认\n\n## 约束\n- 没有依据写「未知」，不推测\n- 负面样本 < 50 条不做负向结论\n- 未经审核不得签发\n\n## 输出\n- 结论卡（一句话结论 + 4 条依据 + 建议 + 风险）\n`
    await ctx.call('skill_save', { name, content, author: '演示用户', note: '由会话沉淀', confirm: false }, { transport: 'MCP' })
    ctx.step(1)
    ctx.emit({ type: 'skill', name, content, status: 'needs_confirmation' })
    text(ctx, `技能说明草稿 \`${name}\` 已放到右侧，可以直接改文字。点「确认写入技能库」后会记录修订人与版本；下次任何人交办同类问题，智能体都按这份说明来做。`)
    ctx.step(2, 'waiting')
  },

  async overview(ctx) {
    think(ctx, '总助手：先做一屏巡检，再看预警；有异常再分派专家。')
    planEv(ctx, ['综合态势一屏巡检', '异常预警', '分派建议'])
    const o = await ctx.call('overview_snapshot', { brand: '福临门', days: 14 })
    ctx.emit({ type: 'kpis', items: [['社媒有效讨论', fmt(o.social.posts), '条'], ['NSR', o.social.nsr, '%'], ['有效文字评价', fmt(o.ecommerce.validReviews), '条'], ['有效评价率', o.ecommerce.validRate, '%'], ['最大卖点错位', o.biggestGap.gapPt, 'pt']] })
    ctx.step(0)
    const al = await ctx.call('overview_alerts', { brand: '福临门', days: 14 }, { expert: 'brand' })
    ctx.emit({ type: 'chart', title: '日声量（条）', labels: al.series.map(d => d.date.slice(5)), values: al.series.map(d => d.posts) })
    ctx.step(1)
    text(ctx, `近 14 天 **${fmt(o.social.posts)} 条**有效讨论，NSR ${o.social.nsr}%。预警 ${al.alerts.length} 条：${al.alerts.slice(0, 2).map(a => `[${a.level}] ${a.detail}`).join('；')}。\n\n建议分派：\n- 洞察分析师 → 「${o.biggestGap.claim}」卖点错位 ${o.biggestGap.gapPt}pt、「${o.reverseGap.claim}」反向错位\n- 产品机会官 → ${o.topOpportunities[0].id} ${o.topOpportunities[0].name}（${o.topOpportunities[0].score} 分）\n- 品牌追踪官 → ${al.alerts[0]?.detail.slice(0, 10) || '无'} 声量抬升来源核查`)
    ctx.step(2)
    ctx.emit({ type: 'suggest', items: ['福临门主图要不要继续加码「非转基因」？', '给我排一下产品机会', '起草本周商情周报'] })
  }
}
