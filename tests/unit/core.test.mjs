import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isolate } from '../helpers.mjs'
isolate()
const core = await import('@brandharness/brand-core')
const run = core.runTool

test('社媒口径与原演示包一致：福临门 2,791 条 / 非转基因 493 条 / 作者 309 / 快手 212', async () => {
  const q = await run('insight_query', { brand: '福临门', keyword: ['非转基因'], days: 14 })
  assert.equal(q.posts, 2791); assert.equal(q.authors, 1640); assert.equal(q.interactions, 1368)
  assert.deepEqual(q.sentiment, { pos: 1171, neu: 1600, neg: 20 }); assert.equal(q.nsr, 96.6)
  const k = q.keywords[0]
  assert.equal(k.posts, 493); assert.equal(k.share, 17.7); assert.equal(k.authors, 309); assert.deepEqual(k.topPlatform, { name: '快手', n: 212 })
})

test('电商卖点错位：标题 21.7%（239/1,099）vs 有效评价 7.4%（1,084/14,658）= 14.3pt', async () => {
  const e = await run('insight_query', { keyword: ['非转基因'], channel: 'ecommerce' })
  const k = e.keywords[0]
  assert.equal(k.titleMentions, 239); assert.equal(k.links, 1099); assert.equal(k.titleRate, 21.7)
  assert.equal(k.reviewMentions, 1084); assert.equal(k.validReviews, 14658); assert.equal(k.reviewRate, 7.4); assert.equal(k.gapPt, 14.3)
  assert.deepEqual(e.windowReviews, { total: 6145, valid: 3620 })
})

test('品类对比：花生油 940 vs 玉米油 319（2.9 倍），电商有效评价 647 vs 645', async () => {
  const c = await run('insight_compare', { dim: 'cat', values: ['花生油', '玉米油'] })
  assert.equal(c.sides[0].socialPosts, 940); assert.equal(c.sides[1].socialPosts, 319)
  assert.equal(c.sides[0].validReviews, 647); assert.equal(c.sides[1].validReviews, 645)
  assert.equal(c.gaps.social.ratio, 2.9); assert.equal(c.verdict, 'ok')
})

test('护栏：金龙鱼样本不足时 verdict=refuse 且不输出倍数', async () => {
  const c = await run('insight_compare', { dim: 'brand', values: ['福临门', '金龙鱼'] })
  assert.equal(c.verdict, 'refuse'); assert.equal(c.gaps.social, undefined)
  assert.equal(c.sides[1].socialPosts, 16); assert.equal(c.sides[1].coverage.social, 'thin'); assert.equal(c.sides[1].coverage.ecommerce, 'none')
})

test('全部 27 个工具可调用且 schema 合法', async () => {
  assert.equal(core.TOOLS.length, 27)
  const args = { insight_evidence: { keyword: ['漏油'] }, insight_compare: { dim: 'cat', values: ['花生油', '玉米油'] }, opportunity_pack: { id: 'OP-002' }, geo_fact_draft: { questionId: 'Q-02' }, skill_get: { name: 'claim-gap-diagnosis' }, insight_compose: null, insight_publish: null, skill_save: null, data_import: { dataset: 'social_posts', dryRun: true, records: [] } }
  for (const t of core.TOOLS) {
    const s = core.toJsonSchema(t.parameters); assert.equal(s.type, 'object'); assert.ok(t.description.length > 10)
    if (args[t.name] === null) continue
    const r = await run(t.name, args[t.name] || {})
    assert.ok(r && typeof r === 'object', t.name)
  }
})

test('参数校验：缺必填与枚举错误返回可读报错', async () => {
  await assert.rejects(run('insight_compare', { values: ['a'] }), /缺少必填参数 dim/)
  await assert.rejects(run('insight_compare', { dim: 'x', values: ['a', 'b'] }), /只能取/)
  await assert.rejects(run('no_such_tool', {}), /未知工具/)
})

test('结论卡：数字重放核对；篡改数字被拒绝签发；签发须确认与审核人并留痕', async () => {
  const src = { tool: 'insight_query', args: { keyword: ['非转基因'], channel: 'ecommerce' }, path: 'keywords[0].gapPt' }
  const ok = await run('insight_compose', { question: '测试', findings: [{ text: '错位', value: 14.3, source: src }] })
  assert.equal(ok.status, 'draft'); assert.equal(ok.trace.rate, 100)
  const bad = await run('insight_compose', { question: '篡改', findings: [{ text: '错位', value: 30, source: src }] })
  assert.equal(bad.status, 'rejected'); assert.equal(bad.strength, '不可签发')
  assert.equal((await run('insight_publish', { cardId: bad.cardId, confirm: true, reviewer: 'x' })).status, 'refused')
  assert.equal((await run('insight_publish', { cardId: ok.cardId })).status, 'needs_confirmation')
  assert.equal((await run('insight_publish', { cardId: ok.cardId, confirm: true })).status, 'needs_reviewer')
  const pub = await run('insight_publish', { cardId: ok.cardId, confirm: true, reviewer: '分析师甲' })
  assert.equal(pub.status, 'published'); assert.match(pub.sha256, /^[0-9a-f]{64}$/)
  const log = await run('audit_log', { action: 'card' })
  assert.ok(log.records.some(r => r.action === 'card.publish' && r.actor === '分析师甲'))
})

test('技能库：8 份技能；写入须确认；确认后版本与修订记录更新', async () => {
  assert.equal(core.listSkills().length, 8)
  const cur = core.getSkill({ name: 'claim-gap-diagnosis' })
  const next = cur.content.replace('version: v1.3', 'version: v1.4')
  assert.equal((await run('skill_save', { name: 'claim-gap-diagnosis', content: next })).status, 'needs_confirmation')
  const r = await run('skill_save', { name: 'claim-gap-diagnosis', content: next, confirm: true, author: '测试', note: '单测' })
  assert.equal(r.status, 'saved'); assert.equal(r.previousVersion, 'v1.3'); assert.equal(r.version, 'v1.4')
  assert.match(core.getSkill({ name: 'claim-gap-diagnosis' }).history, /v1\.4 · 测试：单测/)
  await assert.rejects(run('skill_save', { name: 'Bad Name', content: next, confirm: true }), /kebab-case/)
  await assert.rejects(run('skill_save', { name: 'other-name', content: next, confirm: true }), /不一致/)
})

test('机会评分可解释，证据包含原文与反例', async () => {
  const s = await run('opportunity_score', {})
  assert.equal(s.opportunities.length, 3)
  for (const o of s.opportunities) assert.ok(o.score >= 0 && o.score <= 100 && o.parts.demand >= 0)
  const p = await run('opportunity_pack', { id: 'OP-001' })
  assert.equal(p.score.score, s.opportunities.find(o => o.id === 'OP-001').score)
  assert.ok(p.evidence.reviews.length > 0 && p.evidence.counterExamples.length > 0)
})

test('GEO：证据未补齐的事实不起草', async () => {
  assert.equal((await run('geo_fact_draft', { questionId: 'Q-01' })).status, 'needs_review')
  assert.equal((await run('geo_fact_draft', { questionId: 'Q-03' })).status, 'blocked_missing_evidence')
})
