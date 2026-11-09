/**
 * 在线智能体：DeepSeek（OpenAI 兼容）函数调用循环，工具即 brand-core 注册表。
 * 环境变量：DEEPSEEK_API_KEY（必需）、DEEPSEEK_BASE_URL（默认 https://api.deepseek.com）、DEEPSEEK_MODEL（默认 deepseek-chat）
 */
import { TOOLS, toJsonSchema, runTool } from '../tools.js'
import { listSkills, getSkill } from '../skills.js'
import { experts } from '../modules.js'

export function systemPrompt({ expert = 'lead', skill } = {}) {
  const e = experts().find(x => x.id === expert) || experts()[0]
  const skills = listSkills().map(s => `- ${s.name}（${s.title}，${s.version}）：${s.description}`).join('\n')
  const body = skill ? `\n\n# 当前加载的技能说明\n${getSkill({ name: skill }).body}` : ''
  return `你是「${e.name}」，中粮集团消费者智能洞察平台的智能体，服务品牌与业务人员（只对内运行）。${e.desc}

# 工作守则（必须遵守）
1. 每个数字都来自工具返回，不得自拟；写结论卡时用 insight_compose，并为每条 finding 给出 source{tool,args,path}。
2. 没有依据就写「未知」。insight_compare 返回 verdict=refuse 时必须拒绝给结论，并说明补数路径。
3. 社媒与电商分母不可混算；负面样本 < 50 条不做负向结论；区间值不取端点、不推同比。
4. 写操作（insight_publish / skill_save / data_import）先不带 confirm 调用，把决定权交给人。
5. 回答用中文，先结论后依据，建议附负责部门。

# 技能库（需要时用 skill_get 读取全文）
${skills}${body}`
}

export const openAiTools = () => TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: toJsonSchema(t.parameters) } }))

/** 异步生成器：产出与离线规划器相同的事件类型（route / tool / text / done）。 */
export async function* deepseekChat(messages, { expert = 'lead', skill, maxSteps = 8, apiKey = process.env.DEEPSEEK_API_KEY, baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', model = process.env.DEEPSEEK_MODEL || 'deepseek-chat', fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('未配置 DEEPSEEK_API_KEY')
  const msgs = [{ role: 'system', content: systemPrompt({ expert, skill }) }, ...messages]
  yield { type: 'route', scenario: 'online', label: '在线模型', expert, expertName: experts().find(x => x.id === expert)?.name, model }
  const t0 = Date.now()
  for (let step = 0; step < maxSteps; step++) {
    const res = await fetchImpl(baseUrl.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey }, body: JSON.stringify({ model, messages: msgs, tools: openAiTools(), tool_choice: 'auto', temperature: 0.2 }) })
    if (!res.ok) throw new Error(`DeepSeek API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const m = data.choices?.[0]?.message || {}
    msgs.push(m)
    if (m.content) yield { type: 'text', md: m.content }
    if (!m.tool_calls?.length) { yield { type: 'done', scenario: 'online', ms: Date.now() - t0, usage: data.usage }; return }
    for (const tc of m.tool_calls) {
      let args = {}
      try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
      yield { type: 'tool', phase: 'start', id: tc.id, name: tc.function.name, args, expert, transport: 'Function' }
      const s = Date.now()
      let result
      try { result = await runTool(tc.function.name, args); yield { type: 'tool', phase: 'end', id: tc.id, name: tc.function.name, args, expert, transport: 'Function', ms: Date.now() - s, result } }
      catch (e) { result = { error: e.message }; yield { type: 'tool', phase: 'error', id: tc.id, name: tc.function.name, args, error: e.message } }
      if (tc.function.name === 'insight_compose' && result?.cardId) yield { type: 'card', card: result }
      if (tc.function.name === 'insight_publish' && result?.status === 'needs_confirmation') yield { type: 'gate', cardId: result.cardId, status: result.status, note: result.note }
      if (tc.function.name === 'report_draft' && result?.markdown) yield { type: 'deliverable', kind: 'report', id: result.reportId, title: result.title, status: '待审核', markdown: result.markdown }
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 12000) })
    }
  }
  yield { type: 'text', md: '已达到单轮最多工具调用次数，请缩小问题范围后再问。' }
  yield { type: 'done', scenario: 'online', ms: Date.now() - t0 }
}
