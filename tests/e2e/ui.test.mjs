/** 浏览器端到端：工作台三栏、T-2411 全链路 + 签发、沉淀技能 + 写入、数据导入、工具台。需要预装 Playwright（无则跳过）。 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isolate, ROOT } from '../helpers.mjs'

let chromium
try { chromium = createRequire(import.meta.url)('playwright').chromium } catch {}
const { env, ws, sk } = isolate()
let srv, base, browser, page
const errors = []
before(async () => {
  if (!chromium) return
  srv = spawn(process.execPath, ['packages/brand-server/src/server.js'], { cwd: ROOT, env: { ...env, PORT: '0' } })
  base = await new Promise(r => srv.stdout.on('data', d => { const m = /http:\/\/([\d.]+):(\d+)/.exec(String(d)); if (m) r(`http://${m[1]}:${m[2]}`) }))
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', d => d.accept())
  await page.goto(base); await page.waitForSelector('.qcard')
})
after(async () => { await browser?.close(); srv?.kill() })
const idle = () => page.waitForFunction(() => window.__wb && !window.__wb.S.running, null, { timeout: 60000 })

test('左栏：10 个能力模块、7 位专家、8 项技能、6 个任务', { skip: !chromium }, async () => {
  assert.equal(await page.locator('#modules .it').count(), 10)
  assert.equal(await page.locator('#experts .it').count(), 7)
  assert.equal(await page.locator('#skills .it').count(), 8)
  assert.equal(await page.locator('#tasks .it').count(), 6)
})

test('T-2411：点任务卡 → 专家接手 → 6 次工具 → 结论卡 4/4 → 签发写盘', { skip: !chromium }, async () => {
  await page.locator('.qcard').first().click(); await idle()
  assert.match(await page.locator('.handoff').last().innerText(), /洞察分析师/)
  assert.equal(await page.locator('.tool .st.ok').count(), 6)
  assert.match(await page.locator('.cardmini').innerText(), /数字溯源 4\/4/)
  assert.equal(await page.locator('#dCount').innerText(), '1')
  await page.locator('.gate button').click()
  await page.waitForSelector('.gate:has-text("已签发")')
  assert.ok(existsSync(join(ws, 'insights', 'T-2411.md')), '签发后结论卡写入 workspace/insights')
})

test('沉淀为技能：起草 → 确认写入 → 左栏技能库出现', { skip: !chromium }, async () => {
  await page.locator('.chip', { hasText: '沉淀' }).first().click(); await idle()
  await page.locator('#pane-deliver .btn.ok').click()
  await page.waitForFunction(() => document.querySelectorAll('#skills .it').length === 9)
  assert.match(readFileSync(join(sk, 'my-t2411-playbook', 'SKILL.md'), 'utf8'), /insight_compose/)
})

test('数据面板：粘贴导入后数据集条数增加', { skip: !chromium }, async () => {
  await page.locator('#tabs button[data-tab=data]').click(); await page.waitForSelector('#dsPayload')
  await page.fill('#dsPayload', '[{"text":"福临门葵花籽油 清爽不腻 日期新鲜","date":"2026-11-01","platform":"小红书"}]')
  await page.locator('#dsGo').click()
  await page.waitForFunction(() => /\+1/.test(document.querySelector('#pane-data table').innerText))
})

test('工具台：选模块运行工具得到结构化返回', { skip: !chromium }, async () => {
  await page.locator('[data-module=ecommerce]').click(); await page.waitForSelector('#labRun')
  await page.locator('#labRun').click()
  await page.waitForFunction(() => /validRate/.test(document.querySelector('#labOut').textContent))
  assert.deepEqual(errors, [])
})
