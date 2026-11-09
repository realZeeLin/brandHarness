/** 留痕：每次写操作追加一条 JSONL 记录（谁、做了什么、依据），可回放、可审计。 */
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { workspaceDir } from './dataset.js'

export const sha256 = s => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex')

export function audit({ action, target, actor = 'agent', detail = {} }) {
  const dir = workspaceDir(); mkdirSync(dir, { recursive: true })
  const rec = { id: randomUUID().slice(0, 8), at: new Date().toISOString(), action, target, actor, detail }
  appendFileSync(join(dir, 'audit.jsonl'), JSON.stringify(rec) + '\n')
  return rec
}
export function auditLog({ limit = 20, action } = {}) {
  const f = join(workspaceDir(), 'audit.jsonl')
  if (!existsSync(f)) return { total: 0, records: [] }
  const all = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => !action || r.action.startsWith(action))
  return { total: all.length, records: all.slice(-Math.max(1, Number(limit) || 20)).reverse() }
}
