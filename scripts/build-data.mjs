#!/usr/bin/env node
/**
 * 从「中粮社媒与消费者AI洞察平台-演示包/prototype」构建 brand-core 使用的福临门数据集。
 * - 社媒帖子：作者昵称做不可逆脱敏（只保留去重计数能力），正文截断，删除原始链接
 * - 电商评论：保留原文（无作者信息），商品链接只保留结构化字段与标题
 * 用法：node scripts/build-data.mjs <演示包/prototype 目录>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const src = process.argv[2]
if (!src) { console.error('用法: node scripts/build-data.mjs <prototype 目录>'); process.exit(1) }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fulinmen')
mkdirSync(out, { recursive: true })

function loadWindowScript(file, key) {
  const sandbox = { window: {} }
  vm.runInNewContext(readFileSync(join(src, file), 'utf8'), sandbox, { timeout: 60000 })
  return sandbox.window[key]
}
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s }
const mask = s => 'u' + createHash('sha256').update('brandharness:' + String(s || '')).digest('hex').slice(0, 8)

// ---------- 社媒 ----------
const SM = loadWindowScript('data/sm-real.js', 'SM_REAL')
const social = {
  meta: SM.meta,
  terms: SM.terms,
  labels: SM.labels.map(l => ({ id: l.id, group: l.group, name: l.name, definition: l.definition, kw: l.kw })),
  // [id, 标题, 正文摘要(≤240), 平台, 日期, 作者哈希, 品牌, 品类, 情感, 互动, 层级, 内容类型, 卖点[], 场景[], 风险[], 全文命中用的检索文本(≤600)]
  posts: SM.posts.map(p => [p.id, cut(p.title, 80), cut(p.summary || p.text, 200), p.plat, p.date, mask(p.author), p.brandName, p.cat, p.senti, p.inter || 0, p.tier, p.ctype, p.points || [], p.scenes || [], p.risk || [], String(p.title || '') + ' ' + String(p.text || '')])
}
writeFileSync(join(out, 'social.json'), JSON.stringify(social))

// ---------- 电商 ----------
const R = JSON.parse(readFileSync(join(src, 'data/ec-R.json'), 'utf8'))
const EC = loadWindowScript('data/ec-reviews.js', 'EC_REVIEWS')
const ecommerce = {
  snap: R.snap, plats: R.plats, sts: R.sts, cats: R.cats, brands: R.brands, shops: R.shops,
  claims: R.claims, claim_tk: R.claim_tk, claim_ck: R.claim_ck, bench: R.bench,
  // [平台, 店铺类型, 品类, 子品牌, 店铺, 价格, 单升价, 标题, 展示销量(-1=未披露)]
  links: R.links.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[7], r[13], r[14] >= 0 ? r[14] : -1]),
  skus: EC.skus,
  // [平台, 日期, 商品序号, 原文, SKU 序号]
  reviews: EC.reviews
}
writeFileSync(join(out, 'ecommerce.json'), JSON.stringify(ecommerce))
writeFileSync(join(out, 'ec-summary.json'), readFileSync(join(src, 'data/ec-D.json'), 'utf8'))
console.log('posts', social.posts.length, 'links', ecommerce.links.length, 'reviews', ecommerce.reviews.length)
