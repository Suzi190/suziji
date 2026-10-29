// 临时截图/量尺脚本：headless Edge + CDP，仅本地验证用，验完即删
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const W = Number(process.env.W || 390)
const H = Number(process.env.H || 844)
const OUT = process.env.OUT || 'tmp-shots/shot.png'
const PORT = Number(process.env.PORT || 9333)
const URL_ = process.env.URL || 'http://localhost:5173/'
const PROFILE = 'tmp-edge-shot'

mkdirSync('tmp-shots', { recursive: true })

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => {
  try { return !!statSync(p) } catch { return false }
})

async function getJson(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return r.json()
}

async function ensureBrowser() {
  try {
    await getJson('/json/version')
    log('cdp ready (reused)')
    return
  } catch { /* not running */ }
  log('launch edge')
  const child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--headless=new',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    `--window-size=${W},${H}`,
    'about:blank',
  ], { stdio: 'ignore', detached: true })
  child.unref()
  for (let i = 0; i < 40; i++) {
    await sleep(1000)
    try { await getJson('/json/version'); log(`cdp ready (${i + 1}s)`); return } catch { /* wait */ }
  }
  throw new Error('edge 未在 40 秒内就绪')
}

function log(msg) { console.log(`> ${msg}`) }

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
    })
    ws.addEventListener('error', reject)
    ws.addEventListener('open', () => resolve({
      send(method, params = {}, timeout = 15000) {
        const mid = ++id
        ws.send(JSON.stringify({ id: mid, method, params }))
        const timer = new Promise((_, rej) => setTimeout(() => rej(new Error(`cdp timeout: ${method}`)), timeout))
        const p = new Promise((res, rej) => pending.set(mid, { resolve: res, reject: rej }))
        return Promise.race([p, timer])
      },
      close() { ws.close() },
    }))
  })
}

const MEASURE = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: +b.width.toFixed(1), h: +b.height.toFixed(1), x: +b.x.toFixed(1), y: +b.y.toFixed(1) } }
  const hero = document.querySelector('.hero')
  const cs = (el) => el ? getComputedStyle(el) : null
  const cal = document.querySelector('.calendar .mini-calendar') || document.querySelector('.mini-calendar')
  const days = document.querySelector('.days')
  const monthEl = document.querySelector('.month, .cal-month')
  const dayEl = document.querySelector('.day')
  return {
    size: [innerWidth, innerHeight],
    hero: r(hero),
    top: r(document.querySelector('.top')),
    mid: r(document.querySelector('.mid')),
    photo: r(document.querySelector('.photo')),
    cal: r(document.querySelector('.calendar')),
    circles: [...document.querySelectorAll('.circle')].map(e => +e.getBoundingClientRect().width.toFixed(1)),
    sticker: r(document.querySelector('.sticker')),
    icons: [...document.querySelectorAll('.app-icon')].slice(0, 4).map(e => r(e).w),
    dock: [...document.querySelectorAll('.dock .app-icon')].slice(0, 1).map(e => r(e).w),
    calStyles: {
      month: monthEl ? cs(monthEl).fontSize : null,
      days: days ? cs(days).fontSize : null,
      dayH: dayEl ? cs(dayEl).height : null,
      rows: days ? +days.getBoundingClientRect().height.toFixed(1) : null,
      scrollH: days ? days.scrollHeight : null,
    },
    sloganText: document.querySelector('.slogan')?.textContent?.trim(),
    docOverflow: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight },
    calOverflow: cal ? { sh: cal.scrollHeight, ch: cal.clientHeight, sw: cal.scrollWidth, cw: cal.clientWidth } : null,
  }
})()`

await ensureBrowser()
const targets = await getJson('/json/list')
const page = targets.find((t) => t.type === 'page')
const cdp = await connect(page.webSocketDebuggerUrl)

log('navigate first')
await cdp.send('Page.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
await cdp.send('Page.navigate', { url: URL_ })
await sleep(4000)

log('measure')
const { result } = await cdp.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true, awaitPromise: true })
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 20000)
writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
console.log(`W${W}xH${H} -> ${OUT}`)
console.log(JSON.stringify(result.value, null, 1))
cdp.close()
