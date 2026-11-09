/** 端到端：HTTP API（含 SSE 与数据接口）、MCP stdio、CLI —— 三种表面调用同一份工具。 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { isolate, ROOT } from '../helpers.mjs'

const { env, ws } = isolate()
let srv, base
before(async () => {
  srv = spawn(process.execPath, ['packages/brand-server/src/server.js'], { cwd: ROOT, env: { ...env, PORT: '0', BRAND_API_TOKEN: 'secret-token' } })
  base = await new Promise((res, rej) => { srv.stdout.on('data', d => { const m = /http:\/\/([\d.]+):(\d+)/.exec(String(d)); if (m) res(`http://${m[1]}:${m[2]}`) }); srv.on('exit', c => rej(new Error('server exit ' + c))) })
})
after(() => srv?.kill())
const get = p => fetch(base + p).then(r => r.json())
const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

test('API：meta / 工具目录 / 调用工具 / OpenAPI', async () => {
  const m = await get('/api/meta')
  assert.equal(m.modules.length, 10); assert.equal(m.experts.length, 7); assert.equal(m.skills.length, 8)
  assert.equal((await get('/api/tools')).length, 27)
  const r = await (await post('/api/tools/ec_claim_gap', {})).json()
  assert.equal(r.claims.find(c => c.claim === '非转基因').titleRate, 21.7)
  const o = await get('/api/openapi.json'); assert.ok(o.paths['/api/tools/insight_query'] && o.paths['/api/data/social_posts/stream'])
})

test('API：写类工具与数据写入需要令牌', async () => {
  assert.equal((await post('/api/tools/insight_publish', { cardId: 'x' })).status, 401)
  assert.equal((await post('/api/data/social_posts/import', '[]')).status, 401)
  assert.equal((await post('/api/tools/no_such', {})).status, 404)
})

test('API：智能体对话 SSE 事件流（T-2411）', async () => {
  const r = await post('/api/agent/chat', { message: '福临门主图要不要加码非转基因', scenario: 't2411' })
  assert.match(r.headers.get('content-type'), /event-stream/)
  const evs = (await r.text()).split('\n\n').filter(Boolean).map(l => JSON.parse(l.slice(6)))
  assert.equal(evs[0].type, 'route'); assert.equal(evs[0].expert, 'analyst'); assert.equal(evs.at(-1).type, 'done')
  assert.equal(evs.find(e => e.type === 'card').card.trace.rate, 100)
  assert.equal(evs.filter(e => e.type === 'tool' && e.phase === 'end').length, 6)
})

test('API：CSV 批量导入（预检 / 正式）与 NDJSON 流式推入', async () => {
  const auth = { authorization: 'Bearer secret-token' }
  const csv = 'text,date,platform,author\n福临门花生油这次物流包得很严实，没漏,2026-11-01,小红书,a\n天气不错,2026-11-01,微博,b\n'
  const dry = await (await fetch(base + '/api/data/social_posts/import?dryRun=1', { method: 'POST', headers: { 'content-type': 'text/csv', ...auth }, body: csv })).json()
  assert.equal(dry.accepted, 1); assert.equal(dry.dryRun, true)
  const real = await (await fetch(base + '/api/data/social_posts/import', { method: 'POST', headers: { 'content-type': 'text/csv', 'x-source': 'e2e', ...auth }, body: csv })).json()
  assert.equal(real.accepted, 1); assert.ok(real.auditId)
  const nd = ['{"text":"福临门玉米油 起沫有点多","date":"2026-11-01","platform":"抖音"}', '{"text":"福临门大豆油 日期很新鲜","date":"2026-10-30","platform":"快手"}'].join('\n')
  const st = await (await fetch(base + '/api/data/social_posts/stream', { method: 'POST', headers: { 'content-type': 'application/x-ndjson', ...auth }, body: nd })).json()
  assert.equal(st.accepted, 2); assert.equal(st.mode, 'stream')
  const src = (await get('/api/data/sources')).datasets.find(d => d.key === 'social_posts')
  assert.equal(src.increments, 3); assert.equal(src.rows, 2858)
})

test('API：静态工作台与路径穿越防护', async () => {
  const h = await (await fetch(base + '/')).text(); assert.match(h, /品牌智能体工作台/)
  assert.match(await (await fetch(base + '/concept.html')).text(), /设想设计/)
  assert.notEqual((await fetch(base + '/..%2F..%2Fpackage.json')).status, 200)
})

test('MCP：initialize → tools/list → tools/call → resources/read → prompts/get', async () => {
  const p = spawn(process.execPath, ['packages/brand-mcp/src/server.js'], { cwd: ROOT, env })
  const rl = createInterface({ input: p.stdout }); const pending = new Map(); let id = 0
  rl.on('line', l => { const m = JSON.parse(l); pending.get(m.id)?.(m); pending.delete(m.id) })
  const rpc = (method, params) => new Promise(r => { const i = ++id; pending.set(i, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n') })
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })
  assert.equal(init.result.serverInfo.name, 'brand-insight'); assert.ok(init.result.capabilities.tools)
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  const list = await rpc('tools/list', {}); assert.equal(list.result.tools.length, 27)
  assert.equal(list.result.tools.find(t => t.name === 'insight_publish').annotations.readOnlyHint, false)
  const call = await rpc('tools/call', { name: 'insight_query', arguments: { keyword: ['非转基因'], channel: 'ecommerce' } })
  assert.equal(call.result.isError, false); assert.equal(call.result.structuredContent.keywords[0].gapPt, 14.3)
  const bad = await rpc('tools/call', { name: 'insight_compare', arguments: {} }); assert.equal(bad.result.isError, true)
  const res = await rpc('resources/list', {}); assert.ok(res.result.resources.some(r => r.uri === 'skill://claim-gap-diagnosis'))
  const rd = await rpc('resources/read', { uri: 'skill://edible-oil-weekly-brief' }); assert.match(rd.result.contents[0].text, /商情周报/)
  const pr = await rpc('prompts/get', { name: 't2411' }); assert.match(pr.result.messages[0].content.text, /skill:\/\/claim-gap-diagnosis/)
  assert.equal((await rpc('nope', {})).error.code, -32601)
  p.kill()
})

test('CLI：tools / call / import --dry-run / ask / report', () => {
  const cli = (...a) => spawnSync(process.execPath, ['packages/brand-cli/src/cli.js', ...a], { cwd: ROOT, env: { ...env, NO_COLOR: '1' }, encoding: 'utf8' })
  assert.match(cli('tools').stdout, /insight_query/)
  const c = JSON.parse(cli('call', 'insight_compare', '--dim', 'cat', '--values', '花生油,玉米油').stdout)
  assert.equal(c.gaps.social.ratio, 2.9)
  const f = join(ws, 'reviews.csv'); writeFileSync(f, 'platform,date,text\n京东,2026-11-02,包装破了漏油\n')
  assert.equal(JSON.parse(cli('import', f, '--dataset', 'ec_reviews', '--dry-run').stdout).accepted, 1)
  const ask = cli('ask', '金龙鱼和福临门谁强'); assert.match(ask.stdout, /这个对比我不给结论/)
  assert.match(cli('report', 'weekly').stdout, /# 食用油商情周报/)
  assert.notEqual(cli('call', 'insight_compare').status, 0)
})
