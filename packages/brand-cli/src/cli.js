#!/usr/bin/env node
/**
 * brand —— 品牌洞察命令行（员工做数据分析 / 技能开发的最短路径）
 *   brand tools [模块]                      列出工具
 *   brand call <工具> [--json '{...}'] [--key value ...]   调用工具（输出 JSON）
 *   brand ask "<问题>" [--online]             与智能体对话（离线规划器 / DeepSeek）
 *   brand skills | brand skill <name>        技能库
 *   brand skill-save <name> <SKILL.md> [--confirm] [--author 名字] [--note 说明]
 *   brand import <file> --dataset <name> [--dry-run] [--format csv|ndjson|json]
 *   brand sources                            数据源状态
 *   brand report weekly [--week 46] [--save] 起草周报（Markdown 输出到 stdout）
 */
import { readFileSync } from 'node:fs'
import * as core from '@brandharness/brand-core'

const argv = process.argv.slice(2)
const cmd = argv[0]
function flags(list) {
  const o = {}, pos = []
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a.startsWith('--')) {
      const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      const nx = list[i + 1]
      if (nx === undefined || nx.startsWith('--')) o[k] = true
      else { i++; o[k] = /^-?\d+(\.\d+)?$/.test(nx) ? Number(nx) : /^[[{]/.test(nx) ? JSON.parse(nx) : nx }
    } else pos.push(a)
  }
  return { o, pos }
}
const out = v => process.stdout.write((typeof v === 'string' ? v : JSON.stringify(v, null, 2)) + '\n')
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0); throw e })
const tty = process.stdout.isTTY && !process.env.NO_COLOR
const paint = code => s => tty ? `\x1b[${code}m${s}\x1b[0m` : String(s)
const C = { dim: paint(2), b: paint(1), c: paint(36), y: paint(33), g: paint(32) }

async function main() {
  const { o, pos } = flags(argv.slice(1))
  switch (cmd) {
    case 'tools': {
      for (const m of core.MODULES.filter(m => !pos[0] || m.key === pos[0])) {
        out(C.b(`\n${m.name}`) + C.dim(` (${m.key}) ${m.desc}`))
        for (const t of core.TOOLS.filter(t => t.module === m.key)) out(`  ${C.c(t.name.padEnd(20))} ${t.title}${t.readOnly ? '' : C.y(' [写]')}`)
      }
      return
    }
    case 'call': {
      const name = pos[0]; if (!name) throw new Error('用法：brand call <工具> [--json \'{...}\'] [--key value]')
      const { json, ...rest } = o
      const args = { ...(json || {}), ...rest }
      for (const [k, spec] of Object.entries(core.getTool(name)?.parameters || {})) if (spec.type === 'array' && typeof args[k] === 'string') args[k] = args[k].split(',')
      return out(await core.runTool(name, args))
    }
    case 'ask': {
      const q = pos.join(' '); if (!q) throw new Error('用法：brand ask "问题"')
      const gen = o.online ? core.deepseekChat([{ role: 'user', content: q }], { expert: o.expert || 'lead' }) : core.plan(q, { scenario: o.scenario })
      for await (const e of gen) {
        if (e.type === 'route') out(C.dim(`→ ${e.expertName}${e.skill ? ' · 技能 ' + e.skill.name + ' ' + e.skill.version : ''}`))
        else if (e.type === 'think') out(C.dim('  … ' + e.text))
        else if (e.type === 'plan') out(C.dim('  计划：' + e.steps.map((s, i) => `${i + 1}.${s}`).join('  ')))
        else if (e.type === 'tool' && e.phase === 'end') out(C.c(`  ⚙ ${e.name}`) + C.dim(` ${JSON.stringify(e.args)} · ${e.ms}ms`))
        else if (e.type === 'tool' && e.phase === 'error') out(C.y(`  ⚠ ${e.name}: ${e.error}`))
        else if (e.type === 'text') out('\n' + e.md.replace(/\*\*([^*]+)\*\*/g, (_, s) => C.b(s)) + '\n')
        else if (e.type === 'card') out(C.g(`  ▣ 结论卡 ${e.card.cardId} · 溯源 ${e.card.trace.verified}/${e.card.trace.total} · 强度 ${e.card.strength}`))
        else if (e.type === 'gate') out(C.y(`  ⏸ 签发闸门：${e.note || e.status}（brand call insight_publish --card-id ${e.cardId} --confirm --reviewer 姓名）`))
        else if (e.type === 'deliverable') out(C.g(`  ▣ 交付物：${e.title}（${e.status}）`))
        else if (e.type === 'error') out(C.y('错误：' + e.message))
      }
      return
    }
    case 'skills': return core.listSkills().forEach(s => out(`${C.c(s.name.padEnd(28))} ${s.version.padEnd(6)} ${s.title} ${C.dim('· ' + s.owner)}`))
    case 'skill': return out(core.getSkill({ name: pos[0] }).content)
    case 'skill-save': return out(core.saveSkill({ name: pos[0], content: readFileSync(pos[1], 'utf8'), author: o.author, note: o.note, confirm: !!o.confirm }))
    case 'import': {
      if (!pos[0] || !o.dataset) throw new Error('用法：brand import <file> --dataset <social_posts|ec_reviews|ec_links|geo_answers|brand_facts> [--dry-run]')
      const format = o.format || (pos[0].endsWith('.csv') ? 'csv' : pos[0].endsWith('.ndjson') || pos[0].endsWith('.jsonl') ? 'ndjson' : undefined)
      return out(core.importRecords({ dataset: o.dataset, payload: readFileSync(pos[0], 'utf8'), format, dryRun: !!o.dryRun, source: o.source || 'cli:' + pos[0], actor: o.author || 'cli' }))
    }
    case 'sources': return out(core.dataSources().datasets.map(d => `${d.key.padEnd(14)} ${String(d.rows).padStart(7)} 条  +${d.increments}  ${d.name} · ${d.baseline}`).join('\n'))
    case 'report': return out((await core.runTool('report_draft', { kind: pos[0] || 'weekly', week: o.week, save: !!o.save })).markdown)
    default:
      out(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith(' *   ')).map(l => l.slice(3)).join('\n'))
  }
}
main().catch(e => { process.stderr.write('错误：' + e.message + '\n'); process.exit(1) })
