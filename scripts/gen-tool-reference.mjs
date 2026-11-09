#!/usr/bin/env node
/** 由工具注册表生成 docs/04-接口参考.md 中的工具清单（保持文档与代码一致）。 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as core from '@brandharness/brand-core'
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', '04-接口参考-API-MCP-CLI-数据接入.md')
const rows = core.MODULES.flatMap(m => core.TOOLS.filter(t => t.module === m.key).map(t => {
  const ps = Object.entries(t.parameters).map(([k, v]) => `\`${k}\`${v.required ? '*' : ''}`).join(' ')
  return `| ${m.name} | \`${t.name}\` | ${t.title}${t.readOnly ? '' : ' **[写]**'} | ${ps || '—'} | ${t.description.replace(/\|/g, '/')} |`
}))
const table = ['| 模块 | 工具 | 名称 | 参数（*必填） | 说明 |', '|---|---|---|---|---|', ...rows].join('\n')
const src = readFileSync(file, 'utf8')
writeFileSync(file, src.replace(/<!-- TOOLS:BEGIN -->[\s\S]*<!-- TOOLS:END -->/, `<!-- TOOLS:BEGIN -->\n${table}\n<!-- TOOLS:END -->`))
console.log('tools', core.TOOLS.length)
