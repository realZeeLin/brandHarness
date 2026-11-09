#!/usr/bin/env node
/**
 * 用真实 DeepSeek Harness（headless profile）验证 dsh-plugin-brand-insight：
 *   1. dsh plugin add 安装组合包
 *   2. 启动一个本地 OpenAI 兼容「脚本模型」，第一轮要求调用 brand_insight_query，第二轮读取工具结果作答
 *   3. dsh --profile <p> headless 跑一个任务，断言：工具 schema 已下发、系统提示含品牌守则、技能已注册、工具结果真实返回
 * 需要：Node ≥ 24.9 与 dsh 可执行（环境变量 DSH_BIN 指定，缺省用 PATH 中的 dsh）。
 * 用法：DSH_BIN=/path/to/dsh node tests/dsh/verify-plugin.mjs
 */
import { createServer } from 'node:http'
import { spawnSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DSH = process.env.DSH_BIN || 'dsh'
const home = process.env.DSH_HOME || mkdtempSync(join(tmpdir(), 'dsh-home-'))
const profile = 'brand-verify'
const env = { ...process.env, DSH_HOME: home, MOCK_KEY: 'sk-mock', BRANDHARNESS_WORKSPACE: mkdtempSync(join(tmpdir(), 'bh-ws-')) }
const seen = { requests: 0, tools: [], system: '', toolResult: '', all: '' }

const server = createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c
  if (!req.url.includes('chat/completions')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'mock-model' }] })) }
  const j = JSON.parse(body); seen.requests++
  seen.tools = (j.tools || []).map(t => t.function?.name)
  seen.all += JSON.stringify(j.messages || [])
  seen.system = (j.messages || []).filter(m => m.role === 'system' || m.role === 'developer').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n')
  const toolMsg = (j.messages || []).find(m => m.role === 'tool')
  const stream = j.stream
  let message
  if (!toolMsg) message = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'brand_insight_query', arguments: JSON.stringify({ brand: '福临门', keyword: ['非转基因'], channel: 'ecommerce' }) } }] }
  else { seen.toolResult = typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content); const gap = /"gapPt":\s*([\d.]+)/.exec(seen.toolResult)?.[1]; message = { role: 'assistant', content: `卖点错位 ${gap} 个百分点（来自 brand_insight_query）。` } }
  if (stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const delta = message.tool_calls ? { role: 'assistant', tool_calls: message.tool_calls.map((t, index) => ({ index, ...t })) } : { role: 'assistant', content: message.content }
    res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: 'mock-model', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: 'mock-model', choices: [{ index: 0, delta: {}, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`)
    return res.end('data: [DONE]\n\n')
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: 'mock-model', choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const fail = m => { console.error('✗ ' + m); server.close(); process.exit(1) }
const ok = m => console.log('✓ ' + m)

let r = spawnSync(DSH, ['--profile', profile, '--from-default-profile', 'headless', '--dump-config'], { env, encoding: 'utf8' })
if (r.status !== 0) fail('创建 headless profile 失败：' + r.stderr)
r = spawnSync(DSH, ['plugin', '--profile', profile, 'add', join(root, 'packages', 'dsh-plugin-brand-insight')], { env, encoding: 'utf8' })
if (r.status !== 0) fail('dsh plugin add 失败：' + r.stderr + r.stdout)
ok('dsh plugin add 安装组合包')
mkdirSync(join(home, 'profiles', profile), { recursive: true })
writeFileSync(join(home, 'profiles', profile, 'cordis.patch.yml'), `- id: llm-pi-ai
  config:
    providers:
      mock:
        apiKeyEnv: MOCK_KEY
        api: openai-completions
        baseURL: http://127.0.0.1:${port}/v1
        models:
          - id: mock-model
- id: agent-default-model
  config:
    provider: mock
    model: mock-model
`)
r = spawnSync(DSH, ['--profile', profile, '--dump-config'], { env, encoding: 'utf8' })
if (!/# == dsh-plugin-brand-insight/.test(r.stdout)) fail('组合包层未出现在 --dump-config')
ok('--dump-config 出现 dsh-plugin-brand-insight 层')

const child = spawn(DSH, ['--profile', profile, '--json', '福临门主图的非转基因卖点有没有人接？'], { env, cwd: root })
let out = '', err = ''
child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d)
const code = await new Promise(r => { const t = setTimeout(() => { child.kill(); r(-1) }, 180000); child.on('exit', c => { clearTimeout(t); r(c) }) })
server.close()
if (code !== 0) fail(`headless 退出码 ${code}\n${err.slice(-3000)}\n${out.slice(-2000)}`)
const brandTools = seen.tools.filter(n => n?.startsWith('brand_'))
if (brandTools.length < 20) fail(`模型请求中的 brand_ 工具只有 ${brandTools.length} 个`)
ok(`模型收到 ${brandTools.length} 个 brand_ 工具 schema（共 ${seen.tools.length} 个工具）`)
if (!/工作守则/.test(seen.system)) fail('系统提示未包含品牌洞察工作守则')
ok('系统提示已注入「品牌洞察工作守则」段落')
if (!/brand-claim-gap-diagnosis/.test(seen.all)) fail('技能目录中没有 brand-claim-gap-diagnosis')
ok('技能目录包含 brand-claim-gap-diagnosis 等专家技能')
if (!/"gapPt":\s*14\.3/.test(seen.toolResult)) fail('工具结果未包含 gapPt 14.3：' + seen.toolResult.slice(0, 300))
ok('DSH 智能体真实执行 brand_insight_query，返回卖点错位 14.3pt')
if (!/14\.3/.test(out)) fail('最终输出不含 14.3')
ok('headless 最终回答：' + (out.match(/卖点错位[^"\\]*/)?.[0] || '').slice(0, 60))
console.log(`\n全部通过 · 模型请求 ${seen.requests} 次 · DSH_HOME=${home}`)
