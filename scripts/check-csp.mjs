import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const config = JSON.parse(await readFile('vercel.json', 'utf8'))
const policy = config.headers.flatMap(entry => entry.headers).find(header => header.key === 'Content-Security-Policy').value
const missing = new Set()
for (const file of (await readdir('dist')).filter(file => file.endsWith('.html'))) {
  const html = await readFile(`dist/${file}`, 'utf8')
  for (const [, attributes, source] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (attributes.includes('src=') || !source.trim()) continue
    const hash = `'sha256-${createHash('sha256').update(source).digest('base64')}'`
    if (!policy.includes(hash)) missing.add(hash)
  }
}
if (missing.size) throw new Error(`Add these generated Astro script hashes to vercel.json script-src: ${[...missing].join(' ')}`)
console.log('PASS Astro inline scripts match the production content security policy')
