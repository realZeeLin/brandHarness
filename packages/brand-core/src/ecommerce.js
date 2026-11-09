/** 电商分析：有效评价、卖点错位、痛点、价格偏离（逐条复算，口径与原型一致）。 */
import { ecommerce, ecSummary, onReset } from './dataset.js'
import { isDefault, extract, pct, round } from './rules.js'
import { windowOf } from './social.js'

const arr = v => v == null ? [] : Array.isArray(v) ? v : [v]
let extracted = null
onReset(() => { extracted = null })
function withHits() {
  if (!extracted) extracted = ecommerce().reviews.map(r => ({ ...r, valid: !isDefault(r.text), hits: extract(r.text) }))
  return extracted
}
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }

/** 平台概览：链接、评论、有效评价率、默认好评率、价格中位、负面率。 */
export function ecOverview({ platform } = {}) {
  const ec = ecommerce(), plats = arr(platform).length ? arr(platform) : ec.plats
  const rows = plats.map(p => {
    const links = ec.links.filter(l => l.plat === p)
    const reviews = withHits().filter(r => r.plat === p)
    const valid = reviews.filter(r => r.valid)
    const neg = valid.filter(r => r.hits.some(h => h.sent === 'neg'))
    return {
      platform: p, links: links.length, reviews: reviews.length, validReviews: valid.length,
      validRate: pct(valid.length, reviews.length), defaultRate: pct(reviews.length - valid.length, reviews.length),
      priceMedian: round(median(links.map(l => l.price).filter(Boolean)), 1), pplMedian: round(median(links.map(l => l.ppl).filter(Boolean)), 2),
      negReviews: neg.length, negRate: pct(neg.length, valid.length)
    }
  })
  const all = withHits()
  return {
    snapshot: ec.snap, platforms: rows,
    total: { links: ec.links.length, reviews: all.length, validReviews: all.filter(r => r.valid).length, validRate: pct(all.filter(r => r.valid).length, all.length) },
    caveats: ['有效文字评价 = 剔除默认好评 / 未填写 / 长度 ≤ 2 的评论', '淘宝天猫默认好评占比高，不能作为口碑分母；两渠道不混算', '销售额未接入：平台展示销量为采集快照，不代表同期成交']
  }
}

/** insight_query 电商侧：标题提及（存量）vs 有效评价主动提及。 */
export function ecQuery({ keyword = [], days = 14 } = {}) {
  const ec = ecommerce(), w = windowOf(days)
  const all = withHits(), valid = all.filter(r => r.valid)
  const inWin = all.filter(r => r.date >= w.start && r.date <= w.end)
  const rows = arr(keyword).map(k => {
    const titles = ec.links.filter(l => l.title.includes(k)).length
    const mentions = valid.filter(r => r.text.includes(k)).length
    const titleRate = pct(titles, ec.links.length), reviewRate = pct(mentions, valid.length)
    return { keyword: k, links: ec.links.length, titleMentions: titles, titleRate, validReviews: valid.length, reviewMentions: mentions, reviewRate, gapPt: round(titleRate - reviewRate, 1) }
  })
  return {
    channel: 'ecommerce', snapshot: ec.snap, window: w, keywords: rows,
    windowReviews: { total: inWin.length, valid: inWin.filter(r => r.valid).length },
    caveats: ['两套分母不可混算：标题提及率按在售链接数计，评价提及率按全量有效文字评价计', '存量口径不随查询窗口变化；标题提及未按销量加权']
  }
}

/** 卖点错位：品牌在标题里讲的 vs 消费者在评价里主动提的。 */
export function claimGap({ claims, platform } = {}) {
  const ec = ecommerce()
  const links = ec.links.filter(l => !platform || l.plat === platform)
  const valid = withHits().filter(r => r.valid && (!platform || r.plat === platform))
  const defs = arr(claims).length
    ? arr(claims).map(c => ({ claim: c, tk: [c], ck: [c] }))
    : ec.claims.map((c, i) => ({ claim: c, tk: ec.claim_tk[i], ck: ec.claim_ck[i] }))
  const rows = defs.map(d => {
    const t = links.filter(l => d.tk.some(k => l.title.includes(k))).length
    const c = valid.filter(r => d.ck.some(k => r.text.includes(k))).length
    const titleRate = pct(t, links.length), reviewRate = pct(c, valid.length)
    return { claim: d.claim, titleTerms: d.tk, reviewTerms: d.ck, titleMentions: t, titleRate, reviewMentions: c, reviewRate, gapPt: round(titleRate - reviewRate, 1),
      reading: titleRate - reviewRate >= 5 ? '品牌主推、消费者少提（降级为信任状）' : reviewRate - titleRate >= 1 ? '消费者在意、标题少写（提到首屏）' : '基本对齐' }
  }).sort((a, b) => b.gapPt - a.gapPt)
  return { snapshot: ec.snap, platform: platform || '全部', base: { links: links.length, validReviews: valid.length }, claims: rows,
    caveats: ['KSPEC-EC-04 卖点错位差值 = 标题提及率 − 评价主动提及率（百分点）', '存量口径：当前在售链接快照 × 全量有效评价'] }
}

/** 痛点与负面构成：观点抽取带否定窗口，附原文。 */
export function painPoints({ platform, limit = 3 } = {}) {
  const valid = withHits().filter(r => r.valid && (!platform || r.plat === platform))
  const negs = valid.filter(r => r.hits.some(h => h.sent === 'neg'))
  const m = new Map()
  for (const r of negs) for (const h of r.hits) if (h.sent === 'neg') { const k = h.dim + '·' + h.point; const e = m.get(k) || { dim: h.dim, point: h.point, n: 0, samples: [] }; e.n++; if (e.samples.length < limit && r.text.length > 12) e.samples.push({ platform: r.plat, date: r.date, quote: r.text.slice(0, 120) }); m.set(k, e) }
  const points = [...m.values()].sort((a, b) => b.n - a.n).map(p => ({ ...p, share: pct(p.n, negs.length) }))
  const dims = new Map(); for (const p of points) dims.set(p.dim, (dims.get(p.dim) || 0) + p.n)
  return { base: { validReviews: valid.length, negativeReviews: negs.length, negRate: pct(negs.length, valid.length) },
    dimensions: [...dims.entries()].map(([dim, n]) => ({ dim, n })).sort((a, b) => b.n - a.n), points,
    caveats: ['负面判定为规则词典 + 否定窗口，不等同人工标注；一条评论可命中多个痛点'] }
}

/** 价格偏离巡检（基于采集快照的单升价基准）。 */
export function priceAudit() {
  const d = ecSummary()
  return { snapshot: d.collected, bench: d.bench, bands: d.band_by_platform, specs: d.price_spec,
    highest: d.hi.map(h => ({ platform: h.platform, shop: h.shop, shopType: h.shop_type, cat: h.category, price: h.price, pricePerL: h.price_per_L, ratio: h.price_ratio, title: h.title })),
    lowest: d.lo.map(h => ({ platform: h.platform, shop: h.shop, shopType: h.shop_type, cat: h.category, price: h.price, pricePerL: h.price_per_L, ratio: h.price_ratio, title: h.title })),
    caveats: ['KSPEC-EC-05：>150% 视为虚高，<80% 疑似破价或规格错配；规格解析失败的链接不参与', '第三方店铺价格为展示价，未计入券后价'] }
}

/** 按关键词取评论原文（用于证据包、反例）。 */
export function reviewSamples({ terms = [], negOnly = false, negPoints = [], limit = 4, exclude = [] } = {}) {
  const hit = withHits().filter(r => r.valid && (!arr(terms).length || arr(terms).some(t => r.text.includes(t))) && !arr(exclude).some(t => r.text.includes(t)))
  const isNeg = r => arr(negPoints).length ? r.hits.some(h => h.sent === 'neg' && arr(negPoints).includes(h.point)) : r.hits.some(h => h.sent === 'neg')
  const pick = negOnly ? hit.filter(isNeg) : hit
  return { matched: hit.length, negative: hit.filter(isNeg).length,
    items: [...new Map(pick.map(r => [r.text, r])).values()].sort((a, b) => Math.abs(a.text.length - 70) - Math.abs(b.text.length - 70)).slice(0, limit).map(r => ({ platform: r.plat, date: r.date, quote: r.text.slice(0, 140) })) }
}
export const validReviewCount = () => withHits().filter(r => r.valid).length
