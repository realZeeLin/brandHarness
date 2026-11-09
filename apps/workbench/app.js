/* 品牌智能体工作台 —— 前端（无构建、无依赖）。
 * 左：能力模块（页面 = 工具）/ 专家 / 技能 / 任务；中：专家工作对话；右：交付物 / 证据链 / 工具台 / 技能 / 数据。
 * 连接 brand-server 时实时调用；未连接时播放 replay.js（由 scripts/record-replay.mjs 从真实运行录制）。 */
(function () {
  'use strict'
  const $ = s => document.querySelector(s)
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n }
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const fmt = v => typeof v === 'number' ? v.toLocaleString('zh-CN') : esc(v)

  const ICON = {
    home: '<path d="M4 10.5 12 3l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z"/>',
    sm: '<path d="M4 12a8 8 0 0 1 16 0"/><rect x="3" y="11" width="4" height="8" rx="2"/><rect x="17" y="11" width="4" height="8" rx="2"/>',
    bt: '<path d="M20.5 9a9 9 0 1 1-5.5-5.5M16.7 10.3a5 5 0 1 1-3-3"/><path d="m12 12 9-9m-5 0h5v5"/>',
    ec: '<path d="M5 7h14l1 12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2L5 7Z"/><path d="M8 7V6a4 4 0 0 1 8 0v1"/>',
    pi: '<path d="M9 16c0-1.6-3-3-3-6a6 6 0 0 1 12 0c0 3-3 4.4-3 6H9Zm0 3h6m-5 3h4"/>',
    mk: '<path d="m9 8 11-4v14L9 14H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h4Zm0 0v6m-3 0 2 6h4l-2-5.6"/>',
    geo: '<circle cx="12" cy="12" r="4"/><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
    ai: '<path d="M20 12v4a3 3 0 0 1-3 3H9l-6 3V6a3 3 0 0 1 3-3h7"/><path d="m18 2 1.4 3.6L23 7l-3.6 1.4L18 12l-1.4-3.6L13 7l3.6-1.4L18 2Z"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    admin: '<path d="M4 3v5m0 4v9M12 3v9m0 4v5M20 3v2m0 4v12"/><rect x="1.5" y="8" width="5" height="4" rx="1.5"/><rect x="9.5" y="12" width="5" height="4" rx="1.5"/><rect x="17.5" y="5" width="5" height="4" rx="1.5"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h5"/>'
  }
  const svg = k => `<svg viewBox="0 0 24 24">${ICON[k] || ICON.doc}</svg>`
  const EXPERT_COLOR = { lead: '#1f5eff', analyst: '#0b8a6b', product: '#b7791f', brief: '#6b3fd6', brand: '#d4372c', activity: '#0b6bcb', geo: '#334155' }

  const S = { meta: null, live: false, replay: null, mode: 'offline', running: false, sessions: [], cur: null, activeModule: null, activeDeliverable: null }

  /* ---------------- API ---------------- */
  async function getJson(p) { const r = await fetch(p); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status); return r.json() }
  async function postJson(p, body, method = 'POST') { const r = await fetch(p, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j }
  async function streamChat(body, onEvent) {
    const r = await fetch('/api/agent/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = ''
    while (true) {
      const { value, done } = await rd.read(); if (done) break
      buf += dec.decode(value, { stream: true })
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (chunk.startsWith('data: ')) await onEvent(JSON.parse(chunk.slice(6))) }
    }
  }
  async function replayChat(body, onEvent) {
    const sc = body.scenario || routeLocal(body.message, body.module)
    const evs = S.replay.scenarios[sc] || S.replay.scenarios.overview
    for (const e of evs) { await sleep(e.type === 'tool' && e.phase === 'end' ? 420 : e.type === 'text' ? 260 : 120); await onEvent(e) }
  }
  function routeLocal(msg, module) {
    const map = { overview: 'overview', social: 't2411', brand: 'guard', ecommerce: 't2411', opportunity: 'opportunity', campaign: 'campaign', geo: 'geo', assistant: 'weekly', data: 'data', system: 'capture' }
    if (module) return map[module]
    for (const s of S.meta.scenarios) if (s.reSource && new RegExp(s.reSource, 'i').test(msg)) return s.id
    return 'overview'
  }

  /* ---------------- 左栏 ---------------- */
  function renderLeft() {
    const m = S.meta
    $('#baseInfo').textContent = `DeepSeek Harness 插件 · 工具 ${m.modules.reduce((a, x) => a + x.tools.length, 0)} · 技能 ${m.skills.length}`
    $('#modules').innerHTML = m.modules.map(x => `<div class="it ${S.activeModule === x.key ? 'on' : ''}" data-module="${x.key}" title="${esc(x.desc)}\n工具：${x.tools.map(t => t.name).join('、')}"><span class="ic">${svg(x.icon)}</span>${esc(x.name)}<span class="ct">${x.tools.length}</span></div>`).join('')
    $('#experts').innerHTML = m.experts.map(e => `<div class="it" data-expert="${e.id}" title="${esc(e.desc)}"><span class="ava" style="background:${EXPERT_COLOR[e.id]}">${esc(e.short.slice(0, 1))}</span>${esc(e.name)}<span class="ct"><span class="tag">${esc(e.phase)}</span></span><span class="dot ${e.online ? 'on' : ''}"></span></div>`).join('')
    $('#skillCount').textContent = m.skills.length + ' 项'
    $('#skills').innerHTML = m.skills.map(s => `<div class="it" data-skill="${s.name}" title="${esc(s.description)}"><span class="ic">${svg('doc')}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title)}</span><span class="ct">${esc(s.version)}</span></div>`).join('')
    $('#tasks').innerHTML = m.tasks.map(t => `<div class="it" data-task="${t.scenario}" title="${esc(t.title)}"><span class="sub" style="width:44px">${t.id}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(t.title)}</span><span class="tag ${/待|草稿/.test(t.status) ? 'warn' : /拒/.test(t.status) ? 'bad' : 'pri'}">${esc(t.status)}</span></div>`).join('')
  }
  $('#left').addEventListener('click', e => {
    const it = e.target.closest('.it'); if (!it) return
    if (it.dataset.module) { S.activeModule = it.dataset.module; renderLeft(); showModule(it.dataset.module) }
    else if (it.dataset.expert) { const ex = S.meta.experts.find(x => x.id === it.dataset.expert); $('#input').value = `@${ex.name} `; $('#input').focus() }
    else if (it.dataset.skill) { openTab('skill'); showSkill(it.dataset.skill) }
    else if (it.dataset.task) { const sc = S.meta.scenarios.find(s => s.id === it.dataset.task); newSession(); ask(sc.prompt, { scenario: sc.id }) }
  })
  $('#newTask').onclick = () => newSession()

  /* 模块入口：右侧展示「这个页面 = 这些工具」，可直接试运行或让智能体分析 */
  function showModule(key) {
    const m = S.meta.modules.find(x => x.key === key)
    openTab('lab')
    renderLab(m.tools[0]?.name, key)
    const sc = S.meta.scenarios.find(s => s.id === routeLocal('', key))
    renderChips([`让智能体分析「${m.name}」`, sc?.prompt].filter(Boolean), { [`让智能体分析「${m.name}」`]: { module: key } })
  }

  /* ---------------- 会话 ---------------- */
  function newSession() {
    S.cur = { id: Date.now(), title: '新任务', events: [], deliverables: [], traces: [], history: [], expert: 'lead' }
    S.sessions.push(S.cur)
    $('#title').textContent = '新任务'; $('#expertTag').textContent = '中粮营销 AI 助手'; $('#skillTag').hidden = true; $('#stat').textContent = ''
    $('#wrap').innerHTML = ''; welcome(); renderDeliver(); renderTrace()
    renderChips(S.meta.scenarios.slice(0, 4).map(s => s.prompt))
  }
  function welcome() {
    const w = el('div', 'welcome')
    w.innerHTML = `<h1>今天要推进哪件品牌工作？</h1><p>总助手会判断问题属于哪个业务场景，指派专家、加载技能、调用九大模块工具，交付物出现在右侧；签发、技能修订、数据入库都由你确认。</p>
      <div class="grid3">${S.meta.scenarios.filter(s => s.id !== 'capture').slice(0, 9).map(s => { const ex = S.meta.experts.find(e => e.id === s.expert); return `<div class="qcard" data-sc="${s.id}"><span class="tag" style="color:${EXPERT_COLOR[s.expert]}">${esc(ex?.name || '')}</span><b>${esc(s.label)}</b><span>${esc(s.prompt)}</span></div>` }).join('')}</div>`
    w.addEventListener('click', e => { const c = e.target.closest('.qcard'); if (c) { const sc = S.meta.scenarios.find(s => s.id === c.dataset.sc); ask(sc.prompt, { scenario: sc.id }) } })
    $('#wrap').appendChild(w)
  }
  function renderChips(items, special = {}) {
    $('#chips').innerHTML = ''
    for (const t of items) { const c = el('span', 'chip', esc(t)); c.onclick = () => ask(t, special[t] || {}); $('#chips').appendChild(c) }
  }
  const toBottom = () => { const t = $('#thread'); t.scrollTop = t.scrollHeight }

  async function ask(text, opts = {}) {
    if (S.running || !text.trim()) return
    if (!S.cur) newSession()
    const w = $('.welcome'); if (w) w.remove()
    S.running = true; $('#send').disabled = true
    const mention = /@(\S+)/.exec(text); const expert = mention && S.meta.experts.find(e => text.includes(e.name))
    const row = el('div', 'row u'); row.appendChild(el('div', 'bub', esc(text))); $('#wrap').appendChild(row); toBottom()
    const ctx = { body: null, plan: null, tools: {}, toolsUsed: [], t0: Date.now(), scenario: null }
    const body = { message: text, mode: S.mode, scenario: opts.scenario, module: opts.module, history: S.cur.history, expert: expert?.id }
    try { await (S.live ? streamChat(body, e => onEvent(e, ctx)) : replayChat(body, e => onEvent(e, ctx))) }
    catch (e) { agentBody(ctx).appendChild(el('div', 'txt', `<p style="color:var(--bad)">出错：${esc(e.message)}</p>`)) }
    S.cur.history.push({ q: text, scenario: ctx.scenario, label: ctx.label, expert: ctx.expert, tools: ctx.toolsUsed })
    S.running = false; $('#send').disabled = false
  }

  function agentBody(ctx) {
    if (!ctx.body) { const r = el('div', 'row'); const ex = S.meta.experts.find(e => e.id === (ctx.expert || 'lead')); r.innerHTML = `<span class="ava" style="background:${EXPERT_COLOR[ex?.id || 'lead']}">${esc(ex?.short?.slice(0, 1) || 'AI')}</span>`; ctx.body = el('div', 'body'); r.appendChild(ctx.body); $('#wrap').appendChild(r) }
    return ctx.body
  }
  const add = (ctx, node) => { agentBody(ctx).appendChild(node); toBottom(); return node }

  async function onEvent(e, ctx) {
    S.cur.events.push(e)
    switch (e.type) {
      case 'route': {
        ctx.expert = e.expert; ctx.scenario = e.scenario; ctx.label = e.label
        const ex = S.meta.experts.find(x => x.id === e.expert)
        const h = el('div', 'handoff', `<span class="ava" style="background:${EXPERT_COLOR[e.expert] || '#1f5eff'};width:20px;height:20px;font-size:10px">${esc(ex?.short?.slice(0, 1) || 'AI')}</span>总助手 → <b>${esc(e.expertName || '')}</b> 接手${e.skill ? ` · 加载技能 <span class="tag gold">${esc(e.skill.title)} ${esc(e.skill.version)}</span>` : ''}${e.model ? ` · 模型 <span class="tag">${esc(e.model)}</span>` : ''}`)
        $('#wrap').appendChild(h); ctx.body = null; agentBody(ctx)
        if (S.cur.title === '新任务') { S.cur.title = e.label; $('#title').textContent = e.label }
        $('#expertTag').textContent = e.expertName || '总助手'
        if (e.skill) { $('#skillTag').hidden = false; $('#skillTag').textContent = '技能 · ' + e.skill.title + ' ' + e.skill.version } else $('#skillTag').hidden = true
        break
      }
      case 'think': add(ctx, el('div', 'think', esc(e.text))); break
      case 'plan': { const b = el('div', 'box plan', `<h5>执行计划 · ${e.steps.length} 步</h5><ul>${e.steps.map(s => `<li><i></i>${esc(s)}</li>`).join('')}</ul>`); ctx.plan = b; add(ctx, b); break }
      case 'step': { const li = ctx.plan?.querySelectorAll('li')[e.index]; if (li) li.className = e.status; break }
      case 'tool': return onTool(e, ctx)
      case 'text': add(ctx, el('div', 'txt', md(e.md))); break
      case 'quotes': add(ctx, el('div', 'quotes', e.items.map(q => `<div class="q"><div class="qh"><span class="tag">${esc(q.platform)}</span>${esc(q.date || '')}${q.sentiment ? `<span class="tag ${q.sentiment === '负面' ? 'bad' : q.sentiment === '正面' ? 'ok' : ''}">${esc(q.sentiment)}</span>` : ''}${q.promo ? '<span class="tag warn">促销话术</span>' : ''}${q.interactions != null ? `<span class="sp"></span>互动 ${q.interactions}` : ''}</div>${esc(q.quote)}</div>`).join(''))); break
      case 'table': add(ctx, el('div', 'box', `<h6>${esc(e.title)}</h6><div style="overflow:auto"><table class="t"><tr>${e.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${e.rows.map(r => `<tr>${r.map(v => `<td class="${typeof v === 'number' ? 'n' : ''}">${fmt(v)}</td>`).join('')}</tr>`).join('')}</table></div>`)); break
      case 'chart': add(ctx, el('div', 'box', `<h6>${esc(e.title)}</h6><div style="padding:8px 10px">${barChart(e.labels, e.values)}</div>`)); break
      case 'kpis': add(ctx, el('div', 'kpis', e.items.map(([k, v, u]) => `<div class="kpi"><span>${esc(k)}</span><b>${fmt(v)}<small>${esc(u)}</small></b></div>`).join(''))); break
      case 'card': { add(ctx, cardMini(e.card)); addDeliverable({ kind: 'card', id: e.card.cardId, title: '结论卡 · ' + e.card.question, status: e.card.status === 'draft' ? '待签发' : '不可签发', card: e.card, markdown: cardMd(e.card) }); break }
      case 'gate': add(ctx, gateBox(e)); break
      case 'deliverable': addDeliverable(e); add(ctx, el('div', 'txt', `<p><span class="tag pri">交付物</span> 已放入右侧：<b>${esc(e.title)}</b>（${esc(e.status)}）</p>`)); break
      case 'skill': addDeliverable({ kind: 'skill', id: e.name, title: '技能草稿 · ' + e.name, status: '待确认写入', content: e.content }); break
      case 'suggest': renderChips(e.items); break
      case 'done': add(ctx, el('div', 'done', `用时 ${((e.ms || Date.now() - ctx.t0) / 1000).toFixed(1)}s · 调用工具 ${ctx.toolsUsed.length} 次 · 全部数字来自工具返回`)); $('#stat').textContent = `工具 ${S.cur.traces.length} 次 · 交付物 ${S.cur.deliverables.length}`; break
      case 'error': add(ctx, el('div', 'txt', `<p style="color:var(--bad)">${esc(e.message)}</p>`)); break
    }
  }

  function onTool(e, ctx) {
    if (e.phase === 'start') {
      const b = el('div', 'box tool', `<div class="th"><span class="tp ${e.transport}">${e.transport}</span><span class="nm">${esc(e.name)}</span><span class="st"><span class="spin"></span> 执行中</span><span class="sp"></span>${e.expert && e.expert !== ctx.expert ? `<span class="tag" style="color:${EXPERT_COLOR[e.expert]}">${esc(S.meta.experts.find(x => x.id === e.expert)?.name || '')}</span>` : ''}<span class="small">${esc(toolTitle(e.name))}</span></div><div class="tb"></div>`)
      b.querySelector('.th').onclick = () => b.classList.toggle('open')
      ctx.tools[e.id] = b; add(ctx, b); return
    }
    const b = ctx.tools[e.id] || add(ctx, el('div', 'box tool', `<div class="th"><span class="tp ${e.transport}">${e.transport}</span><span class="nm">${esc(e.name)}</span><span class="st"></span></div><div class="tb"></div>`))
    const st = b.querySelector('.st')
    if (e.phase === 'error') { st.className = 'st err'; st.textContent = '失败：' + e.error; return }
    st.className = 'st ok'; st.textContent = `完成 · ${(e.ms / 1000).toFixed(2)}s`
    ctx.toolsUsed.push(e.name)
    b.querySelector('.tb').innerHTML = `<div class="lab">参数</div><pre>${esc(JSON.stringify(e.args))}</pre><div class="lab">返回摘要</div>${summarize(e.result)}<div class="actions"><button class="btn sm" data-a="trace">在证据链中查看完整返回</button></div>`
    b.querySelector('[data-a=trace]').onclick = ev => { ev.stopPropagation(); openTab('trace'); setTimeout(() => document.getElementById('tr-' + e.id)?.scrollIntoView({ behavior: 'smooth' }), 50) }
    S.cur.traces.push({ ...e, expert: ctx.expert }); renderTrace()
  }
  const toolTitle = n => { for (const m of S.meta.modules) { const t = m.tools.find(x => x.name === n); if (t) return m.name + ' · ' + t.title } return '' }

  function summarize(r) {
    if (!r || typeof r !== 'object') return `<pre>${esc(JSON.stringify(r))}</pre>`
    const rows = []
    for (const [k, v] of Object.entries(r)) {
      if (k === 'caveats' || k === 'markdown' || k === 'content' || k === 'body') continue
      if (v == null) continue
      if (typeof v !== 'object') rows.push([k, esc(v)])
      else if (Array.isArray(v)) rows.push([k, `${v.length} 项${v.length && typeof v[0] !== 'object' ? '：' + esc(v.slice(0, 6).join('、')) : v.length && v[0].name ? '：' + esc(v.slice(0, 4).map(x => x.name + (x.n != null ? ' ' + x.n : '')).join('、')) : ''}`])
      else rows.push([k, esc(Object.entries(v).slice(0, 5).map(([a, b]) => a + '=' + (typeof b === 'object' ? '…' : b)).join(' · '))])
      if (rows.length >= 8) break
    }
    const cav = (r.caveats || []).slice(0, 2).map(c => `<div class="small" style="margin-top:4px">⚑ ${esc(c)}</div>`).join('')
    return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>${cav}`
  }

  function cardMini(c) {
    const b = el('div', 'box cardmini', `<div class="cm"><div style="display:flex;gap:6px;align-items:center"><span class="tag pri">结论卡 ${esc(c.cardId)}</span><span class="tag ${c.trace.rate === 100 ? 'ok' : 'bad'}">数字溯源 ${c.trace.verified}/${c.trace.total}</span><span class="tag warn">强度 ${esc(c.strength)}</span></div><div class="one">${esc(c.oneLiner)}</div>${c.findings.map(f => `<div class="find"><span class="v">${esc(f.display)}</span><span>${esc(f.text)}</span><span class="src" title="${esc(JSON.stringify(f.source.args))}">${f.verified ? '✓' : '✗'} ${esc(f.source.tool)}.${esc(f.source.path)}</span></div>`).join('')}</div>`)
    return b
  }
  function cardMd(c) {
    return [`# ${c.cardId} · ${c.question}`, '', `> 一句话结论：${c.oneLiner}`, '', `**结论强度**：${c.strength}　**数字溯源**：${c.trace.verified}/${c.trace.total}`, '', '## 结论与依据', ...c.findings.map((f, i) => `${i + 1}. **${f.text}** — ${f.display}（\`${f.source.tool}\` → \`${f.source.path}\`）`), '', '## 建议', c.recommendation, '', '## 下一步', ...(c.nextSteps || []).map(s => '- ' + s), '', '## 风险与前提', ...(c.risks || []).map(s => '- ' + s), '', '## 口径说明', ...(c.caveats || []).map(s => '- ' + s)].join('\n')
  }
  function gateBox(e) {
    const g = el('div', 'gate', `<b>⏸ 签发闸门</b>　${esc(e.note || '须由分析师 / 品牌经理确认')}<div class="gf"><input placeholder="审核人姓名（必填）" value="品牌经理（演示）"><button class="btn ok">确认签发 ${esc(e.cardId)}</button></div>`)
    g.querySelector('button').onclick = async () => {
      const reviewer = g.querySelector('input').value.trim(); if (!reviewer) return toast('请填写审核人')
      try {
        const r = S.live ? await postJson('/api/tools/insight_publish', { cardId: e.cardId, confirm: true, reviewer }) : { status: 'published', sha256: 'replay-' + Math.random().toString(16).slice(2, 18), file: 'workspace/insights/' + e.cardId + '.md' }
        g.innerHTML = `<b style="color:var(--ok)">✓ 已签发</b>　审核人 ${esc(reviewer)} · sha256 <code>${esc(String(r.sha256).slice(0, 16))}…</code> · ${esc(r.file || '')}${S.live ? '' : '（回放模式，未写盘）'}`
        g.style.background = 'var(--okbg)'; g.style.borderColor = '#bfe8d6'
        const d = S.cur.deliverables.find(x => x.id === e.cardId); if (d) { d.status = '已签发'; renderDeliver() }
        renderChips(['把这次分析沉淀成技能', '起草本周商情周报'])
      } catch (err) { toast('签发失败：' + err.message) }
    }
    return g
  }

  /* ---------------- 右栏：交付物 ---------------- */
  function addDeliverable(d) { const i = S.cur.deliverables.findIndex(x => x.id === d.id); if (i >= 0) S.cur.deliverables[i] = { ...S.cur.deliverables[i], ...d }; else S.cur.deliverables.push(d); S.activeDeliverable = d.id; renderDeliver(); openTab(d.kind === 'skill' ? 'deliver' : 'deliver') }
  function renderDeliver() {
    const ds = S.cur?.deliverables || []
    $('#dCount').textContent = ds.length
    const p = $('#pane-deliver')
    if (!ds.length) { p.innerHTML = `<div class="empty">${svg('doc')}结论卡、周报、立项证据包、纠偏素材、技能草稿会出现在这里。<br>每一份都可以导出、签发或回写为技能。</div>`; return }
    const cur = ds.find(d => d.id === S.activeDeliverable) || ds.at(-1)
    p.innerHTML = `<div class="dl">${ds.map(d => `<span class="d ${d === cur ? 'on' : ''}" data-id="${esc(d.id)}">${esc(d.title.slice(0, 22))}</span>`).join('')}</div>`
    p.querySelectorAll('.d').forEach(n => n.onclick = () => { S.activeDeliverable = n.dataset.id; renderDeliver() })
    const head = el('div', null, `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><b style="font-size:14px">${esc(cur.title)}</b><span class="sp"></span><span class="tag ${/已/.test(cur.status) ? 'ok' : 'warn'}">${esc(cur.status)}</span></div>`)
    p.appendChild(head)
    if (cur.kind === 'skill') {
      const ta = el('textarea', 'editor'); ta.value = cur.content; p.appendChild(ta)
      const a = el('div', 'actions', `<button class="btn ok">确认写入技能库</button><button class="btn">下载 SKILL.md</button>`); p.appendChild(a)
      a.children[0].onclick = async () => {
        cur.content = ta.value
        try {
          const r = S.live ? await postJson('/api/skills/' + cur.id, { content: ta.value, author: '品牌经理（演示）', note: '由会话沉淀', confirm: true }, 'PUT') : { status: 'saved', version: 'v0.1' }
          cur.status = '已写入 ' + r.version; toast(S.live ? `技能 ${cur.id} 已写入技能库并留痕` : '回放模式：未实际写入'); if (S.live) await reloadMeta(); renderDeliver()
        } catch (e) { toast('写入失败：' + e.message) }
      }
      a.children[1].onclick = () => download(cur.id + '-SKILL.md', ta.value)
      return
    }
    if (cur.kind === 'data') { p.appendChild(el('div', 'small', '数据接入面板在「数据」标签页。')); openTab('data'); return }
    p.appendChild(el('div', 'doc', md(cur.markdown || '')))
    const a = el('div', 'actions', `<button class="btn">导出 Markdown</button><button class="btn">复制</button>${cur.kind === 'report' ? '<button class="btn">把审核意见回写技能</button>' : ''}`); p.appendChild(a)
    a.children[0].onclick = () => download(cur.id + '.md', cur.markdown)
    a.children[1].onclick = () => { navigator.clipboard?.writeText(cur.markdown); toast('已复制') }
    if (a.children[2]) a.children[2].onclick = () => { openTab('skill'); showSkill('edible-oil-weekly-brief', '\n## 审核意见回写（' + new Date().toISOString().slice(0, 10) + '）\n- 「价格」栏目只列偏离最大的 2 条，并附店铺类型\n') }
  }

  /* ---------------- 右栏：证据链 ---------------- */
  function renderTrace() {
    const ts = S.cur?.traces || []
    $('#tCount').textContent = ts.length
    const p = $('#pane-trace')
    if (!ts.length) { p.innerHTML = `<div class="empty">${svg('data')}每一次工具调用都会记录：谁调用、用了什么参数、返回了什么。<br>同一个工具可以用 MCP / API / CLI 复现。</div>`; return }
    p.innerHTML = `<div class="small" style="margin-bottom:8px">本会话 ${ts.length} 次工具调用 · 可回放、可审计；点「复现」拿到同一调用的 CLI / HTTP / MCP 写法</div><div class="trace">${ts.map(t => `<div class="tr" id="tr-${t.id}"><div class="h"><span class="tp ${t.transport}">${t.transport}</span><b>${esc(t.name)}</b><span class="sub">${esc(S.meta.experts.find(e => e.id === t.expert)?.name || '')} · ${(t.ms / 1000).toFixed(2)}s</span></div><div class="snip"><button data-k="json" class="on">返回</button><button data-k="cli">CLI</button><button data-k="http">HTTP</button><button data-k="mcp">MCP</button></div><pre>${esc(JSON.stringify(t.result, null, 1)).slice(0, 4000)}</pre></div>`).join('')}</div>`
    p.querySelectorAll('.tr').forEach((n, i) => n.querySelectorAll('.snip button').forEach(b => b.onclick = () => { n.querySelectorAll('.snip button').forEach(x => x.classList.toggle('on', x === b)); n.querySelector('pre').textContent = snippet(ts[i], b.dataset.k) }))
  }
  function snippet(t, k) {
    if (k === 'json') return JSON.stringify(t.result, null, 1).slice(0, 4000)
    if (k === 'cli') return `npx brand call ${t.name} --json '${JSON.stringify(t.args)}'`
    if (k === 'http') return `curl -s -X POST http://127.0.0.1:8787/api/tools/${t.name} \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify(t.args)}'`
    return JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: t.name, arguments: t.args } }, null, 1) + '\n\n# DeepSeek Harness 中工具名为 brand_' + t.name
  }

  /* ---------------- 右栏：工具台（员工做数据分析 / 技能开发） ---------------- */
  async function renderLab(toolName, moduleKey) {
    const p = $('#pane-lab')
    if (!S.live) { p.innerHTML = `<div class="empty">${svg('admin')}工具台需要连接 brand-server（<code>npm start</code>）。<br>回放模式下可在「证据链」查看每个工具的真实返回。</div>`; return }
    const cat = S.catalog || (S.catalog = await getJson('/api/tools'))
    const mods = S.meta.modules
    const mk = moduleKey || cat.find(t => t.name === toolName)?.module || mods[0].key
    const list = cat.filter(t => t.module === mk)
    const t = list.find(x => x.name === toolName) || list[0]
    const m = mods.find(x => x.key === mk)
    p.innerHTML = `<div class="form"><div class="small">「${esc(m.name)}」页面背后的工具 —— 同一份定义供页面、智能体、MCP、API、CLI 调用</div>
      <label>模块</label><select id="labMod">${mods.map(x => `<option value="${x.key}" ${x.key === mk ? 'selected' : ''}>${esc(x.name)}（${x.tools.length}）</option>`).join('')}</select>
      <label>工具</label><select id="labTool">${list.map(x => `<option value="${x.name}" ${x === t ? 'selected' : ''}>${x.name} · ${esc(x.title)}${x.readOnly ? '' : ' [写]'}</option>`).join('')}</select>
      <div class="small" style="margin-top:6px">${esc(t.description)}</div>
      <label>参数（JSON）</label><textarea id="labArgs">${esc(JSON.stringify(exampleArgs(t), null, 1))}</textarea>
      <div class="actions"><button class="btn pri" id="labRun">运行</button><button class="btn" id="labAsk">让智能体用它</button></div>
      <pre id="labOut" style="max-height:420px">${esc(JSON.stringify(t.inputSchema, null, 1))}</pre></div>`
    $('#labMod').onchange = e => renderLab(null, e.target.value)
    $('#labTool').onchange = e => renderLab(e.target.value, mk)
    $('#labRun').onclick = async () => { $('#labOut').textContent = '运行中…'; try { const args = JSON.parse($('#labArgs').value || '{}'); const r = await postJson('/api/tools/' + t.name, args); $('#labOut').textContent = JSON.stringify(r, null, 1) } catch (e) { $('#labOut').textContent = '错误：' + e.message } }
    $('#labAsk').onclick = () => { $('#input').value = `#${m.name} 用 ${t.name}（${t.title}）帮我看一下`; $('#input').focus() }
  }
  function exampleArgs(t) {
    const ex = { insight_query: { brand: '福临门', keyword: ['日期新鲜'], days: 14 }, insight_evidence: { keyword: ['漏油'], limit: 4 }, insight_compare: { dim: 'cat', values: ['花生油', '玉米油'] }, opportunity_pack: { id: 'OP-003' }, geo_fact_draft: { questionId: 'Q-02' }, report_draft: { kind: 'weekly', week: 46 }, dict_lookup: { q: '卖点错位' }, skill_get: { name: 'claim-gap-diagnosis' }, ec_claim_gap: { claims: ['少油烟', '不起沫'] }, insight_publish: { cardId: 'T-2411', confirm: false }, data_import: { dataset: 'social_posts', dryRun: true, records: [{ text: '福临门花生油炒菜很香，桶也没漏', date: '2026-11-03', platform: '小红书' }] } }
    return ex[t.name] || {}
  }

  /* ---------------- 右栏：技能 ---------------- */
  async function showSkill(name, append = '') {
    const p = $('#pane-skill')
    const sk = S.meta.skills.find(s => s.name === name) || S.meta.skills[0]
    let full = null
    if (S.live) full = await getJson('/api/skills/' + sk.name)
    else full = S.replay.skills?.[sk.name]
    p.innerHTML = `<div class="form"><label>技能</label><select id="skSel">${S.meta.skills.map(s => `<option value="${s.name}" ${s.name === sk.name ? 'selected' : ''}>${esc(s.title)} · ${s.version} · ${esc(s.owner)}</option>`).join('')}</select>
      <div class="small" style="margin:6px 0">${esc(sk.description)}</div><div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">${(sk.tools || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <textarea class="editor" id="skEd"></textarea>
      <div class="actions"><button class="btn ok" id="skSave">保存修订（需确认）</button><button class="btn" id="skUse">用这个技能开始任务</button></div>
      <div class="small">技能是文字：业务能读、能审、能改；保存会递增版本并记入修订记录与留痕。DeepSeek Harness 中以 <code>/brand-${esc(sk.name)}</code> 调用。</div>
      <pre style="margin-top:8px;max-height:140px">${esc(full?.history || '')}</pre></div>`
    $('#skEd').value = (full?.content || '（回放模式未包含全文）') + append
    $('#skSel').onchange = e => showSkill(e.target.value)
    $('#skUse').onclick = () => { const sc = S.meta.scenarios.find(s => s.skill === sk.name); if (sc) ask(sc.prompt, { scenario: sc.id }); else { $('#input').value = `/${sk.name} `; $('#input').focus() } }
    $('#skSave').onclick = async () => {
      if (!S.live) return toast('回放模式不能写入；请运行 npm start')
      let content = $('#skEd').value
      const v = /version:\s*v(\d+)\.(\d+)/.exec(content); if (v) content = content.replace(/version:\s*v\d+\.\d+/, `version: v${v[1]}.${+v[2] + 1}`)
      if (!confirm('确认把修订写入技能库？将记录修订人与留痕。')) return
      try { const r = await postJson('/api/skills/' + sk.name, { content, author: '品牌经理（演示）', note: '工作台修订', confirm: true }, 'PUT'); toast(`已保存 ${sk.name} ${r.version}（上一版 ${r.previousVersion}）`); await reloadMeta(); showSkill(sk.name) } catch (e) { toast('保存失败：' + e.message) }
    }
  }

  /* ---------------- 右栏：数据接入 ---------------- */
  async function renderData() {
    const p = $('#pane-data')
    const d = S.live ? await getJson('/api/data/sources') : S.meta.data
    p.innerHTML = `<div class="small" style="margin-bottom:8px">所有数据都可更新：批量导入或数据流推入，入库前过四道筛（结构 · 去重 · 去无效 · 相关性），入库后智能体下一次调用即用上。</div>
      <table class="t"><tr><th>数据集</th><th>条数</th><th>增量</th><th>最近同步</th></tr>${d.datasets.map(x => `<tr><td>${esc(x.name)}<div class="sub">${x.key} · ${esc(x.baseline)}</div></td><td class="n">${fmt(x.rows)}</td><td class="n">${x.increments ? '+' + x.increments : '—'}</td><td class="sub">${x.lastSync ? esc(x.lastSync.slice(5, 16).replace('T', ' ')) : '—'}</td></tr>`).join('')}</table>
      <div class="form" style="margin-top:12px"><label>导入到</label><select id="dsSel">${d.datasets.map(x => `<option value="${x.key}">${esc(x.name)}（${x.key}）</option>`).join('')}</select>
      <div class="small" id="dsFields" style="margin-top:6px"></div>
      <label>粘贴数据（CSV / NDJSON / JSON 数组）</label><textarea id="dsPayload" style="min-height:120px"></textarea>
      <div class="actions"><button class="btn" id="dsDry">预检（不入库）</button><button class="btn pri" id="dsGo">确认导入</button></div>
      <pre id="dsOut" style="display:none"></pre></div>
      <div class="box" style="margin-top:12px"><h6>接口（外部系统 / 采集器 / 消息队列）</h6><div style="padding:10px 12px;font-size:12.5px"><div>批量：<code>${esc(d.endpoints.batch)}</code></div><div style="margin-top:4px">流式：<code>${esc(d.endpoints.stream)}</code></div><div style="margin-top:4px">智能体：<code>${esc(d.endpoints.mcp)}</code> · 命令行：<code>${esc(d.endpoints.cli)}</code></div></div></div>`
    const sel = $('#dsSel')
    const fill = () => { const x = d.datasets.find(y => y.key === sel.value); $('#dsFields').innerHTML = Object.entries(x.fields).map(([k, v]) => `<code>${k}</code> ${esc(v)}`).join('；'); $('#dsPayload').value = JSON.stringify([x.example], null, 1) }
    sel.onchange = fill; fill()
    const go = async dry => {
      if (!S.live) return toast('回放模式不能写入；请运行 npm start')
      if (!dry && !confirm('确认把通过质检的记录写入数据集？')) return
      const out = $('#dsOut'); out.style.display = 'block'; out.textContent = '处理中…'
      try { const r = await postJson(`/api/data/${sel.value}/import`, { payload: $('#dsPayload').value, dryRun: dry, source: '工作台粘贴' }); out.textContent = JSON.stringify(r, null, 1); if (!dry) { toast(`入库 ${r.accepted} 条（收到 ${r.received}）`); await reloadMeta(); renderData() } } catch (e) { out.textContent = '错误：' + e.message }
    }
    $('#dsDry').onclick = () => go(true); $('#dsGo').onclick = () => go(false)
  }

  /* ---------------- 通用 ---------------- */
  function openTab(k) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === k))
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + k))
    if (k === 'lab' && !$('#pane-lab').innerHTML) renderLab()
    if (k === 'skill' && !$('#pane-skill').innerHTML) showSkill(S.meta.skills[0].name)
    if (k === 'data') renderData()
  }
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) openTab(b.dataset.tab) }
  function md(src) {
    const lines = String(src || '').split('\n'); let html = '', list = null, table = null
    const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
    const close = () => { if (list) { html += `</${list}>`; list = null } if (table) { html += '</table>'; table = null } }
    for (const l of lines) {
      let m
      if ((m = /^(#{1,3})\s+(.*)/.exec(l))) { close(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>` }
      else if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul' } html += `<li>${inline(m[1])}</li>` }
      else if ((m = /^\s*\d+\.\s+(.*)/.exec(l))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol' } html += `<li>${inline(m[1])}</li>` }
      else if (/^\|/.test(l)) { if (/^\|[\s-:|]+\|$/.test(l)) continue; if (!table) { close(); html += '<table class="t">'; table = 1 } html += '<tr>' + l.split('|').slice(1, -1).map(c => `<td>${inline(c.trim())}</td>`).join('') + '</tr>' }
      else if ((m = /^>\s?(.*)/.exec(l))) { close(); html += `<blockquote>${inline(m[1])}</blockquote>` }
      else if (!l.trim()) close()
      else { close(); html += `<p>${inline(l)}</p>` }
    }
    close(); return html
  }
  function barChart(labels, values) {
    const W = 560, H = 170, pad = 28, n = values.length, max = Math.max(...values.map(Math.abs), 1), hasNeg = values.some(v => v < 0)
    const zero = hasNeg ? H / 2 : H - pad, scale = (hasNeg ? H / 2 - pad : H - 2 * pad) / max, bw = (W - 2 * pad) / n * 0.62
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%"><line x1="${pad}" x2="${W - pad}" y1="${zero}" y2="${zero}" stroke="#cbd5e1"/>${values.map((v, i) => { const x = pad + (W - 2 * pad) / n * i + ((W - 2 * pad) / n - bw) / 2, h = Math.abs(v) * scale, y = v >= 0 ? zero - h : zero; return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(1, h)}" rx="2" fill="${v >= 0 ? '#1f5eff' : '#f0a39b'}"/><text x="${x + bw / 2}" y="${v >= 0 ? y - 3 : y + h + 11}" text-anchor="middle">${v}</text><text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>` }).join('')}</svg>`
  }
  function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })); a.download = name; a.click() }
  let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600) }

  /* 输入：@专家 / /技能 / #模块 联想 */
  const input = $('#input'), mn = $('#mentions')
  input.addEventListener('input', () => {
    input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'
    const m = /([@/#])([^\s@/#]*)$/.exec(input.value)
    if (!m) { mn.style.display = 'none'; return }
    const q = m[2], items = m[1] === '@' ? S.meta.experts.map(e => ({ t: '@' + e.name, d: e.desc })) : m[1] === '/' ? S.meta.skills.map(s => ({ t: '/' + s.name, d: s.title + ' ' + s.version })) : S.meta.modules.map(x => ({ t: '#' + x.name, d: x.desc }))
    const f = items.filter(i => i.t.includes(q)).slice(0, 8)
    if (!f.length) { mn.style.display = 'none'; return }
    mn.innerHTML = f.map(i => `<div data-t="${esc(i.t)}"><b>${esc(i.t)}</b> <span class="sub">${esc(i.d.slice(0, 30))}</span></div>`).join(''); mn.style.display = 'block'
    mn.onclick = e => { const d = e.target.closest('div[data-t]'); if (!d) return; input.value = input.value.replace(/([@/#])([^\s@/#]*)$/, d.dataset.t + ' '); mn.style.display = 'none'; input.focus() }
  })
  function submit() {
    const v = input.value.trim(); if (!v) return
    input.value = ''; input.style.height = 'auto'; mn.style.display = 'none'
    const sk = /\/([a-z0-9-]+)/.exec(v); const sc = sk && S.meta.scenarios.find(s => s.skill === sk[1])
    const mod = /#(\S+)/.exec(v); const mk = mod && S.meta.modules.find(x => x.name === mod[1])
    ask(v, sc ? { scenario: sc.id } : mk && !/[？?]/.test(v.replace(/#\S+/, '')) ? { module: mk.key } : {})
  }
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() } })
  $('#send').onclick = submit
  $('#modeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.mode === 'online' && !S.meta.mode?.online) toast('服务端未配置 DEEPSEEK_API_KEY：在线模式会自动回退到离线规划器'); S.mode = b.dataset.mode; document.querySelectorAll('#modeSeg button').forEach(x => x.classList.toggle('on', x === b)) }

  async function reloadMeta() { if (S.live) { S.meta = await getJson('/api/meta'); renderLeft() } }

  async function boot() {
    try { S.meta = await getJson('/api/meta'); S.live = true }
    catch {
      if (!window.__REPLAY__) await new Promise(r => { const sc = document.createElement('script'); sc.src = 'replay.js'; sc.onload = sc.onerror = r; document.head.appendChild(sc) })
      if (!window.__REPLAY__) { document.body.innerHTML = '<p style="padding:40px">无法连接 brand-server，也未找到回放数据 replay.js。请在仓库根目录运行 <code>npm start</code>。</p>'; return }
      S.replay = window.__REPLAY__; S.meta = S.replay.meta; $('#offlineBar').hidden = false
    }
    renderLeft(); newSession()
    const q = new URLSearchParams(location.search).get('scenario'); if (q) { const sc = S.meta.scenarios.find(s => s.id === q); if (sc) ask(sc.prompt, { scenario: sc.id }) }
    window.__wb = { S, ask, openTab }
  }
  boot()
})()
