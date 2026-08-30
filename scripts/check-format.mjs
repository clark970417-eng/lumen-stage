import { readFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

const roots = ['api', 'e2e', 'scripts', 'src', 'tests', '.github']
const rootFiles = ['index.html', 'package.json', 'performance-budget.json', 'playwright.config.ts', 'vite.config.ts']
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.yaml', '.yml'])

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collect(path)
    return textExtensions.has(extname(entry.name)) ? [path] : []
  }))
  return nested.flat()
}

const files = [...rootFiles, ...(await Promise.all(roots.map(collect))).flat()].sort()
const problems = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  if (source.includes('\r')) problems.push(`${file}: contains CRLF line endings`)
  if (!source.endsWith('\n')) problems.push(`${file}: missing final newline`)
  source.split('\n').forEach((line, index) => {
    if (/[ \t]+$/.test(line)) problems.push(`${file}:${index + 1}: trailing whitespace`)
  })
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exitCode = 1
} else {
  console.log(`PASS source formatting: ${files.length} text files`)
}
