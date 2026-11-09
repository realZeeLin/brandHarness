/* 中粮营销 AI 助手 · 品牌智能体工作台 —— 前端（无构建、无依赖）。
 * 左：入口（待我拍板 / 技能库 / 数据接入 / 工具与接口、专家工位 = 九大模块、工作区任务）
 * 中：对话（五步闭环进度、专家接力、工具行、拍板卡）
 * 右：交付物 / 证据 / 看板（看板随入口切换为模块看板、技能库、数据接入、工具与接口）
 * 连接 brand-server 时实时调用；未连接时播放 replay.js（由 scripts/record-replay.mjs 从真实运行录制）。 */
(function () {
  'use strict'
  const $ = s => document.querySelector(s)
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n }
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const fmt = v => typeof v === 'number' ? v.toLocaleString('zh-CN') : esc(v)

  const ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6l2.5-8Z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2V5Z"/><path d="M4 20a2 2 0 0 0 2 1h13v-3"/>',
    data: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6"/>',
    plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0V7ZM12 17v5"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    scope: '<path d="M3 5h18M6 12h12M10 19h4"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    chev: '<path d="m9 6 6 6-6 6"/>'
  }
  const ico = (k, size = 16) => `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICON[k]}</svg>`

  /* 专家工位：每个业务模块由一位专家值守（数据接入、系统管理收进顶部入口） */
  const DESK = { overview: 'analyst', social: 'analyst', brand: 'brand', ecommerce: 'analyst', opportunity: 'product', campaign: 'activity', geo: 'geo', assistant: 'brief' }
  const SEAL = { lead: '总', analyst: '洞', product: '机', brief: '报', brand: '牌', activity: '活', geo: '答' }
  const seal = id => `<span class="seal ${id === 'lead' ? 'lead' : ''}">${SEAL[id] || '智'}</span>`
  const RAIL = [['定问题', '业务'], ['找证据', '平台'], ['出洞察', '智能体'], ['做判断', '人'], ['回写沉淀', '智能体 + 平台']]
  const PENDING = /待签发|待审核|待确认/

  const S = { meta: null, live: false, replay: null, mode: 'offline', running: false, cur: null, nav: 'home', panel: { kind: 'module', key: 'overview', face: 'human' }, activeDeliverable: null, catalog: null }

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
  const expert = id => S.meta.experts.find(e => e.id === id)
  const toolMeta = n => { for (const m of S.meta.modules) { const t = m.tools.find(x => x.name === n); if (t) return { ...t, module: m } } return null }

  /* ---------------- 左列 ---------------- */
  function renderLeft() {
    const m = S.meta
    const pend = m.tasks.filter(t => PENDING.test(t.status)).length
    const nTools = m.modules.reduce((a, x) => a + x.tools.length, 0)
    const navs = [['home', 'inbox', '待我拍板', `<span class="ct ${pend ? 'human' : ''}">${pend}</span>`], ['skills', 'book', '技能库', `<span class="ct">${m.skills.length}</span>`], ['data', 'data', '数据接入', `<span class="ct">${m.data.datasets.length}</span>`], ['tools', 'plug', '工具与接口', `<span class="ct">${nTools}</span>`]]
    $('#navs').innerHTML = navs.map(([k, i, t, c]) => `<button class="nav ${S.nav === k ? 'on' : ''}" data-nav="${k}">${ico(i)}${t}${c}</button>`).join('')
    $('#modules').innerHTML = m.modules.filter(x => DESK[x.key]).map(x => { const ex = expert(DESK[x.key]); return `<button class="desk ${S.nav === x.key ? 'on' : ''}" data-module="${x.key}" title="${esc(x.desc)}&#10;工具：${esc(x.tools.map(t => t.name).join('、'))}">${seal(DESK[x.key])}<span class="nm">${esc(x.name)}</span><span class="who">${esc(ex?.name || '')}</span></button>` }).join('')
    $('#wsname').innerHTML = `${ico('folder', 15)}${esc(m.brand.brand)} ${esc(m.brand.board)}`
    const adhoc = S.cur && !S.cur.taskId && S.cur.title !== '新任务' ? `<button class="sess on"><span class="dot ${S.running ? 'run' : ''}"></span><span class="t">${esc(S.cur.title)}</span><span class="st">${S.running ? '运行中' : '本次'}</span></button>` : ''
    $('#tasks').innerHTML = adhoc + m.tasks.map(t => { const on = S.cur?.taskId === t.id, w = PENDING.test(t.status); return `<button class="sess ${on ? 'on' : ''}" data-task="${t.scenario}" data-tid="${t.id}" title="${esc(t.id + ' ' + t.title)}"><span class="dot ${on && S.running ? 'run' : w ? 'wait' : ''}"></span><span class="t">${esc(t.title)}</span><span class="st ${w ? 'wait' : ''}">${on && S.running ? '运行中' : esc(t.status)}</span></button>` }).join('')
  }
  $('#left').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || S.running && (b.dataset.task || b.dataset.nav === 'home')) return
    if (b.dataset.nav) {
      const k = b.dataset.nav; S.nav = k
      if (k === 'home') newSession()
      else openPanel({ kind: k })
      renderLeft()
    } else if (b.dataset.module) { S.nav = b.dataset.module; openPanel({ kind: 'module', key: b.dataset.module, face: 'human' }); renderLeft() }
    else if (b.dataset.task) startTask(b.dataset.tid)
  })
  $('#newTask').innerHTML = ico('plus') + '新任务'
  $('#newTask').onclick = () => { if (!S.running) { S.nav = 'home'; newSession() } }
  function startTask(tid) {
    const t = S.meta.tasks.find(x => x.id === tid); const sc = S.meta.scenarios.find(s => s.id === t.scenario)
    S.nav = null; newSession(t); ask(sc.prompt, { scenario: sc.id })
  }

  /* ---------------- 会话 ---------------- */
  function newSession(task) {
    S.cur = { title: task?.title || '新任务', taskId: task?.id || null, deliverables: [], traces: [], findings: [], history: [], stage: -1, steps: 0, human: 0 }
    S.activeDeliverable = null
    $('#title').textContent = S.cur.title; $('#tid').textContent = task?.id || ''
    $('#wrap').innerHTML = ''; renderRail(); renderStat()
    if (!task) welcome()
    renderChips([]); renderDeliver(); renderTrace(); renderLeft()
    if (!task) openPanel({ kind: 'module', key: 'overview', face: 'human' })
  }
  function greet() { const h = new Date().getHours(); return h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好' }
  function welcome() {
    const m = S.meta
    const todos = m.tasks.filter(t => PENDING.test(t.status))
    const busy = new Set(m.tasks.map(t => t.scenario))
    const starters = ['cat', 'guard', 'opportunity', 'geo', 'campaign', 'annual', 'overview'].map(id => m.scenarios.find(s => s.id === id)).filter(s => s && !todos.some(t => t.scenario === s.id)).slice(0, 4)
    const others = m.tasks.filter(t => !PENDING.test(t.status))
    const w = el('div', 'hello welcome')
    w.innerHTML = `<h2>品牌经理，${greet()}</h2><p class="sub">今天有 <b>${todos.length} 件事</b>等你拍板，其余的交给智能体。</p>
      ${todos.map(t => `<button class="todo" data-tid="${t.id}"><span><b>${esc(t.title)}</b><span>${esc(t.id)}　${esc(expert(t.expert)?.name || '')} 已备好，等你确认</span></span><em>${esc(t.status)}</em></button>`).join('')}
      <div class="block"><h3>直接问，或者交办</h3><div class="starters">${starters.map(s => `<button class="starter" data-sc="${s.id}">${seal(s.expert)}<span>${esc(s.prompt)}<small>${esc(expert(s.expert)?.name || '')}${busy.has(s.id) ? '' : ' · ' + esc(s.label)}</small></span></button>`).join('')}</div></div>
      <div class="block"><h3>智能体在跟进的事</h3>${others.map(t => `<div class="logrow"><time>${esc(t.id)}</time><span><b>${esc(expert(t.expert)?.name || '')}</b>　${esc(t.title)} · ${esc(t.status)}</span></div>`).join('')}</div>`
    w.addEventListener('click', e => {
      const td = e.target.closest('.todo'); if (td) return startTask(td.dataset.tid)
      const st = e.target.closest('.starter'); if (st) { const sc = m.scenarios.find(s => s.id === st.dataset.sc); ask(sc.prompt, { scenario: sc.id }) }
    })
    $('#wrap').appendChild(w)
  }
  function renderChips(items, special = {}) {
    $('#chips').innerHTML = ''
    for (const t of items) { const c = el('button', 'chip', esc(t)); c.onclick = () => ask(t, special[t] || {}); $('#chips').appendChild(c) }
  }
  const toBottom = () => { const t = $('#thread'); t.scrollTop = t.scrollHeight }

  function renderRail() {
    const r = $('#rail'), st = S.cur?.stage ?? -1
    r.hidden = st < 0
    if (st < 0) return
    r.innerHTML = RAIL.map(([a, b], i) => `${i ? `<span class="bar ${i <= st ? 'done' : ''}"></span>` : ''}<span class="st ${i < st ? 'done' : i === st ? 'cur' + (i === 3 ? ' human' : '') : ''}"><i>${i < st ? '✓' : i + 1}</i>${a}<small>${b}</small></span>`).join('')
  }
  const stage = n => { if (S.cur.stage < n) { S.cur.stage = n; renderRail() } }
  function renderStat() {
    const c = S.cur
    $('#cstat').innerHTML = c && c.stage >= 0 ? `<span>${c.steps} 步</span><span>工具 ${c.traces.length} 次</span><span>人工介入 ${c.human} 次</span><span>交付物 ${c.deliverables.length}</span>` : '<span>读操作自动执行 · 签发、写入技能、数据入库需要你确认</span>'
  }

  async function ask(text, opts = {}) {
    if (S.running || !text.trim()) return
    if (!S.cur) newSession()
    $('.welcome')?.remove()
    S.running = true; $('#send').disabled = true; renderChips([]); renderLeft()
    const ex = /@(\S+)/.test(text) && S.meta.experts.find(e => text.includes(e.name))
    const row = el('div', 'usr'); row.appendChild(el('div', null, esc(text))); $('#wrap').appendChild(row); toBottom()
    const ctx = { seg: null, segExpert: null, plan: null, tools: {}, toolsUsed: [], t0: Date.now(), scenario: null, expert: null }
    const body = { message: text, mode: S.mode, scenario: opts.scenario, module: opts.module, history: S.cur.history, expert: ex?.id }
    try { await (S.live ? streamChat(body, e => onEvent(e, ctx)) : replayChat(body, e => onEvent(e, ctx))) }
    catch (e) { add(ctx, el('div', 'blk err', `出错：${esc(e.message)}`)) }
    S.cur.history.push({ q: text, scenario: ctx.scenario, label: ctx.label, expert: ctx.expert, tools: ctx.toolsUsed })
    S.running = false; $('#send').disabled = false; renderLeft()
  }

  /* 对话按「专家段」组织：每位专家一段，段内是思考、计划、工具行、正文、拍板卡 */
  function newSeg(ctx, id, extra = '') {
    const ex = expert(id) || expert('lead')
    const s = el('div', 'seg', `${seal(ex.id)}<div class="seghd"><b>${esc(ex.name)}</b>${extra}</div>`)
    $('#wrap').appendChild(s); ctx.seg = s; ctx.segExpert = ex.id; return s
  }
  function add(ctx, node) { if (!ctx.seg) newSeg(ctx, ctx.expert || 'lead'); node.classList.add('blk'); ctx.seg.appendChild(node); toBottom(); return node }

  async function onEvent(e, ctx) {
    const c = S.cur
    switch (e.type) {
      case 'route': {
        ctx.expert = e.expert; ctx.scenario = e.scenario; ctx.label = e.label
        if (e.expert !== 'lead') newSeg(ctx, 'lead', `<span class="ph">判断场景「${esc(e.label)}」→ 交给 ${esc(e.expertName || '')}</span>`)
        newSeg(ctx, e.expert, `${e.skill ? `<button class="skchip" data-skill="${esc(e.skill.name)}" title="查看技能">技能：${esc(e.skill.title)} ${esc(e.skill.version)}</button>` : ''}${e.model ? `<span class="ph">模型 ${esc(e.model)}</span>` : ''}`)
        if (c.title === '新任务') { c.title = e.label; $('#title').textContent = e.label; renderLeft() }
        stage(1); break
      }
      case 'think': add(ctx, el('div', 'think', esc(e.text))); break
      case 'plan': ctx.plan = add(ctx, el('div', 'plan', `<div class="pt">执行计划 · ${e.steps.length} 步</div>${e.steps.map(s => `<div class="pi"><s></s><span class="tt">${esc(s)}</span></div>`).join('')}`)); break
      case 'step': { const li = ctx.plan?.querySelectorAll('.pi')[e.index]; if (li) li.className = 'pi ' + e.status; if (e.status === 'done') { c.steps++; renderStat() } break }
      case 'tool': return onTool(e, ctx)
      case 'text': add(ctx, el('div', 'md', md(e.md))); if (ctx.toolsUsed.length) stage(2); break
      case 'quotes': add(ctx, el('div', 'quotes', e.items.map(q => `<div class="q"><header><b>${esc(q.platform)}</b>${esc(q.date || '')}<span class="r">${q.sentiment ? `<span class="tag ${q.sentiment === '负面' ? 'bad' : q.sentiment === '正面' ? 'real' : ''}">${esc(q.sentiment)}</span>` : ''}${q.promo ? '<span class="tag wait">促销话术</span>' : ''}${q.interactions != null ? `<span>互动 ${q.interactions}</span>` : ''}</span></header>${esc(q.quote)}</div>`).join(''))); break
      case 'table': add(ctx, el('div', 'tp', `<h6>${esc(e.title)}</h6><table><tr>${e.columns.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${e.rows.map(r => `<tr>${r.map(v => `<td class="${typeof v === 'number' ? 'n' : ''}">${fmt(v)}</td>`).join('')}</tr>`).join('')}</table>`)); break
      case 'chart': add(ctx, el('div', 'tp', `<h6>${esc(e.title)}</h6><div class="chart">${barChart(e.labels, e.values)}</div>`)); break
      case 'kpis': add(ctx, el('div', 'kpis', e.items.map(([k, v, u]) => `<div class="kpi"><span>${esc(k)}</span><b>${fmt(v)}<small>${esc(u)}</small></b></div>`).join(''))); break
      case 'card': {
        const cd = e.card; c.findings = cd.findings
        addDeliverable({ kind: 'card', id: cd.cardId, title: '结论卡 · ' + cd.question, status: cd.status === 'draft' ? '待签发' : '不可签发', card: cd, markdown: cardMd(cd) })
        add(ctx, delvRow(cd.cardId, '卡', `结论卡 ${cd.cardId} · ${cd.question}`, `数字溯源 ${cd.trace.verified}/${cd.trace.total} · 强度 ${cd.strength} · ${cd.status === 'draft' ? '待签发' : '不可签发'}`, 'cardmini'))
        renderTrace(); stage(2); break
      }
      case 'gate': add(ctx, gateBox(e)); stage(3); break
      case 'deliverable':
        addDeliverable(e)
        if (e.kind === 'data') { add(ctx, delvRow(e.id, '数', e.title, '在右侧「数据接入」里预检、导入，或接外部数据流')); openPanel({ kind: 'data' }) }
        else add(ctx, delvRow(e.id, e.kind === 'report' ? '报' : '件', e.title, e.status))
        stage(2); break
      case 'skill':
        addDeliverable({ kind: 'skill', id: e.name, title: '技能草稿 · ' + e.name, status: '待确认写入', content: e.content })
        add(ctx, delvRow(e.name, '技', '技能草稿 · ' + e.name, '按这次实际调用的工具链起草，等你确认写入技能库'))
        stage(4); break
      case 'suggest': renderChips(e.items); break
      case 'done':
        add(ctx, el('div', 'donel', `用时 ${((e.ms || Date.now() - ctx.t0) / 1000).toFixed(1)}s · 调用工具 ${ctx.toolsUsed.length} 次 · 全部数字来自工具返回`))
        if (c.stage < 3) stage(3)
        renderStat(); break
      case 'error': add(ctx, el('div', 'err', esc(e.message))); break
    }
  }

  function onTool(e, ctx) {
    if (e.phase === 'start') {
      if (e.expert && e.expert !== ctx.segExpert) newSeg(ctx, e.expert, '<span class="ph">接力</span>')
      const tm = toolMeta(e.name)
      const b = el('div', 'tool', `<button class="thd"><span class="rw ${tm && !tm.readOnly ? 'write' : ''}"></span><span class="fn">${esc(e.name)}</span><span class="cn">${esc(tm ? tm.title : '')}</span><span class="sta run">执行中</span><span class="car">${ico('chev', 14)}</span></button><div class="tbd"></div>`)
      b.querySelector('.thd').onclick = () => b.classList.toggle('open')
      ctx.tools[e.id] = add(ctx, b); return
    }
    const b = ctx.tools[e.id] || add(ctx, el('div', 'tool', `<button class="thd"><span class="rw"></span><span class="fn">${esc(e.name)}</span><span class="cn"></span><span class="sta"></span><span class="car">${ico('chev', 14)}</span></button><div class="tbd"></div>`))
    const st = b.querySelector('.sta')
    if (e.phase === 'error') { st.className = 'sta err'; st.textContent = '失败：' + e.error; return }
    st.className = 'sta'; st.innerHTML = `<span class="tag plat">${esc(e.transport)}</span>${(e.ms / 1000).toFixed(2)}s`; b.dataset.st = 'ok'
    ctx.toolsUsed.push(e.name)
    const cav = (e.result?.caveats || []).slice(0, 2).map(x => `<div class="tnote">⚑ ${esc(x)}</div>`).join('')
    b.querySelector('.tbd').innerHTML = `<div class="tlab">参数</div><pre>${esc(JSON.stringify(e.args))}</pre><div class="tlab">返回摘要</div>${summarize(e.result)}${cav}<button class="tlink">在「证据」里看完整返回，复现为 CLI / HTTP / MCP</button>`
    b.querySelector('.tlink').onclick = () => { openTab('trace'); flash('tr-' + e.id) }
    S.cur.traces.push({ ...e, expert: e.expert || ctx.expert }); renderTrace(); renderStat()
  }
  function delvRow(id, ic, title, meta, extra = '') {
    const b = el('button', 'delv ' + extra, `<span class="ic">${esc(ic)}</span><span><b>${esc(title)}</b><span class="m">${esc(meta)}</span></span><span class="go">查看 →</span>`)
    b.onclick = () => { S.activeDeliverable = id; renderDeliver(); openTab('deliver') }
    return b
  }

  function summarize(r) {
    if (!r || typeof r !== 'object') return `<pre>${esc(JSON.stringify(r))}</pre>`
    const rows = []
    for (const [k, v] of Object.entries(r)) {
      if (k === 'caveats' || k === 'markdown' || k === 'content' || k === 'body' || v == null) continue
      if (typeof v !== 'object') rows.push([k, `<b>${fmt(v)}</b>`])
      else if (Array.isArray(v)) rows.push([k, `${v.length} 项${v.length && typeof v[0] !== 'object' ? '：' + esc(v.slice(0, 6).join('、')) : v.length && v[0].name ? '：' + esc(v.slice(0, 4).map(x => x.name + (x.n != null ? ' ' + x.n : '')).join('、')) : ''}`])
      else rows.push([k, esc(Object.entries(v).slice(0, 5).map(([a, b]) => a + '=' + (typeof b === 'object' ? '…' : b)).join(' · '))])
      if (rows.length >= 8) break
    }
    return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`
  }
  function cardMd(c) {
    return [`# ${c.cardId} · ${c.question}`, '', `> 一句话结论：${c.oneLiner}`, '', `**结论强度**：${c.strength}　**数字溯源**：${c.trace.verified}/${c.trace.total}`, '', '## 结论与依据', ...c.findings.map((f, i) => `${i + 1}. **${f.text}** — ${f.display}（\`${f.source.tool}\` → \`${f.source.path}\`）`), '', '## 建议', c.recommendation, '', '## 下一步', ...(c.nextSteps || []).map(s => '- ' + s), '', '## 风险与前提', ...(c.risks || []).map(s => '- ' + s), '', '## 口径说明', ...(c.caveats || []).map(s => '- ' + s)].join('\n')
  }

  /* 拍板卡：签发是人工闸门，琥珀色只在这里出现 */
  function gateBox(e) {
    const g = el('div', 'ask', `<div class="ah"><small>等你拍板</small><h3>签发结论卡 ${esc(e.cardId)}？</h3></div>
      <div class="opts"><button class="op" data-o="sign" aria-pressed="true"><i>1</i><span><b>签发，对内可用</b><span class="d">写入结论库并留痕（sha256）</span></span></button><button class="op" data-o="hold" aria-pressed="false"><i>2</i><span><b>先不签</b><span class="d">留在草稿，继续补证据</span></span></button></div>
      <div class="af"><label>审核人</label><input value="品牌经理（演示）" aria-label="审核人"><button class="sub">确认</button></div>`)
    let pick = 'sign'
    g.querySelectorAll('.op').forEach(o => o.onclick = () => { pick = o.dataset.o; g.querySelectorAll('.op').forEach(x => x.setAttribute('aria-pressed', x === o)) })
    g.querySelector('.sub').onclick = async () => {
      const reviewer = g.querySelector('input').value.trim(); if (!reviewer) return toast('请填写审核人')
      S.cur.human++
      if (pick === 'hold') { g.replaceWith(Object.assign(el('div', 'held blk', `已暂缓签发：结论卡 ${esc(e.cardId)} 保持草稿 · ${esc(reviewer)}`))); renderStat(); return }
      try {
        const r = S.live ? await postJson('/api/tools/insight_publish', { cardId: e.cardId, confirm: true, reviewer }) : { status: 'published', sha256: 'replay-' + Math.random().toString(16).slice(2, 18), file: 'workspace/insights/' + e.cardId + '.md' }
        g.replaceWith(el('div', 'signed blk', `<b>✓ 已签发</b>　审核人 ${esc(reviewer)}${S.live ? '' : '（回放模式，未写盘）'}<code>sha256 ${esc(String(r.sha256))} · ${esc(r.file || '')}</code>`))
        const d = S.cur.deliverables.find(x => x.id === e.cardId); if (d) d.status = '已签发'
        const t = S.meta.tasks.find(x => x.id === e.cardId); if (t) t.status = '已签发'
        renderDeliver(); renderLeft(); stage(4); renderStat()
        renderChips(['把这次分析沉淀成技能', '起草本周商情周报'])
      } catch (err) { S.cur.human--; toast('签发失败：' + err.message) }
    }
    return g
  }

  /* ---------------- 右栏：交付物 ---------------- */
  function addDeliverable(d) {
    const ds = S.cur.deliverables, i = ds.findIndex(x => x.id === d.id)
    if (i >= 0) ds[i] = { ...ds[i], ...d }; else ds.push(d)
    S.activeDeliverable = d.id; renderDeliver(); renderStat()
    if (d.kind !== 'data') openTab('deliver')
  }
  function renderDeliver() {
    const ds = S.cur?.deliverables || [], p = $('#pane-deliver')
    $('#dCount').textContent = ds.length
    if (!ds.length) { p.innerHTML = `<div class="rempty"><h3>交付物在这里</h3>结论卡、周报、年报大纲、立项证据包、纠偏素材、技能草稿都会出现在右侧。<br>每一份都能导出；签发、写入技能库要你确认。</div>`; return }
    const cur = ds.find(d => d.id === S.activeDeliverable) || ds.at(-1)
    const stCls = /已/.test(cur.status) ? 'done' : /不可|拒/.test(cur.status) ? 'bad' : /待/.test(cur.status) ? 'wait' : ''
    p.innerHTML = (ds.length > 1 ? `<div class="dlist">${ds.map(d => `<button class="dpick ${d === cur ? 'on' : ''}" data-id="${esc(d.id)}" title="${esc(d.title)}">${esc(d.title)}</button>`).join('')}</div>` : '') +
      `<div class="dbar"><span class="state ${stCls}">${esc(cur.status)}</span><span>${esc({ card: '结论卡', report: '报告', skill: '技能草稿', data: '数据接入' }[cur.kind] || '交付物')}</span><span class="act" id="dAct"></span></div>`
    p.querySelectorAll('.dpick').forEach(n => n.onclick = () => { S.activeDeliverable = n.dataset.id; renderDeliver() })
    const act = p.querySelector('#dAct')
    const link = (t, fn) => { const b = el('button', 'lnk', t); b.onclick = fn; act.appendChild(b) }
    if (cur.kind === 'skill') {
      const ta = el('textarea', 'editor'); ta.value = cur.content; p.appendChild(ta)
      const a = el('div', 'acts', `<button class="textbtn pri" id="skillWrite">确认写入技能库</button><span class="small">写入会记录修订人与留痕；DeepSeek Harness 里以 /brand-${esc(cur.id)} 调用</span>`); p.appendChild(a)
      link('下载 SKILL.md', () => download(cur.id + '-SKILL.md', ta.value))
      a.querySelector('#skillWrite').onclick = async () => {
        cur.content = ta.value
        try {
          const r = S.live ? await postJson('/api/skills/' + cur.id, { content: ta.value, author: '品牌经理（演示）', note: '由会话沉淀', confirm: true }, 'PUT') : { status: 'saved', version: 'v0.1' }
          cur.status = '已写入 ' + r.version; S.cur.human++; stage(5); renderStat()
          toast(S.live ? `技能 ${cur.id} 已写入技能库并留痕` : '回放模式：未实际写入')
          if (S.live) await reloadMeta()
          renderDeliver()
        } catch (e) { toast('写入失败：' + e.message) }
      }
      return
    }
    if (cur.kind === 'data') { p.appendChild(el('div', 'rempty', '数据接入面板在「看板 · 数据接入」。<br><button class="textbtn" style="margin-top:10px">打开数据接入</button>')).querySelector('button').onclick = () => openPanel({ kind: 'data' }); return }
    link('导出 Markdown', () => download(cur.id + '.md', cur.markdown))
    link('复制', () => { navigator.clipboard?.writeText(cur.markdown); toast('已复制') })
    if (cur.kind === 'report') link('把审核意见回写技能', () => openPanel({ kind: 'skill', key: 'edible-oil-weekly-brief', append: '\n## 审核意见回写（' + new Date().toISOString().slice(0, 10) + '）\n- 「价格」栏目只列偏离最大的 2 条，并附店铺类型\n' }))
    p.appendChild(cur.kind === 'card' ? cardDoc(cur.card) : el('div', 'doc', md(cur.markdown || '')))
  }
  function cardDoc(c) {
    const d = el('div', 'doc', `<div class="kick">结论卡 ${esc(c.cardId)}${c.createdAt ? ' · ' + esc(String(c.createdAt).slice(0, 10)) : ''}</div><h2>${esc(c.question)}</h2><p class="lead">${esc(c.oneLiner)}</p>
      <div class="meta"><span>结论强度 ${esc(c.strength)}</span><span>数字溯源 ${c.trace.verified}/${c.trace.total}</span><span>${c.status === 'draft' ? '草稿 · 待签发' : '不可签发'}</span></div>
      <h3>发现与依据</h3>${c.findings.map((f, i) => `<div class="find"><div class="big"><span class="ntr" data-f="${i}" title="点数字看出处">${esc(f.display)}</span></div><div><h4>${esc(f.text)}</h4><div class="src">${f.verified ? '✓' : '✗'} ${esc(f.source.tool)} → ${esc(f.source.path)}</div></div></div>`).join('')}
      <h3>建议</h3><div class="adv">${esc(c.recommendation)}</div>
      ${c.nextSteps?.length ? `<h3>下一步</h3><ul>${c.nextSteps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${c.risks?.length ? `<h3>风险与前提</h3><ul>${c.risks.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${c.caveats?.length ? `<h3>口径说明</h3><ul class="small">${c.caveats.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}`)
    d.querySelectorAll('.ntr').forEach(n => n.onclick = () => { openTab('trace'); flash('ev-f-' + n.dataset.f) })
    return d
  }

  /* ---------------- 右栏：证据 ---------------- */
  function renderTrace() {
    const ts = S.cur?.traces || [], fs = S.cur?.findings || [], p = $('#pane-trace')
    $('#tCount').textContent = ts.length
    if (!ts.length) { p.innerHTML = `<div class="rempty"><h3>每个数字都有出处</h3>每一次工具调用都会记在这里：谁调用、用了什么参数、返回了什么。<br>同一次调用可以用 CLI / HTTP / MCP 原样复现。</div>`; return }
    p.innerHTML = `<div class="evlist">${fs.length ? `<div class="evsec">结论卡数字溯源 · ${fs.filter(f => f.verified).length}/${fs.length}</div>${fs.map((f, i) => `<div class="ev" id="ev-f-${i}"><header><span class="v">${esc(f.display)}</span><span class="lb">${esc(f.text)}</span><span class="tag ${f.verified ? 'real' : 'bad'}" style="margin-left:auto">${f.verified ? '已核对' : '未核对'}</span></header><code>${esc(f.source.tool)} ${esc(JSON.stringify(f.source.args))} → ${esc(f.source.path)} = ${esc(f.actual)}</code></div>`).join('')}` : ''}
      <div class="evsec">工具调用 · ${ts.length} 次（可回放、可审计）</div>${ts.map(t => `<div class="ev" id="tr-${t.id}"><header><b>${esc(t.name)}</b><span class="tag plat">${esc(t.transport)}</span><span class="m">${esc(expert(t.expert)?.name || '')} · ${(t.ms / 1000).toFixed(2)}s</span><span class="r snip"><button data-k="json" class="on">返回</button><button data-k="cli">CLI</button><button data-k="http">HTTP</button><button data-k="mcp">MCP</button></span></header><pre>${esc(snippet(t, 'json'))}</pre></div>`).join('')}</div>`
    p.querySelectorAll('.ev[id^=tr-]').forEach((n, i) => n.querySelectorAll('.snip button').forEach(b => b.onclick = () => { n.querySelectorAll('.snip button').forEach(x => x.classList.toggle('on', x === b)); n.querySelector('pre').textContent = snippet(ts[i], b.dataset.k) }))
  }
  function snippet(t, k) {
    if (k === 'json') return JSON.stringify(t.result, null, 1).slice(0, 4000)
    if (k === 'cli') return `npx brand call ${t.name} --json '${JSON.stringify(t.args)}'`
    if (k === 'http') return `curl -s -X POST http://127.0.0.1:8787/api/tools/${t.name} \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify(t.args)}'`
    return JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: t.name, arguments: t.args } }, null, 1) + '\n\n# DeepSeek Harness 中工具名为 brand_' + t.name
  }
  function flash(id) { setTimeout(() => { const n = document.getElementById(id); if (!n) return; n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash') }, 60) }

  /* ---------------- 右栏：看板（模块看板 / 技能库 / 数据接入 / 工具与接口） ---------------- */
  const PANEL_NAME = { module: '看板', skills: '技能库', skill: '技能库', data: '数据接入', tools: '工具与接口' }
  function openPanel(p) {
    S.panel = { face: 'human', ...p }
    $('#panelTab').textContent = PANEL_NAME[p.kind]
    openTab('panel'); renderPanel()
  }
  async function renderPanel() {
    const P = S.panel, box = $('#pane-panel')
    if (P.kind === 'module') return renderModule(box, P)
    if (P.kind === 'skills') return renderSkills(box)
    if (P.kind === 'skill') return showSkill(box, P.key, P.append)
    if (P.kind === 'data') return renderData(box)
    if (P.kind === 'tools') { box.innerHTML = '<div class="bd"><h3>工具与接口</h3><p class="cap">每个页面背后都是一组工具：同一份定义供页面、智能体、MCP、HTTP API、CLI 调用。</p><div id="labBox"></div></div>'; return renderLab($('#labBox'), P.key || 'overview', P.tool, true) }
  }

  /* 模块看板：「给人看」是这块业务的数据，「给智能体用」是它背后的工具 */
  async function renderModule(box, P) {
    const m = S.meta.modules.find(x => x.key === P.key), ex = expert(DESK[m.key] || 'lead')
    const skills = S.meta.skills.filter(s => (s.tools || []).some(t => m.tools.some(x => x.name === t)))
    const sc = S.meta.scenarios.find(s => s.id === routeLocal('', m.key))
    box.innerHTML = `<div class="faces"><button data-f="human" class="${P.face === 'human' ? 'on' : ''}">给人看</button><button data-f="agent" class="${P.face === 'agent' ? 'on' : ''}">给智能体用</button></div>
      <div class="bd"><div class="deskhd">${seal(ex.id)}<div><h2>${esc(m.name)}</h2><p>${esc(ex.name)} 值守 · ${esc(m.desc)}</p></div></div><div id="mbody"></div></div>`
    box.querySelectorAll('.faces button').forEach(b => b.onclick = () => { S.panel.face = b.dataset.f; renderModule(box, S.panel) })
    const body = box.querySelector('#mbody')
    if (P.face === 'agent') {
      body.innerHTML = `<h3>${m.tools.length} 个工具</h3><p class="cap">读操作自动执行；写操作（琥珀点）需要人确认。</p><div id="labBox"></div>`
      return renderLab(body.querySelector('#labBox'), m.key, P.tool, false)
    }
    const ask1 = `让智能体分析「${m.name}」`
    body.innerHTML = `<div class="acts" style="padding:2px 0 6px"><button class="textbtn pri" id="mAsk">${esc(ask1)}</button>${sc && sc.id !== 'overview' ? `<button class="textbtn" id="mSc">${esc(sc.label)}</button>` : ''}</div>
      <h3>最近一次数据</h3><div id="mData" class="small">读取中…</div>
      ${skills.length ? `<h3>相关技能</h3><div class="skills">${skills.map(skillCard).join('')}</div>` : ''}`
    body.querySelector('#mAsk').onclick = () => ask(ask1, { module: m.key })
    body.querySelector('#mSc')?.addEventListener('click', () => ask(sc.prompt, { scenario: sc.id }))
    bindSkillCards(body)
    const d = await moduleData(m)
    const md0 = body.querySelector('#mData'); if (!md0) return
    md0.outerHTML = d ? `<p class="cap">来自 <code>${esc(d.name)}</code> 的${S.live ? '实时' : '录制'}返回 · 原始字段在「给智能体用」</p>${humanView(d.result)}${(d.result?.caveats || []).slice(0, 2).map(x => `<div class="note">⚑ ${esc(x)}</div>`).join('')}` : `<p class="cap">回放里没有录到这个模块的工具返回；运行 <code>npm start</code> 后可实时查看。</p>`
  }
  /* 「给人看」：把工具返回读成数字卡和条形图；只认识的字段才上墙，其余留给「给智能体用」 */
  const LABEL = { posts: '有效讨论', authors: '作者', interactions: '互动', nsr: '净情感 NSR', negShare: '负面占比 %', links: '在售链接', reviews: '采集评论', validReviews: '有效文字评价', validRate: '有效率 %', total: '巡检问题', accuracy: '答案准确率 %', mentionRate: '品牌提及率 %', pos: '正面', neu: '中性', neg: '负面', topPlatforms: '平台分布', platforms: '平台分布', ecPlatforms: '电商平台 · 有效率 %', topOpportunities: '机会排序', opportunities: '机会排序', claims: '卖点在标题里的提及率', contentType: '内容类型', sides: '对比双方 · 社媒讨论', n: '条', share: '占比 %', score: '机会分', titleRate: '标题提及率 %', socialPosts: '社媒讨论' }
  const NAMEK = ['name', 'platform', 'claim', 'value', 'keyword', 'q'], NUMK = ['n', 'score', 'socialPosts', 'validRate', 'titleRate', 'posts', 'share']
  function humanView(r) {
    if (!r || typeof r !== 'object') return ''
    const kpis = [], lists = [], notes = []
    const list = (k, v) => { if (!v.length || typeof v[0] !== 'object') return; const nk = NAMEK.find(x => v[0][x] != null), vk = NUMK.find(x => typeof v[0][x] === 'number'); if (nk && vk && lists.length < 2) lists.push({ title: LABEL[k] || k, items: v.slice(0, 7).map(x => [x[nk], x[vk]]) }) }
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'number' && LABEL[k]) kpis.push([LABEL[k], v])
      else if (Array.isArray(v)) list(k, v)
      else if (v && typeof v === 'object') {
        for (const [a, b] of Object.entries(v)) { if (typeof b === 'number' && LABEL[a]) kpis.push([LABEL[a], b]); else if (Array.isArray(b)) list(a, b) }
        if (v.reading) notes.push(`「${v.claim || k}」${v.reading}`); if (v.reason) notes.push(v.reason)
      }
    }
    if (!kpis.length && !lists.length) return summarize(r)
    return `${kpis.length ? `<div class="kpis">${kpis.slice(0, 9).map(([k, v]) => `<div class="kpi"><span>${esc(k)}</span><b>${fmt(v)}</b></div>`).join('')}</div>` : ''}
      ${lists.map(l => { const max = Math.max(...l.items.map(x => x[1]), 1); return `<h3>${esc(l.title)}</h3><div class="hbars">${l.items.map(([n, v]) => `<div class="hb"><span class="hn">${esc(n)}</span><span class="ht"><i style="width:${Math.max(2, v / max * 100)}%"></i></span><span class="hv">${fmt(v)}</span></div>`).join('')}</div>` }).join('')}
      ${notes.slice(0, 3).map(x => `<div class="note">${esc(x)}</div>`).join('')}`
  }
  async function moduleData(m) {
    if (S.live) {
      const t = m.tools.find(x => x.readOnly); if (!t) return null
      try { return { name: t.name, result: await postJson('/api/tools/' + t.name, exampleArgs(t)) } } catch { return null }
    }
    for (const t of m.tools) for (const evs of Object.values(S.replay.scenarios)) { const e = evs.find(x => x.type === 'tool' && x.phase === 'end' && x.name === t.name); if (e) return { name: e.name, result: e.result } }
    return null
  }

  async function renderLab(box, mk, toolName, pickModule) {
    const mods = S.meta.modules, m = mods.find(x => x.key === mk)
    const t = m.tools.find(x => x.name === toolName) || m.tools[0]
    let full = t
    if (S.live) { S.catalog ||= await getJson('/api/tools'); full = S.catalog.find(x => x.name === t.name) || t }
    box.innerHTML = `<div class="form">${pickModule ? `<label>模块</label><select id="labMod">${mods.map(x => `<option value="${x.key}" ${x.key === mk ? 'selected' : ''}>${esc(x.name)}（${x.tools.length}）</option>`).join('')}</select><label>工具</label>` : ''}
      <div class="tlist">${m.tools.map(x => `<button class="trow" data-t="${x.name}" style="${x.name === t.name ? 'background:var(--plat-t)' : ''}"><span class="rw ${x.readOnly ? '' : 'write'}"></span><b>${esc(x.name)}</b><span>${esc(x.title)}</span><em>${x.readOnly ? '只读' : '写入需确认'}</em></button>`).join('')}</div>
      ${full.description ? `<p class="small" style="margin:8px 0 0">${esc(full.description)}</p>` : ''}
      <label>参数（JSON）</label><textarea id="labArgs">${esc(JSON.stringify(exampleArgs(t), null, 1))}</textarea>
      <div class="acts"><button class="textbtn pri" id="labRun">运行</button><button class="textbtn" id="labAsk">让智能体用它</button><span class="snip" id="labSnip"><button data-k="cli">CLI</button><button data-k="http">HTTP</button><button data-k="mcp">MCP</button></span></div>
      <pre id="labOut">${esc(full.inputSchema ? JSON.stringify(full.inputSchema, null, 1) : S.live ? '' : '回放模式：运行 npm start 后可直接运行工具；也可以点 CLI / HTTP / MCP 拿到调用写法。')}</pre></div>`
    box.querySelector('#labMod')?.addEventListener('change', e => { S.panel.key = e.target.value; S.panel.tool = null; renderLab(box, e.target.value, null, pickModule) })
    box.querySelectorAll('.trow').forEach(r => r.onclick = () => { S.panel.tool = r.dataset.t; renderLab(box, mk, r.dataset.t, pickModule) })
    const args = () => JSON.parse(box.querySelector('#labArgs').value || '{}')
    box.querySelectorAll('#labSnip button').forEach(b => b.onclick = () => { try { box.querySelector('#labOut').textContent = snippet({ name: t.name, args: args() }, b.dataset.k) } catch (e) { box.querySelector('#labOut').textContent = '参数不是合法 JSON：' + e.message } })
    box.querySelector('#labRun').onclick = async () => {
      const out = box.querySelector('#labOut')
      if (!S.live) return toast('回放模式不能运行工具；请运行 npm start')
      out.textContent = '运行中…'
      try { out.textContent = JSON.stringify(await postJson('/api/tools/' + t.name, args()), null, 1) } catch (e) { out.textContent = '错误：' + e.message }
    }
    box.querySelector('#labAsk').onclick = () => { $('#input').value = `#${m.name} 用 ${t.name}（${t.title}）帮我看一下`; $('#input').focus() }
  }
  function exampleArgs(t) {
    const ex = { insight_query: { brand: '福临门', keyword: ['日期新鲜'], days: 14 }, insight_evidence: { keyword: ['漏油'], limit: 4 }, insight_compare: { dim: 'cat', values: ['花生油', '玉米油'] }, opportunity_pack: { id: 'OP-003' }, geo_fact_draft: { questionId: 'Q-02' }, report_draft: { kind: 'weekly', week: 46 }, dict_lookup: { q: '卖点错位' }, skill_get: { name: 'claim-gap-diagnosis' }, ec_claim_gap: { claims: ['少油烟', '不起沫'] }, insight_publish: { cardId: 'T-2411', confirm: false }, data_import: { dataset: 'social_posts', dryRun: true, records: [{ text: '福临门花生油炒菜很香，桶也没漏', date: '2026-11-03', platform: '小红书' }] } }
    return ex[t.name] || {}
  }

  /* 技能库：技能是文字，业务能读、能审、能改 */
  const skillCard = s => `<div class="skill" data-skill="${esc(s.name)}"><b>${esc(s.title)}</b><span class="v">${esc(s.version)}</span><p>${esc(s.description)}</p><span class="x">${esc(s.owner)}${s.trigger ? ' · ' + esc(s.trigger) : ''}</span><span class="sa"><button class="lnk" data-a="open">查看与修订</button><button class="lnk" data-a="use">用它开始</button></span></div>`
  function bindSkillCards(box) {
    box.querySelectorAll('.skill').forEach(c => c.querySelectorAll('[data-a]').forEach(b => b.onclick = () => b.dataset.a === 'open' ? openPanel({ kind: 'skill', key: c.dataset.skill }) : useSkill(c.dataset.skill)))
  }
  function useSkill(name) { const sc = S.meta.scenarios.find(s => s.skill === name); if (sc) ask(sc.prompt, { scenario: sc.id }); else { $('#input').value = `/${name} `; $('#input').focus() } }
  function renderSkills(box) {
    box.innerHTML = `<div class="bd"><h3>技能库 · ${S.meta.skills.length} 项</h3><p class="cap">技能把好做法写成文字：何时用、调哪些工具、步骤、约束。保存会递增版本并留痕；对话里的分析也能一键沉淀成新技能。</p><div class="skills" id="skillList">${S.meta.skills.map(skillCard).join('')}</div></div>`
    bindSkillCards(box)
  }
  async function showSkill(box, name, append = '') {
    const sk = S.meta.skills.find(s => s.name === name) || S.meta.skills[0]
    const full = S.live ? await getJson('/api/skills/' + sk.name) : S.replay.skills?.[sk.name]
    box.innerHTML = `<div class="bd"><button class="lnk" id="skBack">← 技能库</button><div class="deskhd" style="margin-top:8px">${seal(sk.expert || 'lead')}<div><h2>${esc(sk.title)} <span class="small">${esc(sk.version)}</span></h2><p>${esc(sk.owner)} · ${esc(sk.description)}</p></div></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${(sk.tools || []).map(t => `<span class="tag plat">${esc(t)}</span>`).join('')}</div></div>
      <textarea class="editor" id="skEd" style="min-height:40vh"></textarea>
      <div class="acts"><button class="textbtn pri" id="skSave">保存修订（需确认）</button><button class="textbtn" id="skUse">用这个技能开始任务</button><span class="small">DeepSeek Harness 中以 /brand-${esc(sk.name)} 调用</span></div>
      ${full?.history ? `<div class="bd" style="padding-top:0"><h3>修订记录</h3><pre>${esc(full.history)}</pre></div>` : ''}`
    box.querySelector('#skEd').value = (full?.content || '（回放模式未包含全文）') + append
    box.querySelector('#skBack').onclick = () => openPanel({ kind: 'skills' })
    box.querySelector('#skUse').onclick = () => useSkill(sk.name)
    box.querySelector('#skSave').onclick = async () => {
      if (!S.live) return toast('回放模式不能写入；请运行 npm start')
      let content = box.querySelector('#skEd').value
      const v = /version:\s*v(\d+)\.(\d+)/.exec(content); if (v) content = content.replace(/version:\s*v\d+\.\d+/, `version: v${v[1]}.${+v[2] + 1}`)
      if (!confirm('确认把修订写入技能库？将记录修订人与留痕。')) return
      try { const r = await postJson('/api/skills/' + sk.name, { content, author: '品牌经理（演示）', note: '工作台修订', confirm: true }, 'PUT'); toast(`已保存 ${sk.name} ${r.version}（上一版 ${r.previousVersion}）`); await reloadMeta(); showSkill(box, sk.name) } catch (e) { toast('保存失败：' + e.message) }
    }
  }

  /* 数据接入：批量导入或数据流推入，入库前过四道筛 */
  async function renderData(box) {
    const d = S.live ? await getJson('/api/data/sources') : S.meta.data
    box.innerHTML = `<div class="bd"><h3>数据接入 · ${d.datasets.length} 个数据集</h3><p class="cap">所有数据都可以更新：批量导入或数据流推入，入库前过四道筛（结构 · 去重 · 去无效 · 相关性），入库后智能体下一次调用就用上。</p>
      <div class="tp"><table><tr><th>数据集</th><th>条数</th><th>增量</th><th>最近同步</th></tr>${d.datasets.map(x => `<tr><td>${esc(x.name)}<div class="small">${x.key} · ${esc(x.baseline)}</div></td><td class="n">${fmt(x.rows)}</td><td class="n">${x.increments ? '+' + x.increments : '—'}</td><td class="small">${x.lastSync ? esc(x.lastSync.slice(5, 16).replace('T', ' ')) : '—'}</td></tr>`).join('')}</table></div>
      <div class="form"><label>导入到</label><select id="dsSel">${d.datasets.map(x => `<option value="${x.key}">${esc(x.name)}（${x.key}）</option>`).join('')}</select>
      <p class="small" id="dsFields" style="margin:6px 0 0"></p>
      <label>粘贴数据（CSV / NDJSON / JSON 数组）</label><textarea id="dsPayload"></textarea>
      <div class="acts"><button class="textbtn" id="dsDry">预检（不入库）</button><button class="textbtn pri" id="dsGo">确认导入</button></div>
      <pre id="dsOut" style="display:none"></pre></div>
      <h3>接口（外部系统 / 采集器 / 消息队列）</h3><dl class="kv"><dt>批量</dt><dd><code>${esc(d.endpoints.batch)}</code></dd><dt>流式</dt><dd><code>${esc(d.endpoints.stream)}</code></dd><dt>智能体</dt><dd><code>${esc(d.endpoints.mcp)}</code></dd><dt>命令行</dt><dd><code>${esc(d.endpoints.cli)}</code></dd></dl></div>`
    const sel = box.querySelector('#dsSel')
    const fill = () => { const x = d.datasets.find(y => y.key === sel.value); box.querySelector('#dsFields').innerHTML = Object.entries(x.fields).map(([k, v]) => `<code>${k}</code> ${esc(v)}`).join('；'); box.querySelector('#dsPayload').value = JSON.stringify([x.example], null, 1) }
    sel.onchange = fill; fill()
    const go = async dry => {
      if (!S.live) return toast('回放模式不能写入；请运行 npm start')
      if (!dry && !confirm('确认把通过质检的记录写入数据集？')) return
      const out = box.querySelector('#dsOut'); out.style.display = 'block'; out.textContent = '处理中…'
      try {
        const r = await postJson(`/api/data/${sel.value}/import`, { payload: box.querySelector('#dsPayload').value, dryRun: dry, source: '工作台粘贴' })
        out.textContent = JSON.stringify(r, null, 1)
        if (!dry) { if (S.cur) S.cur.human++; renderStat(); toast(`入库 ${r.accepted} 条（收到 ${r.received}）`); await reloadMeta(); renderData(box) }
      } catch (e) { out.textContent = '错误：' + e.message }
    }
    box.querySelector('#dsDry').onclick = () => go(true); box.querySelector('#dsGo').onclick = () => go(false)
  }

  /* ---------------- 通用 ---------------- */
  function openTab(k) {
    $('#app').classList.remove('noright')
    document.querySelectorAll('#tabs .rtab').forEach(b => b.classList.toggle('on', b.dataset.tab === k))
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + k))
  }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('.rtab'); if (b) openTab(b.dataset.tab) })
  $('#wrap').addEventListener('click', e => { const b = e.target.closest('.skchip[data-skill]'); if (b) openPanel({ kind: 'skill', key: b.dataset.skill }) })
  $('#toggleRight').innerHTML = ico('panel', 17); $('#toggleRight').onclick = () => $('#app').classList.toggle('noright')
  $('#closeRight').innerHTML = ico('close', 15); $('#closeRight').onclick = () => $('#app').classList.add('noright')
  $('#wideRight').innerHTML = ico('expand', 15); $('#wideRight').onclick = () => $('#app').classList.toggle('wide')

  function md(src) {
    const lines = String(src || '').split('\n'); let html = '', list = null, table = null
    const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
    const close = () => { if (list) { html += `</${list}>`; list = null } if (table) { html += '</table>'; table = null } }
    for (const l of lines) {
      let m
      if ((m = /^(#{1,3})\s+(.*)/.exec(l))) { close(); html += `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>` }
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
    return `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="${pad}" x2="${W - pad}" y1="${zero}" y2="${zero}" stroke="#DCE2DA"/>${values.map((v, i) => { const x = pad + (W - 2 * pad) / n * i + ((W - 2 * pad) / n - bw) / 2, h = Math.abs(v) * scale, y = v >= 0 ? zero - h : zero; return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(1, h)}" rx="2" fill="${v >= 0 ? '#2B628F' : '#E3A79E'}"/><text x="${x + bw / 2}" y="${v >= 0 ? y - 3 : y + h + 11}" text-anchor="middle">${v}</text><text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>` }).join('')}</svg>`
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
    mn.innerHTML = f.map(i => `<button data-t="${esc(i.t)}"><b>${esc(i.t)}</b><small>${esc(i.d)}</small></button>`).join(''); mn.style.display = 'block'
  })
  mn.addEventListener('click', e => { const d = e.target.closest('button[data-t]'); if (!d) return; input.value = input.value.replace(/([@/#])([^\s@/#]*)$/, d.dataset.t + ' '); mn.style.display = 'none'; input.focus() })
  function submit() {
    const v = input.value.trim(); if (!v || S.running) return
    input.value = ''; input.style.height = 'auto'; mn.style.display = 'none'
    const sk = /\/([a-z0-9-]+)/.exec(v); const sc = sk && S.meta.scenarios.find(s => s.skill === sk[1])
    const mod = /#(\S+)/.exec(v); const mk = mod && S.meta.modules.find(x => x.name === mod[1])
    ask(v, sc ? { scenario: sc.id } : mk && !/[？?]/.test(v.replace(/#\S+/, '')) ? { module: mk.key } : {})
  }
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() } })
  $('#send').innerHTML = ico('up', 16); $('#send').onclick = submit
  function renderMode() {
    $('#cmode').innerHTML = ico('cpu', 14) + (S.live ? (S.mode === 'online' ? `在线 DeepSeek · ${esc(S.meta.mode?.model || '')}` : '离线规划器 · 真实工具') : '离线回放')
    $('#cmode').classList.toggle('on', S.mode === 'online')
    const mi = $('#modeInfo')
    mi.textContent = S.live ? '已连接 brand-server' : '演示原型 · 离线回放'
    mi.classList.toggle('live', S.live)
    mi.title = S.live ? '实时调用 brand-core 工具；写操作会真实写盘并留痕' : '未连接 brand-server：播放预录的真实会话，数字与工具返回均来自算法层录制。仓库根目录运行 npm start 可体验实时调用。'
  }
  $('#cmode').onclick = () => {
    if (!S.live) return toast('回放模式：运行 npm start 后可切换在线 DeepSeek')
    S.mode = S.mode === 'online' ? 'offline' : 'online'
    if (S.mode === 'online' && !S.meta.mode?.online) toast('服务端未配置 DEEPSEEK_API_KEY：在线模式会自动回退到离线规划器')
    renderMode()
  }

  async function reloadMeta() { if (S.live) { const tasks = S.meta.tasks; S.meta = await getJson('/api/meta'); S.meta.tasks = tasks; renderLeft(); if ($('#pane-panel').classList.contains('on')) renderPanel() } }

  async function boot() {
    try { S.meta = await getJson('/api/meta'); S.live = true }
    catch {
      if (!window.__REPLAY__) await new Promise(r => { const sc = document.createElement('script'); sc.src = 'replay.js'; sc.onload = sc.onerror = r; document.head.appendChild(sc) })
      if (!window.__REPLAY__) { document.body.innerHTML = '<p style="padding:40px">无法连接 brand-server，也未找到回放数据 replay.js。请在仓库根目录运行 <code>npm start</code>。</p>'; return }
      S.replay = window.__REPLAY__; S.meta = S.replay.meta
    }
    $('#cscope').innerHTML = ico('scope', 14) + esc(`${S.meta.brand.brand} · ${S.meta.brand.board}`)
    $('#cperm').innerHTML = ico('shield', 14) + '写入需确认'
    renderMode()
    newSession()
    if (innerWidth < 1180) $('#app').classList.add('noright')
    const q = new URLSearchParams(location.search).get('scenario'); if (q) { const sc = S.meta.scenarios.find(s => s.id === q); if (sc) ask(sc.prompt, { scenario: sc.id }) }
    window.__wb = { S, ask, openTab, openPanel }
  }
  boot()
})()
