import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isolate } from '../helpers.mjs'
isolate()
const core = await import('@brandharness/brand-core')

test('路由：问题映射到正确场景与专家', () => {
  const { route } = core
  const cases = { '福临门主图要不要加码非转基因': 't2411', '花生油和玉米油声量差多少': 'cat', '金龙鱼和我们谁强': 'guard', '起草本周周报': 'weekly', '给我排产品机会': 'opportunity', 'AI 答案里福临门被说错了': 'geo', '双十一活动复盘': 'campaign', '出 2027 年度报告': 'annual', '把小红书数据推进来': 'data', '把刚才的分析沉淀成技能': 'capture', '今天整体怎么样': 'overview' }
  for (const [q, id] of Object.entries(cases)) assert.equal(route(q).id, id, q)
})

for (const s of (await import('@brandharness/brand-core')).SCENARIOS) {
  test(`场景 ${s.id}「${s.label}」完整跑通：route → plan → tool → done，无错误`, async () => {
    const evs = []
    for await (const e of core.plan(s.prompt, { scenario: s.id, history: [{ q: 'x', scenario: 't2411', label: 'T-2411', tools: ['insight_query'] }] })) evs.push(e)
    assert.equal(evs[0].type, 'route'); assert.equal(evs.at(-1).type, 'done')
    assert.ok(!evs.some(e => e.type === 'error' || (e.type === 'tool' && e.phase === 'error')))
    assert.ok(evs.some(e => e.type === 'tool' && e.phase === 'end'))
    if (s.id === 't2411') { const c = evs.find(e => e.type === 'card').card; assert.equal(c.trace.rate, 100); assert.ok(evs.some(e => e.type === 'gate')) }
  })
}

test('在线模式：DeepSeek 函数调用循环（模拟 API）真实执行工具并回传结果', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body)
    const toolMsg = body.messages.find(m => m.role === 'tool')
    const message = toolMsg ? { role: 'assistant', content: '错位 ' + JSON.parse(toolMsg.content).keywords[0].gapPt + 'pt' } : { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'insight_query', arguments: '{"keyword":["非转基因"],"channel":"ecommerce"}' } }] }
    return { ok: true, json: async () => ({ choices: [{ message }] }) }
  }
  const evs = []
  for await (const e of core.deepseekChat([{ role: 'user', content: '非转基因有没有人接' }], { apiKey: 'k', fetchImpl })) evs.push(e)
  assert.equal(calls.length, 2); assert.equal(calls[0].tools.length, 27); assert.match(calls[0].messages[0].content, /工作守则/)
  assert.ok(evs.some(e => e.type === 'tool' && e.phase === 'end' && e.result.keywords[0].gapPt === 14.3))
  assert.equal(evs.find(e => e.type === 'text').md, '错位 14.3pt')
})
