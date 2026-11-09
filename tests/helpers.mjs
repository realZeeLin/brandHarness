import { mkdtempSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** 每个测试文件使用独立的 workspace 与技能目录副本，不污染仓库。 */
export function isolate() {
  const ws = mkdtempSync(join(tmpdir(), 'bh-test-ws-'))
  const sk = mkdtempSync(join(tmpdir(), 'bh-test-sk-'))
  cpSync(join(ROOT, 'skills'), sk, { recursive: true })
  process.env.BRANDHARNESS_WORKSPACE = ws
  process.env.BRANDHARNESS_SKILLS = sk
  return { ws, sk, env: { ...process.env, BRANDHARNESS_WORKSPACE: ws, BRANDHARNESS_SKILLS: sk } }
}
