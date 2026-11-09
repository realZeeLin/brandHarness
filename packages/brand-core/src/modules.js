/** 产品机会、品牌追踪、综合态势、营销活动、GEO、字典：在社媒 / 电商算法之上的业务模块。 */
import { demo, social } from './dataset.js'
import { filterPosts, summarize, socialQuery, dailyVolume, PROMO_RE } from './social.js'
import { ecOverview, claimGap, painPoints, reviewSamples, validReviewCount, ecQuery } from './ecommerce.js'
import { pct, round } from './rules.js'

const clamp = v => Math.max(0, Math.min(100, Math.round(v)))
const arr = v => v == null ? [] : Array.isArray(v) ? v : [v]

/** 机会评分：KSPEC-PI-01 = 0.4×需求强度 + 0.35×表达缺口 + 0.25×可行性（专家评分）。 */
export function opportunityScore({ ids } = {}) {
  const defs = demo().opportunities.filter(o => !arr(ids).length || arr(ids).includes(o.id))
  const valid = validReviewCount()
  const raw = defs.map(o => {
    const r = reviewSamples({ terms: o.terms, limit: 0 })
    const pain = o.painTerms ? reviewSamples({ terms: o.painTerms, exclude: o.exclude, limit: 0 }).matched : reviewSamples({ negPoints: o.negPoints, negOnly: true, limit: 0 }).negative
    const s = filterPosts({ keyword: o.terms }).posts.length
    const q = ecQuery({ keyword: o.claimTerms })
    const titleRate = Math.max(...q.keywords.map(k => k.titleRate)), reviewRate = pct(r.matched, valid)
    return { o, reviewHits: r.matched, reviewNeg: pain, socialHits: s, titleRate, reviewRate }
  })
  const maxTalk = Math.max(...raw.map(x => x.reviewHits + x.socialHits), 1)
  const maxPain = Math.max(...raw.map(x => x.reviewNeg), 1)
  const maxGap = Math.max(...raw.map(x => Math.abs(x.reviewRate - x.titleRate)), 0.1)
  const rows = raw.map(x => {
    const pain = 100 * x.reviewNeg / maxPain, talk = 100 * (x.reviewHits + x.socialHits) / maxTalk
    const demand = clamp(0.6 * pain + 0.4 * talk)
    const gap = clamp(100 * Math.abs(x.reviewRate - x.titleRate) / maxGap)
    const score = clamp(0.4 * demand + 0.35 * gap + 0.25 * x.o.feasibility)
    return { id: x.o.id, name: x.o.name, score, grade: score >= 80 ? 'A 重点' : score >= 65 ? 'B 跟进' : 'C 观察',
      parts: { demand, gap, feasibility: x.o.feasibility },
      evidence: { reviewHits: x.reviewHits, reviewNegative: x.reviewNeg, socialHits: x.socialHits, titleRate: x.titleRate, reviewRate: x.reviewRate },
      owner: x.o.owner, action: x.o.action }
  }).sort((a, b) => b.score - a.score)
  return { formula: '机会分 = 0.4×需求强度 + 0.35×表达缺口 + 0.25×可行性', opportunities: rows,
    caveats: ['需求强度 = 0.6×痛点强度（负面评价命中，归一）+ 0.4×讨论强度（有效评价 + 社媒命中，归一）；表达缺口 = |评价提及率 − 标题提及率|（归一）', '可行性为专家评分，立项前须研究院真人验证'] }
}

/** 立项证据包：评分拆解 + 原文 + 反例 + 验证计划。 */
export function opportunityPack({ id = 'OP-001' } = {}) {
  const o = demo().opportunities.find(x => x.id === id)
  if (!o) throw new Error(`未知机会 ${id}，可选：${demo().opportunities.map(x => x.id).join(' / ')}`)
  const score = opportunityScore().opportunities.find(x => x.id === id)
  const neg = o.painTerms ? reviewSamples({ terms: o.painTerms, exclude: o.exclude, limit: 4 }) : reviewSamples({ negPoints: o.negPoints, negOnly: true, limit: 4, exclude: o.exclude || [] })
  const counter = reviewSamples({ terms: o.terms.map(t => '没有' + t).concat(o.terms.map(t => '无' + t)), limit: 2 })
  const sm = filterPosts({ keyword: o.terms }).posts.sort((a, b) => b.inter - a.inter).slice(0, 3).map(p => ({ platform: p.plat, date: p.date, quote: p.summary || p.title, promo: PROMO_RE.test(p.text) }))
  return { id, name: o.name, score, evidence: { reviews: neg.items, social: sm, counterExamples: counter.items, sample: { painReviews: score.evidence.reviewNegative, topicReviews: score.evidence.reviewHits, socialHits: score.evidence.socialHits, counterHits: counter.matched } },
    owner: o.owner, action: o.action,
    validation: ['概念板经虚拟消费者读稿预筛（只出假设）', '研究院组织真人验证（≥ 30 位目标用户）', '立项会前品牌部确认执行成本'],
    caveats: ['原文直接取自有效文字评价与社媒样本，未做改写', '反例用于检验结论是否被少数极端评论放大'] }
}

/** 品牌健康度：情感、背书、风险、场景与卖点（社媒）+ 货架口碑（电商）。 */
export function brandHealth({ brand = '福临门', days = 14 } = {}) {
  const { posts, window } = filterPosts({ brand, days })
  const s = summarize(posts)
  const endorse = posts.filter(p => /中粮|央企|国企/.test(p.text))
  const count = key => { const m = new Map(); posts.forEach(p => p[key].forEach(k => m.set(k, (m.get(k) || 0) + 1))); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, n, share: pct(n, posts.length) })) }
  const ec = ecOverview()
  return { brand, window, social: { posts: s.posts, nsr: s.nsr, negShare: s.negShare, interactions: s.interactions, ugcShare: s.contentType.find(c => c.name === 'UGC')?.share ?? null },
    endorsement: { posts: endorse.length, share: pct(endorse.length, posts.length), reading: '母品牌「中粮」在子品牌讨论中的出现率（母子协同第一把尺子）' },
    sellingPoints: count('points'), scenes: count('scenes'), risks: count('risk'),
    shelf: ec.platforms.map(p => ({ platform: p.platform, validRate: p.validRate, negRate: p.negRate })),
    caveats: ['竞品样本极少，健康度只做本品纵向跟踪；跨品牌对比请走 insight_compare 并接受覆盖门槛'] }
}

/** 异常预警：日声量 z-score + 负面帖 + 风险标签。 */
export function overviewAlerts({ brand = '福临门', days = 14 } = {}) {
  const { series, window } = dailyVolume({ brand, days })
  const xs = series.map(d => d.posts), mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length || 1)) || 1
  const spikes = series.map(d => ({ ...d, z: round((d.posts - mean) / sd, 2) })).filter(d => d.z >= 1.5)
  const negPosts = filterPosts({ brand, days }).posts.filter(p => p.senti === '负面').sort((a, b) => b.inter - a.inter).slice(0, 5)
    .map(p => ({ id: p.id, platform: p.plat, date: p.date, interactions: p.inter, quote: p.summary || p.title, risk: p.risk }))
  const alerts = [
    ...spikes.map(d => ({ level: d.z >= 2.5 ? '严重' : '关注', type: '声量短时抬升', detail: `${d.date} 声量 ${d.posts} 条，z=${d.z}（均值 ${round(mean, 0)}）` })),
    ...negPosts.slice(0, 3).map(p => ({ level: '关注', type: '负面内容', detail: `${p.platform} ${p.date}：${p.quote.slice(0, 40)}…` }))
  ]
  return { window, series, mean: round(mean, 1), alerts, negativeSamples: negPosts,
    caveats: ['预警只在页面与对话内提示，不对外推送；z ≥ 1.5 为关注、≥ 2.5 为严重'] }
}

/** 综合态势一屏巡检。 */
export function overviewSnapshot({ brand = '福临门', days = 14 } = {}) {
  const q = socialQuery({ brand, days })
  const ec = ecOverview()
  const opp = opportunityScore()
  const al = overviewAlerts({ brand, days })
  const gap = claimGap().claims
  return { brand, window: q.window, social: { posts: q.posts, authors: q.authors, interactions: q.interactions, nsr: q.nsr, negShare: q.negShare, topPlatforms: q.platforms.slice(0, 3) },
    ecommerce: ec.total, ecPlatforms: ec.platforms.map(p => ({ platform: p.platform, links: p.links, validRate: p.validRate, priceMedian: p.priceMedian })),
    topOpportunities: opp.opportunities.map(o => ({ id: o.id, name: o.name, score: o.score, grade: o.grade })),
    biggestGap: gap[0], reverseGap: gap[gap.length - 1], alerts: al.alerts.slice(0, 4),
    caveats: ['数据截至 2026-11-01（社媒）/ 2026-11-02（电商快照），非实时', '销售额未接入，同比环比显示「—」'] }
}

/** 营销活动：品牌说 vs 用户说对照；增量需投放数据，未接入时明确写「未知」。 */
export function campaignReview({ claims } = {}) {
  const gap = claimGap({ claims })
  const { posts } = filterPosts({ days: 14 })
  const rows = gap.claims.map(c => {
    const kws = c.reviewTerms
    const sm = posts.filter(p => kws.some(k => p.text.includes(k)))
    const ugc = sm.filter(p => p.ctype === 'UGC' && !PROMO_RE.test(p.text))
    return { claim: c.claim, brandSays: c.titleRate, userSaysReview: c.reviewRate, userSaysSocial: pct(sm.length, posts.length), organicUgc: ugc.length, adoption: c.titleRate ? round(c.reviewRate / c.titleRate, 2) : null }
  })
  return { window: filterPosts({ days: 14 }).window, rows, increment: { status: 'unknown', reason: '投放花费、曝光与反事实基线未接入，增量无法计算——按约束写「未知」，不估算' },
    caveats: ['卖点采纳率 = 评价主动提及率 / 标题提及率；> 1 说明消费者主动复述多于品牌表达', '社媒去掉促销话术后的 UGC 才算「自然复述」'] }
}

/** 渠道趋势（抖音，区间口径 + 门禁）。 */
export function channelTrend() {
  const d = demo().douyin
  const swings = d.salesMoM.slice(1).map((v, i) => Math.abs(v - d.salesMoM[i]))
  return { source: d._source, months: d.months, salesMoM: d.salesMoM, octVolumeMoM: d.octVolumeMoM, octMix: d.octMix,
    stability: { maxSwingPt: round(Math.max(...swings), 1), stable: false, reading: '7 月 -69.44% → 8 月 +346.25% → 9 月 -32.09% → 10 月 +12.94%，波动尚未收敛，不能叫「稳定增长」' },
    gates: d.gates, caveats: ['销售额为区间值，环比为接口直接返回值；本工具不估算金额、不推同比'] }
}

/** GEO 巡检：准确率、提及率与纠偏清单。 */
export function geoAudit({ platform } = {}) {
  const g = demo().geo
  const qs = g.questions.filter(q => !platform || q.platform === platform)
  const wrong = qs.filter(q => q.verdict === '错误' || q.verdict === '待核实')
  return { source: g._source, total: qs.length, accuracy: pct(qs.filter(q => q.verdict === '准确').length, qs.length), mentionRate: pct(qs.filter(q => q.verdict !== '未提及').length, qs.length),
    questions: qs, correctionList: wrong.map(q => ({ id: q.id, q: q.q, platform: q.platform, answer: q.answer, fact: q.fact, severity: q.severity })),
    caveats: ['Demo 构造巡检案例；只用权威事实与优质内容纠偏，不批量投喂、不造假', '对外供给须品牌部审定'] }
}

/** 起草品牌事实素材（只生成草稿，状态 needs_review）。 */
export function geoFactDraft({ questionId = 'Q-01' } = {}) {
  const g = demo().geo
  const q = g.questions.find(x => x.id === questionId)
  if (!q) throw new Error(`未知巡检问题 ${questionId}`)
  const f = g.facts.find(x => x.id === q.factId)
  return { questionId, platform: q.platform, wrongAnswer: q.answer, fact: f,
    draft: { title: `关于「${q.q}」的品牌事实说明`, body: `${f.fact}。依据：${f.evidence}。`, channels: ['品牌官网「关于我们」', '旗舰店详情页品牌故事', '权威媒体通稿（经品牌部审定）'], retest: '供给后 2 周复测同一问题在 ' + q.platform + ' 的答案与引用来源' },
    status: f.status === '已审定' ? 'needs_review' : 'blocked_missing_evidence',
    caveats: [f.status === '已审定' ? '素材为草稿，须品牌部审定后对外供给' : `事实「${f.id}」证据未补齐（${f.evidence}），不能起草对外素材`] }
}

export function dictLookup({ q = '' } = {}) {
  const items = demo().dictionary.filter(d => !q || [d.id, d.name, d.module, d.def].some(x => String(x).includes(q)))
  return { total: items.length, items }
}

export const experts = () => demo().experts
export const scenes = () => demo().scenes
export const tasks = () => demo().tasks
export const datasetInfo = () => ({ brand: demo().brand, social: social().meta })
