/** 社媒聆听：声量、关键词、原文证据、口碑标签、对比（全部基于脱敏后的真实帖子逐条计算）。 */
import { social, ecommerce } from './dataset.js'
import { pct, round, isDefault } from './rules.js'

const DAY = 86400000
const iso = t => new Date(t).toISOString().slice(0, 10)
export const PROMO_RE = /促销|福利|到货|特价|秒杀|周年庆|优惠|包邮|领券|下单|直播间|拍\d|\d+(?:\.\d+)?\s*元|团购|活动价/

export function windowOf(days) {
  const { meta } = social()
  const end = meta.window[1]
  const minStart = meta.window[0]
  const d = Math.max(1, Math.min(Number(days) || 14, 366))
  const start = iso(Date.parse(end + 'T00:00:00Z') - (d - 1) * DAY)
  return { start: start < minStart ? minStart : start, end, days: d, covered: start >= minStart }
}

const arr = v => v == null ? [] : Array.isArray(v) ? v : [v]

export function filterPosts({ brand = '福临门', days = 14, platform, cat, keyword } = {}) {
  const w = windowOf(days)
  const brands = arr(brand), plats = arr(platform), cats = arr(cat), kws = arr(keyword)
  const posts = social().posts.filter(p => p.date >= w.start && p.date <= w.end &&
    (!brands.length || brands.includes(p.brand)) && (!plats.length || plats.includes(p.plat)) &&
    (!cats.length || cats.includes(p.cat)) && (!kws.length || kws.some(k => p.text.includes(k))))
  return { posts, window: w }
}

function countBy(list, fn) {
  const m = new Map()
  for (const x of list) for (const k of arr(fn(x))) m.set(k, (m.get(k) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
}

export function summarize(posts) {
  const senti = { pos: 0, neu: 0, neg: 0 }
  for (const p of posts) senti[p.senti === '正面' ? 'pos' : p.senti === '负面' ? 'neg' : 'neu']++
  const total = posts.length
  return {
    posts: total,
    authors: new Set(posts.map(p => p.author)).size,
    interactions: posts.reduce((a, p) => a + (p.inter || 0), 0),
    sentiment: senti,
    nsr: pct(senti.pos - senti.neg, senti.pos + senti.neg),
    negShare: pct(senti.neg, total),
    platforms: countBy(posts, p => p.plat).slice(0, 6).map(x => ({ ...x, share: pct(x.n, total) })),
    contentType: countBy(posts, p => p.ctype).map(x => ({ ...x, share: pct(x.n, total) }))
  }
}

/** insight_query 社媒侧。 */
export function socialQuery({ brand = '福临门', keyword = [], days = 14, platform, cat } = {}) {
  const { posts, window } = filterPosts({ brand, days, platform, cat })
  const base = summarize(posts)
  const keywords = arr(keyword).map(kw => {
    const hit = posts.filter(p => p.text.includes(kw))
    const top = countBy(hit, p => p.plat)[0] || null
    return {
      keyword: kw, posts: hit.length, share: pct(hit.length, posts.length), authors: new Set(hit.map(p => p.author)).size,
      topPlatform: top, promoShare: pct(hit.filter(p => PROMO_RE.test(p.text)).length, hit.length),
      negative: hit.filter(p => p.senti === '负面').length
    }
  })
  const caveats = ['社媒为三源合并去重后口径（' + social().meta.raw.toLocaleString() + ' 条原始 → ' + social().meta.kept.toLocaleString() + ' 条有效）']
  if (base.sentiment.neg < 50) caveats.push(`负面仅 ${base.sentiment.neg} 条（${base.negShare}%），负向结论需谨慎`)
  if (!window.covered) caveats.push(`数据窗口仅覆盖 ${social().meta.window.join(' → ')}，请求的 ${days} 天已截断，无法给环比`)
  return { channel: 'social', scope: { brand, platform: platform || '全部', cat: cat || '全部' }, window, ...base, keywords, caveats }
}

/** insight_evidence：只回原文，不做二次摘要。 */
export function socialEvidence({ brand = '福临门', keyword = [], days = 14, limit = 4, sentiment, platform } = {}) {
  const { posts, window } = filterPosts({ brand, days, keyword, platform })
  let hit = posts
  if (sentiment) hit = hit.filter(p => p.senti === sentiment)
  const sorted = [...hit].sort((a, b) => (b.inter - a.inter) || (b.date < a.date ? -1 : 1))
  const items = sorted.slice(0, Math.max(1, Math.min(20, Number(limit) || 4))).map(p => ({
    id: p.id, platform: p.plat, date: p.date, author: p.author, sentiment: p.senti, interactions: p.inter,
    contentType: p.ctype, promo: PROMO_RE.test(p.text), quote: p.summary || p.title
  }))
  const kws = arr(keyword)
  const ec = ecommerce().reviews.filter(r => !isDefault(r.text) && kws.some(k => r.text.includes(k)))
  return {
    window, matched: hit.length, returned: items.length,
    promoInSample: items.filter(i => i.promo).length,
    ecommerceCorroboration: ec.length,
    items,
    caveats: ['取证只回原文，不做二次摘要；作者为脱敏哈希，仅用于去重', '电商旁证仅用于交叉印证，与社媒分母不可混算']
  }
}

/** 口碑标签（V1.1，8 类 44 项）覆盖率；零命中记入数据缺口。 */
export function socialLabels({ brand = '福临门', days = 14, group } = {}) {
  const { posts, window } = filterPosts({ brand, days })
  const labels = social().labels.filter(l => !group || l.group === group).map(l => {
    const hit = posts.filter(p => l.kw.some(k => p.text.includes(k)))
    return { id: l.id, group: l.group, name: l.name, posts: hit.length, coverRate: pct(hit.length, posts.length), negative: hit.filter(p => p.senti === '负面').length }
  })
  const groups = countBy(labels, l => l.group).map(g => {
    const ls = labels.filter(l => l.group === g.name)
    return { group: g.name, labels: ls.length, posts: ls.reduce((a, l) => a + l.posts, 0), top: [...ls].sort((a, b) => b.posts - a.posts)[0]?.name }
  }).sort((a, b) => b.posts - a.posts)
  return {
    window, base: posts.length, groups,
    labels: labels.sort((a, b) => b.posts - a.posts),
    dataGaps: labels.filter(l => l.posts === 0).map(l => `${l.group} · ${l.name}：零命中（词表或样本缺口，不等于没有问题）`)
  }
}

const GATE = { social: 100, ecommerce: 200 }

/** insight_compare：带覆盖门槛的对比；不达标一侧进入 skipped，不输出倍数。 */
export function compare({ dim = 'brand', values = [], days = 14 } = {}) {
  const ec = ecommerce()
  const w = windowOf(days)
  const inWin = ec.reviews.filter(r => r.date >= w.start && r.date <= w.end && !isDefault(r.text))
  const sides = arr(values).map(v => {
    const q = dim === 'brand' ? { brand: v, days } : dim === 'cat' ? { brand: [], cat: v, days } : { brand: '福临门', platform: v, days }
    const { posts } = filterPosts(q)
    const s = summarize(posts)
    let valid = 0, links = 0
    if (dim === 'brand') {
      links = ec.links.filter(l => v === '福临门' ? true : l.title.includes(v)).length
      valid = v === '福临门' ? inWin.length : 0
    } else if (dim === 'cat') {
      const ids = new Set(ec.links.filter(l => l.cat === v).map(l => l.id))
      links = ids.size
      valid = inWin.filter(r => ids.has(r.item)).length
    }
    const cov = (n, g) => n >= g ? 'ok' : n > 0 ? 'thin' : 'none'
    return {
      value: v, socialPosts: s.posts, interactions: s.interactions, perPost: round(s.posts ? s.interactions / s.posts : 0, 2),
      posRate: pct(s.sentiment.pos, s.posts), nsr: s.nsr, links, validReviews: valid,
      coverage: { social: cov(s.posts, GATE.social), ecommerce: dim === 'platform' ? 'n/a' : cov(valid, GATE.ecommerce) },
      platforms: s.platforms
    }
  })
  const gaps = {}, skipped = []
  if (sides.length === 2) {
    const [a, b] = sides
    if (a.coverage.social === 'ok' && b.coverage.social === 'ok') gaps.social = { diff: a.socialPosts - b.socialPosts, ratio: round(a.socialPosts / b.socialPosts, 1) }
    else skipped.push(`社媒：${sides.filter(s => s.coverage.social !== 'ok').map(s => `${s.value} 仅 ${s.socialPosts} 条（<${GATE.social}）`).join('；')}`)
    if (a.coverage.ecommerce === 'ok' && b.coverage.ecommerce === 'ok') gaps.ecommerce = { diff: a.validReviews - b.validReviews, ratio: round(a.validReviews / b.validReviews, 2) }
    else if (dim !== 'platform') skipped.push(`电商：${sides.filter(s => s.coverage.ecommerce !== 'ok').map(s => `${s.value} 有效评价 ${s.validReviews} 条（<${GATE.ecommerce}）`).join('；')}`)
    if (gaps.social) {
      const names = new Set([...a.platforms, ...b.platforms].map(p => p.name))
      const pa = Object.fromEntries(filterPosts(dim === 'cat' ? { brand: [], cat: a.value, days } : { brand: a.value, days }).posts.reduce((m, p) => m.set(p.plat, (m.get(p.plat) || 0) + 1), new Map()))
      const pb = Object.fromEntries(filterPosts(dim === 'cat' ? { brand: [], cat: b.value, days } : { brand: b.value, days }).posts.reduce((m, p) => m.set(p.plat, (m.get(p.plat) || 0) + 1), new Map()))
      for (const k of Object.keys(pa)) names.add(k)
      gaps.drivers = [...names].map(n => ({ platform: n, a: pa[n] || 0, b: pb[n] || 0, diff: (pa[n] || 0) - (pb[n] || 0) }))
        .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 5)
        .map(d => ({ ...d, structural: Math.min(d.a, d.b) <= Math.max(d.a, d.b) * 0.1 }))
    }
  }
  return {
    dim, window: windowOf(days), sides, gaps, skipped,
    threshold: GATE,
    verdict: skipped.length && !gaps.social && !gaps.ecommerce ? 'refuse' : skipped.length ? 'partial' : 'ok',
    caveats: ['门槛：社媒 100 条、电商有效评价 200 条；不达标就进 skipped，不产出任何倍数', '电商有效评价取同一时间窗内的评论，社媒与电商分母不可混算', '电商数据仅覆盖中粮自有品牌演示采集，不含外部竞品']
  }
}

export function dailyVolume({ brand = '福临门', days = 14 } = {}) {
  const { posts, window } = filterPosts({ brand, days })
  const m = new Map()
  for (const p of posts) { const r = m.get(p.date) || { date: p.date, posts: 0, neg: 0 }; r.posts++; if (p.senti === '负面') r.neg++; m.set(p.date, r) }
  return { window, series: [...m.values()].sort((a, b) => a.date < b.date ? -1 : 1) }
}
