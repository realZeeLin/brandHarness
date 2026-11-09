#!/usr/bin/env node
/**
 * brand-mcp：零依赖 MCP stdio 服务（JSON-RPC 2.0，按行分隔）。
 * tools      ← brand-core 工具注册表（与 HTTP API / CLI / DSH 插件同源）
 * resources  ← 技能说明 skill://<name>、指标字典 dict://kspec、数据源 data://sources
 * prompts    ← 演示场景（T-2411、周报、立项证据包…）
 * 日志只写 stderr，stdout 只承载协议消息。
 */
import { createInterface } from 'node:readline'
import * as core from '@brandharness/brand-core'

const PROTOCOL = '2025-06-18'
const send = m => process.stdout.write(JSON.stringify(m) + '\n')
const log = (...a) => process.stderr.write('[brand-mcp] ' + a.join(' ') + '\n')

const handlers = {
  initialize: p => ({ protocolVersion: p?.protocolVersion || PROTOCOL, capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'brand-insight', title: '中粮品牌洞察', version: '0.1.0' }, instructions: core.systemPrompt({ expert: 'lead' }) }),
  ping: () => ({}),
  'tools/list': () => ({ tools: core.catalog().map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly } })) }),
  'tools/call': async p => {
    try {
      const out = await core.runTool(p.name, p.arguments || {})
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: out && typeof out === 'object' && !Array.isArray(out) ? out : { value: out }, isError: false }
    } catch (e) { return { content: [{ type: 'text', text: '错误：' + e.message }], isError: true } }
  },
  'resources/list': () => ({ resources: [
    ...core.listSkills().map(s => ({ uri: 'skill://' + s.name, name: s.name, title: s.title + ' ' + s.version, description: s.description, mimeType: 'text/markdown' })),
    { uri: 'dict://kspec', name: 'kspec', title: '指标口径字典', mimeType: 'application/json' },
    { uri: 'data://sources', name: 'sources', title: '数据源状态', mimeType: 'application/json' }
  ] }),
  'resources/read': async p => {
    const uri = String(p.uri || '')
    if (uri.startsWith('skill://')) return { contents: [{ uri, mimeType: 'text/markdown', text: core.getSkill({ name: uri.slice(8) }).content }] }
    if (uri === 'dict://kspec') return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await core.runTool('dict_lookup', {}), null, 1) }] }
    if (uri === 'data://sources') return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(core.dataSources(), null, 1) }] }
    throw Object.assign(new Error('未知资源 ' + uri), { code: -32002 })
  },
  'prompts/list': () => ({ prompts: core.SCENARIOS.map(s => ({ name: s.id, title: s.label, description: `${s.label}（专家：${s.expert}${s.skill ? '，技能：' + s.skill : ''}）` })) }),
  'prompts/get': p => {
    const s = core.SCENARIOS.find(x => x.id === p.name); if (!s) throw Object.assign(new Error('未知提示词 ' + p.name), { code: -32602 })
    const skill = s.skill ? `\n\n请先读取技能说明 skill://${s.skill} 并按其步骤执行。` : ''
    return { description: s.label, messages: [{ role: 'user', content: { type: 'text', text: s.prompt + skill } }] }
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', async line => {
  if (!line.trim()) return
  let msg
  try { msg = JSON.parse(line) } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) }
  if (msg.id === undefined) return // 通知（如 notifications/initialized）
  const h = handlers[msg.method]
  if (!h) return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found: ' + msg.method } })
  try { send({ jsonrpc: '2.0', id: msg.id, result: await h(msg.params || {}) }) }
  catch (e) { send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } }) }
})
rl.on('close', () => process.exit(0))
log('ready · tools=' + core.TOOLS.length)
