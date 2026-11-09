/** 数据集访问：懒加载福临门演示数据（社媒 / 电商 / 汇总 / 演示构造数据）。 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(here, '..', '..', '..')

export function dataDir() {
  return process.env.BRANDHARNESS_DATA ? resolve(process.env.BRANDHARNESS_DATA) : join(ROOT, 'data', 'fulinmen')
}
export function workspaceDir() {
  return process.env.BRANDHARNESS_WORKSPACE ? resolve(process.env.BRANDHARNESS_WORKSPACE) : join(ROOT, 'workspace')
}
export function skillsDir() {
  return process.env.BRANDHARNESS_SKILLS ? resolve(process.env.BRANDHARNESS_SKILLS) : join(ROOT, 'skills')
}

const cache = new Map()
function load(name) {
  if (!cache.has(name)) {
    const file = join(dataDir(), name)
    if (!existsSync(file)) throw new Error(`数据文件缺失：${file}（请确认 BRANDHARNESS_DATA 指向 data/fulinmen）`)
    cache.set(name, JSON.parse(readFileSync(file, 'utf8')))
  }
  return cache.get(name)
}

const SOCIAL_COLS = ['id', 'title', 'summary', 'plat', 'date', 'author', 'brand', 'cat', 'senti', 'inter', 'tier', 'ctype', 'points', 'scenes', 'risk', 'text']

/** 增量数据：导入接口 / 数据流推入写到 workspace/data/<dataset>.jsonl，加载时与基线合并。 */
export function increments(dataset) {
  const f = join(workspaceDir(), 'data', dataset + '.jsonl')
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
}

/** 社媒帖子（已脱敏：作者为不可逆哈希，仅用于去重计数）。 */
export function social() {
  if (!cache.has('social:rows')) {
    const raw = load('social.json')
    const posts = raw.posts.map(r => Object.fromEntries(SOCIAL_COLS.map((k, i) => [k, r[i]])))
    const inc = increments('social_posts')
    const metaWin = [...raw.meta.window]
    for (const p of inc) { posts.push(p); if (p.date < metaWin[0]) metaWin[0] = p.date; if (p.date > metaWin[1]) metaWin[1] = p.date }
    cache.set('social:rows', { meta: { ...raw.meta, window: metaWin, kept: raw.meta.kept + inc.length, increments: inc.length }, terms: raw.terms, labels: raw.labels, posts })
  }
  return cache.get('social:rows')
}

/** 电商商品链接与评论。 */
export function ecommerce() {
  if (!cache.has('ec:rows')) {
    const raw = load('ecommerce.json')
    const links = raw.links.map((r, id) => ({
      id, plat: raw.plats[r[0]], shopType: raw.sts[r[1]], cat: raw.cats[r[2]], subBrand: raw.brands[r[3]],
      shop: raw.shops[r[4]], price: r[5], ppl: r[6], title: r[7], sales: r[8] >= 0 ? r[8] : null
    }))
    const reviews = raw.reviews.map((r, id) => ({ id, plat: raw.plats[r[0]], date: r[1], item: r[2], text: r[3], sku: raw.skus[r[4]] || '' }))
    for (const l of increments('ec_links')) links.push({ ...l, id: links.length })
    for (const r of increments('ec_reviews')) reviews.push({ ...r, id: reviews.length, item: r.item ?? -1 })
    cache.set('ec:rows', { ...raw, links, reviews })
  }
  return cache.get('ec:rows')
}

export const ecSummary = () => load('ec-summary.json')
export function demo() {
  if (!cache.has('demo:merged')) {
    const d = structuredClone(load('demo.json'))
    for (const q of increments('geo_answers')) d.geo.questions.push(q)
    for (const f of increments('brand_facts')) { const i = d.geo.facts.findIndex(x => x.id === f.id); if (i >= 0) d.geo.facts[i] = f; else d.geo.facts.push(f) }
    cache.set('demo:merged', d)
  }
  return cache.get('demo:merged')
}
const resetHooks = new Set()
export const onReset = fn => resetHooks.add(fn)
export function resetCache() { cache.clear(); for (const fn of resetHooks) fn() }
