#!/usr/bin/env node
/**
 * brand-server：零依赖 HTTP 服务。
 *   GET  /api/health                     健康检查与运行模式
 *   GET  /api/meta                       模块 / 专家 / 场景 / 任务 / 技能 / 数据源（工作台左栏）
 *   GET  /api/tools                      工具目录（JSON Schema）
 *   POST /api/tools/:name                调用工具（body = 参数）
 *   POST /api/agent/chat                 智能体对话（SSE 事件流）；mode=offline|online
 *   GET  /api/skills /api/skills/:name   技能库；PUT /api/skills/:name 保存（需 confirm）
 *   GET  /api/data/sources               数据源状态
 *   POST /api/data/:dataset/import       批量导入（JSON / NDJSON / CSV；?dryRun=1 预检）
 *   POST /api/data/:dataset/stream       数据流推入（NDJSON，逐行入库）
 *   GET  /api/openapi.json               OpenAPI 描述
 * 可选鉴权：设置 BRAND_API_TOKEN 后，写接口需带 Authorization: Bearer <token>。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as core from '@brandharness/brand-core'

const here = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(process.env.BRAND_WEB_DIR || join(here, '..', '..', '..', 'apps', 'workbench'))
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' }
const MAX_BODY = 20 * 1024 * 1024

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)) }
async function readBody(req) {
  const chunks = []; let n = 0
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw Object.assign(new Error('请求体超过 20MB'), { code: 413 }); chunks.push(c) }
  return Buffer.concat(chunks).toString('utf8')
}
const parseJson = s => { if (!s.trim()) return {}; try { return JSON.parse(s) } catch { throw Object.assign(new Error('请求体不是合法 JSON'), { code: 400 }) } }
function authorized(req) { const t = process.env.BRAND_API_TOKEN; return !t || req.headers.authorization === 'Bearer ' + t }

export function meta() {
  return {
    brand: core.datasetInfo().brand, modules: core.MODULES.map(m => ({ ...m, tools: core.TOOLS.filter(t => t.module === m.key).map(t => ({ name: t.name, title: t.title, readOnly: t.readOnly })) })),
    experts: core.experts(), scenes: core.scenes(), tasks: core.tasks(), skills: core.listSkills().map(({ path, ...s }) => s),
    scenarios: core.SCENARIOS.map(({ re, ...s }) => s), data: core.dataSources(),
    mode: { online: !!process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' }
  }
}

function openapi() {
  const paths = { '/api/agent/chat': { post: { summary: '智能体对话（text/event-stream）', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, mode: { enum: ['offline', 'online'] }, scenario: { type: 'string' }, module: { type: 'string' }, expert: { type: 'string' }, history: { type: 'array' } } } } } } } } }
  for (const t of core.catalog()) paths['/api/tools/' + t.name] = { post: { summary: t.title + '｜' + t.description, tags: [t.module], requestBody: { content: { 'application/json': { schema: t.inputSchema } } }, responses: { 200: { description: 'JSON 结果' } } } }
  for (const d of Object.keys(core.DATASETS)) {
    paths[`/api/data/${d}/import`] = { post: { summary: `批量导入 ${core.DATASETS[d].name}（JSON 数组 / NDJSON / CSV）`, tags: ['data'], parameters: [{ name: 'dryRun', in: 'query', schema: { type: 'boolean' } }] } }
    paths[`/api/data/${d}/stream`] = { post: { summary: `数据流推入 ${core.DATASETS[d].name}（NDJSON）`, tags: ['data'] } }
  }
  return { openapi: '3.1.0', info: { title: 'brandHarness 品牌洞察 API', version: '0.1.0' }, paths }
}

async function chat(req, res) {
  const body = parseJson(await readBody(req))
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' })
  const send = e => res.write(`data: ${JSON.stringify(e)}\n\n`)
  try {
    const online = body.mode === 'online'
    if (online && !process.env.DEEPSEEK_API_KEY) { send({ type: 'text', md: '未配置 DEEPSEEK_API_KEY，已切换为离线演示模式。' }) }
    const gen = online && process.env.DEEPSEEK_API_KEY
      ? core.deepseekChat([...(body.messages || []), { role: 'user', content: String(body.message || '') }], { expert: body.expert || 'lead', skill: body.skill })
      : core.plan(body.message, { scenario: body.scenario, module: body.module, history: body.history, pace: true })
    for await (const e of gen) send(e)
  } catch (e) { send({ type: 'error', message: e.message }) }
  res.end()
}

async function route(req, res) {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, PUT' }); return res.end() }
  if (p === '/api/health') return json(res, 200, { ok: true, online: !!process.env.DEEPSEEK_API_KEY, tools: core.TOOLS.length })
  if (p === '/api/meta') return json(res, 200, meta())
  if (p === '/api/openapi.json') return json(res, 200, openapi())
  if (p === '/api/tools' && req.method === 'GET') return json(res, 200, core.catalog())
  let m
  if ((m = /^\/api\/tools\/([a-z_]+)$/.exec(p)) && req.method === 'POST') {
    const tool = core.getTool(m[1]); if (!tool) return json(res, 404, { error: '未知工具 ' + m[1] })
    if (!tool.readOnly && !authorized(req)) return json(res, 401, { error: '写类工具需要 Authorization: Bearer <BRAND_API_TOKEN>' })
    return json(res, 200, await core.runTool(m[1], parseJson(await readBody(req))))
  }
  if (p === '/api/agent/chat' && req.method === 'POST') return chat(req, res)
  if (p === '/api/skills' && req.method === 'GET') return json(res, 200, core.listSkills().map(({ path, ...s }) => s))
  if ((m = /^\/api\/skills\/([a-z0-9-]+)$/.exec(p))) {
    if (req.method === 'GET') return json(res, 200, core.getSkill({ name: m[1] }))
    if (req.method === 'PUT') { if (!authorized(req)) return json(res, 401, { error: 'unauthorized' }); return json(res, 200, core.saveSkill({ ...parseJson(await readBody(req)), name: m[1] })) }
  }
  if (p === '/api/data/sources') return json(res, 200, core.dataSources())
  if ((m = /^\/api\/data\/([a-z_]+)\/(import|stream)$/.exec(p)) && req.method === 'POST') {
    if (!authorized(req)) return json(res, 401, { error: '数据写入需要 Authorization: Bearer <BRAND_API_TOKEN>' })
    const raw = await readBody(req)
    const ct = String(req.headers['content-type'] || '')
    const format = url.searchParams.get('format') || (ct.includes('csv') ? 'csv' : ct.includes('ndjson') || m[2] === 'stream' ? 'ndjson' : undefined)
    let payload = raw
    if (ct.includes('application/json') && raw.trim().startsWith('{')) { const b = JSON.parse(raw); if (b.payload || b.records) return json(res, 200, core.importRecords({ dataset: m[1], ...b, mode: m[2] === 'stream' ? 'stream' : 'batch', source: b.source || req.headers['x-source'] || 'api' })) }
    return json(res, 200, core.importRecords({ dataset: m[1], payload, format, dryRun: ['1', 'true'].includes(url.searchParams.get('dryRun')), mode: m[2] === 'stream' ? 'stream' : 'batch', source: req.headers['x-source'] || url.searchParams.get('source') || 'api' }))
  }
  if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' })
  // 静态工作台
  let file = resolve(join(WEB, decodeURIComponent(p === '/' ? '/index.html' : p)))
  if (!file.startsWith(WEB)) return json(res, 403, { error: 'forbidden' })
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) { res.writeHead(404); return res.end('not found') }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
  res.end(await readFile(file))
}

export function start(port = Number(process.env.PORT) || 8787, host = process.env.HOST || '127.0.0.1') {
  const server = createServer((req, res) => route(req, res).catch(e => { if (!res.headersSent) json(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.message }); else res.end() }))
  return new Promise(r => server.listen(port, host, () => { r(server) }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await start()
  const a = s.address()
  console.log(`brandHarness 工作台已启动：http://${a.address}:${a.port}   模式：${process.env.DEEPSEEK_API_KEY ? '在线（DeepSeek）+ 离线演示' : '离线演示（设置 DEEPSEEK_API_KEY 启用在线模型）'}`)
}
