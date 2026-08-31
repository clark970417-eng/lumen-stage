import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const [output, locale = 'en', widthArg = '1280', heightArg = '720', scaleArg = '1', url = 'http://127.0.0.1:5173/studio?ui=full', modeArg = '0', scrollSelector = ''] = process.argv.slice(2)
if (!output) throw new Error('Usage: node scripts/capture-ui.mjs <output> [locale] [width] [height] [scale] [url] [modeIndex]')

const width = Number(widthArg)
const height = Number(heightArg)
const deviceScaleFactor = Number(scaleArg)
const browserPort = process.env.LUMEN_CHROME_PORT || '9224'
const pages = await fetch(`http://127.0.0.1:${browserPort}/json/list`).then((response) => response.json())
const page = pages.find((item) => item.type === 'page' && item.url.startsWith(new URL(url).origin)) ?? pages.find((item) => item.type === 'page')
if (!page) throw new Error(`No Lumen Stage page is connected to Chrome on port ${browserPort}`)

const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let sequence = 0

socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) request.reject(new Error(message.error.message))
  else request.resolve(message.result)
}

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})

await call('Page.enable')
await call('Runtime.enable')
await call('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor,
  mobile: width <= 900,
  screenWidth: width,
  screenHeight: height,
})
await call('Runtime.evaluate', {
  expression: `localStorage.setItem('lumen-stage:locale', ${JSON.stringify(locale)}); ['v1', 'v2'].forEach((version) => { localStorage.setItem('lumen-stage:onboarding:' + version + ':desktop', 'done'); localStorage.setItem('lumen-stage:onboarding:' + version + ':mobile', 'done'); }); location.href = ${JSON.stringify(url)}`,
})
await new Promise((resolve) => setTimeout(resolve, 7000))
await call('Runtime.evaluate', {
  expression: `(() => {
    const index = ${Math.max(0, Number(modeArg) || 0)};
    const desktop = [...document.querySelectorAll('.workflow-navigation button')];
    const mobile = [...document.querySelectorAll('.m-tabs [role="tab"]')];
    const target = (desktop.length ? desktop : mobile)[index];
    if (target instanceof HTMLElement) target.click();
  })()`,
})
await new Promise((resolve) => setTimeout(resolve, 1800))
if (scrollSelector) {
  await call('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(scrollSelector)})?.scrollIntoView({ block: 'start' })`,
  })
  await new Promise((resolve) => setTimeout(resolve, 1200))
}
const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true })
await mkdir(dirname(output), { recursive: true })
await writeFile(output, Buffer.from(screenshot.data, 'base64'))
socket.close()
console.log(`Captured ${width}x${height} @${deviceScaleFactor}x → ${output}`)
