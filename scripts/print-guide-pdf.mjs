import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const [output, locale = 'en', url = 'http://127.0.0.1:5174/studio?ui=full'] = process.argv.slice(2)
if (!output) throw new Error('Usage: node scripts/print-guide-pdf.mjs <output> [locale] [url]')

const labels = { en: 'Guide', zh: '教學', ja: 'ガイド' }
const pages = await fetch('http://127.0.0.1:9223/json/list').then((response) => response.json())
const page = pages.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1:5174/'))
if (!page) throw new Error('No Lumen Stage page is connected to Chrome on port 9223')

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
await call('Runtime.evaluate', {
  expression: `localStorage.setItem('lumen-stage:locale', ${JSON.stringify(locale)}); ['v1', 'v2'].forEach((version) => { localStorage.setItem('lumen-stage:onboarding:' + version + ':desktop', 'done'); localStorage.setItem('lumen-stage:onboarding:' + version + ':mobile', 'done'); }); location.href = ${JSON.stringify(url)}`,
})
await new Promise((resolve) => setTimeout(resolve, 6500))
await call('Runtime.evaluate', { expression: `document.querySelector('.file-menu > button')?.click()` })
await new Promise((resolve) => setTimeout(resolve, 150))
await call('Runtime.evaluate', {
  expression: `([...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim().startsWith(${JSON.stringify(labels[locale])})))?.click()`,
})
await new Promise((resolve) => setTimeout(resolve, 500))
const guideState = await call('Runtime.evaluate', {
  expression: `({ pages: document.querySelectorAll('.guide-page-stage > figure').length, title: document.querySelector('.guide-dialog')?.getAttribute('aria-label') })`,
  returnByValue: true,
})
if (guideState.result?.value?.pages !== 10) throw new Error(`Guide did not open correctly for ${locale}`)
await call('Runtime.evaluate', {
  expression: `(() => {
    const images = [...document.querySelectorAll('.guide-slide img')];
    images.forEach((image) => { image.loading = 'eager'; });
    return Promise.race([
      Promise.all(images.map((image) => image.complete ? true : new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); }))),
      new Promise((resolve) => setTimeout(resolve, 12000)),
    ]);
  })()`,
  awaitPromise: true,
})
await call('Emulation.setEmulatedMedia', { media: 'print' })
const pdf = await call('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: false,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
})
await mkdir(dirname(output), { recursive: true })
await writeFile(output, Buffer.from(pdf.data, 'base64'))
socket.close()
console.log(`Printed ${locale} guide → ${output}`)
