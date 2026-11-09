#!/usr/bin/env node
/** 从真实运行录制工作台回放数据 apps/workbench/replay.js（无服务端时静态演示用，例如 GitHub Pages）。 */
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.BRANDHARNESS_WORKSPACE = mkdtempSync(join(tmpdir(), 'bh-replay-'))
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const core = await import('@brandharness/brand-core')
const { meta } = await import('@brandharness/brand-server/src/server.js')

const trim = (v, d = 0) => Array.isArray(v) ? v.slice(0, d ? 12 : 40).map(x => trim(x, d + 1)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && x.length > 3000 ? x.slice(0, 3000) + '…' : trim(x, d + 1)])) : v
const scenarios = {}
let history = []
for (const s of core.SCENARIOS) {
  const evs = []
  for await (const e of core.plan(s.prompt, { scenario: s.id, history, pace: true })) evs.push(e.type === 'tool' ? { ...e, result: trim(e.result) } : e)
  scenarios[s.id] = evs
  if (s.id === 't2411') history = [{ q: s.prompt, scenario: s.id, label: s.label, expert: s.expert, tools: evs.filter(e => e.type === 'tool' && e.phase === 'end').map(e => e.name) }]
}
const skills = Object.fromEntries(core.listSkills().map(s => [s.name, core.getSkill({ name: s.name })]))
const m = meta()
writeFileSync(join(root, 'apps', 'workbench', 'replay.js'), '/* 由 scripts/record-replay.mjs 从真实运行录制，供无服务端时静态回放 */\nwindow.__REPLAY__ = ' + JSON.stringify({ recordedAt: new Date().toISOString(), meta: m, scenarios, skills }) + '\n')
console.log('recorded', Object.keys(scenarios).length, 'scenarios')
