/** 技能库：技能说明是 Markdown 文字（DeepSeek Harness SKILL.md 兼容），业务能读、能审、能改，修订留版本。 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { skillsDir } from './dataset.js'
import { audit } from './audit.js'

export function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src)
  if (!m) return { meta: {}, body: src }
  const meta = {}
  let key = null
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (kv) { key = kv[1]; let v = kv[2].trim(); if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean); else v = v.replace(/^['"]|['"]$/g, ''); meta[key] = v }
    else if (key && /^\s+-\s+/.test(line)) { if (!Array.isArray(meta[key])) meta[key] = []; meta[key].push(line.replace(/^\s+-\s+/, '').trim()) }
  }
  return { meta, body: m[2] }
}

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function listSkills() {
  const dir = skillsDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md'))).map(d => {
    const src = readFileSync(join(dir, d.name, 'SKILL.md'), 'utf8')
    const { meta } = parseFrontmatter(src)
    return { name: meta.name || d.name, title: meta.title || meta.name, description: meta.description || '', version: meta.version || 'v0.1', owner: meta.owner || '', expert: meta.expert || '', board: meta.board || '', tools: Array.isArray(meta.tools) ? meta.tools : [], trigger: meta.trigger || '', path: join(dir, d.name, 'SKILL.md') }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export function getSkill({ name }) {
  if (!NAME_RE.test(String(name || ''))) throw new Error('技能名须为 kebab-case，例如 claim-gap-diagnosis')
  const file = join(skillsDir(), name, 'SKILL.md')
  if (!existsSync(file)) throw new Error(`技能不存在：${name}`)
  const content = readFileSync(file, 'utf8')
  const { meta, body } = parseFrontmatter(content)
  const history = existsSync(join(skillsDir(), name, 'CHANGELOG.md')) ? readFileSync(join(skillsDir(), name, 'CHANGELOG.md'), 'utf8') : ''
  return { name, meta, body, content, history }
}

/** 保存 / 回写技能（写操作：必须 confirm，并记录修改人与修改说明）。 */
export function saveSkill({ name, content, author = '未署名', note = '', confirm = false }) {
  if (!NAME_RE.test(String(name || ''))) throw new Error('技能名须为 kebab-case')
  const { meta } = parseFrontmatter(String(content || ''))
  if (!meta.name || !meta.description) throw new Error('技能说明须含 frontmatter：name 与 description')
  if (meta.name !== name) throw new Error(`frontmatter name（${meta.name}）与技能名（${name}）不一致`)
  const dir = join(skillsDir(), name)
  const exists = existsSync(join(dir, 'SKILL.md'))
  const previous = exists ? parseFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf8')).meta.version : null
  if (!confirm) return { status: 'needs_confirmation', name, action: exists ? 'update' : 'create', previousVersion: previous, nextVersion: meta.version || 'v0.1', note: '写入类操作须确认：再次调用并传 confirm=true' }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), content)
  const line = `- ${new Date().toISOString().slice(0, 10)} ${meta.version || 'v0.1'} · ${author}：${note || (exists ? '修订' : '新建')}\n`
  writeFileSync(join(dir, 'CHANGELOG.md'), (existsSync(join(dir, 'CHANGELOG.md')) ? readFileSync(join(dir, 'CHANGELOG.md'), 'utf8') : '# 修订记录\n\n') + line)
  const rec = audit({ action: exists ? 'skill.update' : 'skill.create', target: name, actor: author, detail: { from: previous, to: meta.version, note } })
  return { status: 'saved', name, version: meta.version || 'v0.1', previousVersion: previous, auditId: rec.id }
}
