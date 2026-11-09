import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isolate } from '../helpers.mjs'
isolate()
const core = await import('@brandharness/brand-core')

test('四道筛：结构 / 去重 / 去无效 / 相关性 各自拦截', () => {
  const r = core.importRecords({ dataset: 'social_posts', dryRun: true, records: [
    { text: '福临门花生油炒菜很香，桶也没漏', date: '2026-11-01', platform: '小红书' },
    { text: '福临门花生油炒菜很香，桶也没漏', date: '2026-11-01', platform: '小红书' },
    { text: '福临门', date: '2026-11-01', platform: '小红书' },
    { text: '今天天气不错，出去走走', date: '2026-11-01', platform: '微博' },
    { text: '缺日期的福临门花生油', platform: '微博' }
  ] })
  assert.equal(r.received, 5); assert.equal(r.accepted, 1); assert.equal(r.dryRun, true)
  assert.equal(r.rejected['去重'].count, 1); assert.equal(r.rejected['去无效'].count, 1); assert.equal(r.rejected['相关性甄别'].count, 1); assert.equal(r.rejected['结构校验'].count, 1)
})

test('导入后算法层立即使用新数据（社媒声量与关键词命中变化）', async () => {
  const before = await core.runTool('insight_query', { keyword: ['防漏瓶口'] })
  const r = core.importRecords({ dataset: 'social_posts', source: 'unit', records: [
    { text: '福临门新的防漏瓶口设计很好用，花生油倒着不洒', date: '2026-11-01', platform: '小红书', author: 'a', interactions: 30 },
    { text: '福临门大豆油换了防漏瓶口，炒菜方便多了', date: '2026-10-31', platform: '抖音', author: 'b' }
  ] })
  assert.equal(r.accepted, 2); assert.ok(r.auditId)
  const after = await core.runTool('insight_query', { keyword: ['防漏瓶口'] })
  assert.equal(after.posts, before.posts + 2); assert.equal(after.keywords[0].posts, before.keywords[0].posts + 2)
  const ev = await core.runTool('insight_evidence', { keyword: ['防漏瓶口'] })
  assert.ok(ev.items.every(i => /^u[0-9a-f]{8}$/.test(i.author)), '作者入库即脱敏')
  const dup = core.importRecords({ dataset: 'social_posts', records: [{ text: '福临门新的防漏瓶口设计很好用，花生油倒着不洒', date: '2026-11-01', platform: '小红书' }] })
  assert.equal(dup.accepted, 0)
})

test('CSV 与 NDJSON（流式）导入电商评论；默认好评入库但不计入有效评价', async () => {
  const base = (await core.runTool('ec_overview', {})).total
  const csv = 'platform,date,text,sku\n京东,2026-11-02,"瓶口漏油了，客服处理挺快",福临门花生油5L\n京东,2026-11-02,默认好评,福临门花生油5L\n'
  const r1 = core.importRecords({ dataset: 'ec_reviews', payload: csv, format: 'csv' })
  assert.equal(r1.accepted, 2); assert.ok(r1.notes.some(n => n.includes('默认好评')))
  const nd = '{"platform":"淘宝/天猫","date":"2026-11-02","text":"日期很新鲜，比超市便宜"}\n{"platform":"淘宝/天猫","date":"2026-11-02","text":"日期很新鲜，比超市便宜"}'
  const r2 = core.importRecords({ dataset: 'ec_reviews', payload: nd, mode: 'stream' })
  assert.equal(r2.accepted, 1); assert.equal(r2.rejected['去重'].count, 1); assert.equal(r2.mode, 'stream')
  const after = (await core.runTool('ec_overview', {})).total
  assert.equal(after.reviews, base.reviews + 3); assert.equal(after.validReviews, base.validReviews + 2)
})

test('AI 答案巡检结果与品牌事实可推入', async () => {
  const before = await core.runTool('geo_audit', {})
  core.importRecords({ dataset: 'geo_answers', records: [{ q: '福临门是哪家公司的', platform: '元宝', answer: '中粮集团旗下', verdict: '准确' }] })
  core.importRecords({ dataset: 'brand_facts', records: [{ id: 'F-003', fact: '福临门花生油采用非转基因花生原料', evidence: '产品标签与检测报告', status: '已审定' }] })
  const after = await core.runTool('geo_audit', {})
  assert.equal(after.total, before.total + 1)
  assert.equal((await core.runTool('geo_fact_draft', { questionId: 'Q-03' })).status, 'needs_review', '补齐证据后可起草')
  const src = core.dataSources().datasets.find(d => d.key === 'geo_answers')
  assert.equal(src.increments, 1); assert.ok(src.lastSync)
})

test('未知数据集与超量报错', () => {
  assert.throws(() => core.importRecords({ dataset: 'nope', records: [] }), /未知数据集/)
  assert.deepEqual(core.parseCsv('a,b\n"x,1","y""z"\n'), [{ a: 'x,1', b: 'y"z' }])
})
