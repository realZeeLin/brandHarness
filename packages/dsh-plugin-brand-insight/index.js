/**
 * dsh-plugin-brand-insight —— DeepSeek Harness 插件（Cordis 函数形式）。
 *
 * 一切皆插件：本插件不修改 harness 内核，只通过三个扩展点接入：
 *   1. ctx.tools.register(defineTool(...))   九大模块的 27 个工具（与 MCP / API / CLI 同源）
 *   2. ctx.skills.register(...)              专家技能说明（SKILL.md），可用 /技能名 直接调用
 *   3. ctx.systemPrompt.section(...)         品牌洞察工作守则（溯源、护栏、人在环）
 * 写类工具（insight_publish / skill_save / data_import）在 harness 的权限门禁下执行，
 * 且工具本身只有显式 confirm=true 才写盘。
 */
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as core from '@brandharness/brand-core'

export const name = 'brand-insight'
export const inject = ['tools']

export const Config = Schema.object({
  expert: Schema.union(['lead', 'analyst', 'product', 'brief', 'brand', 'activity', 'geo']).default('lead').description('默认专家身份（决定工作守则里的角色描述）'),
  exposeWriteTools: Schema.boolean().default(true).description('是否向模型开放写类工具（签发 / 技能修订 / 数据导入）'),
  dataDir: Schema.string().description('数据目录，缺省使用仓库 data/fulinmen'),
  workspaceDir: Schema.string().description('留痕、结论卡、增量数据的写入目录，缺省为仓库 workspace/')
})

const render = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 1).slice(0, 60000) }]

export function apply(ctx, config = {}) {
  if (config.dataDir) process.env.BRANDHARNESS_DATA = config.dataDir
  if (config.workspaceDir) process.env.BRANDHARNESS_WORKSPACE = config.workspaceDir
  for (const t of core.TOOLS) {
    if (!t.readOnly && config.exposeWriteTools === false) continue
    ctx.tools.register(defineTool({
      name: 'brand_' + t.name,
      description: `【${core.MODULES.find(m => m.key === t.module)?.name}·${t.title}】${t.description}`,
      parameters: t.parameters,
      output: { schema: { type: 'json' }, render },
      isConcurrencySafe: () => t.readOnly,
      async execute(args) { return await core.runTool(t.name, args) }
    }))
  }

  // 技能说明（需要 dsh-skill 服务；缺失时自动跳过）
  ctx.plugin({
    name: 'brand-insight-skills',
    inject: ['skills'],
    apply(sub) {
      for (const s of core.listSkills()) {
        const full = core.getSkill({ name: s.name })
        sub.skills.register({ name: 'brand-' + s.name, description: `${s.title}（${s.version} · ${s.owner}）：${s.description}`, whenToUse: s.trigger, source: 'bundled', path: s.path, content: full.body.replace(/`([a-z_]+)`/g, (m, n) => core.getTool(n) ? '`brand_' + n + '`' : m) })
      }
    }
  })

  // 工作守则段落（需要 dsh-system-prompt 服务；缺失时自动跳过）
  ctx.plugin({
    name: 'brand-insight-prompt',
    inject: ['systemPrompt'],
    apply(sub) {
      sub.systemPrompt.section({ name: 'brand-insight:policy', order: sub.systemPrompt.getSectionOrder('TOOLS_SDK') + 10, interpolate: false, text: core.systemPrompt({ expert: config.expert || 'lead' }).replace(/\b(insight_[a-z]+|skill_[a-z]+|data_[a-z]+|report_draft)\b/g, 'brand_$1') })
    }
  })
}
