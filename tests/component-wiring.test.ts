import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(entry.name) ? [path] : []
  })

test('every component is reachable from the app', () => {
  // A component nothing mounts still compiles, still passes review, and still
  // accepts changes -- it just never runs. Library.tsx was in that state from
  // the workflow redesign onward, and three later commits edited it anyway,
  // including one of mine that added the fabric swatch to a panel no user
  // could open. The button existed, typechecked, and did nothing.
  //
  // Lazy mounts count: several real components are only ever reached through
  // import(), which is why matching `from '...'` alone is not enough.
  const files = sources('src')
  const text = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]))
  const orphans: string[] = []
  for (const file of files.filter((f) => f.includes('/components/'))) {
    const name = file.split('/').pop()!.replace(/\.tsx?$/, '')
    const referenced = new RegExp(`(from|import\\()\\s*'[^']*(/|\\./)${name}'`)
    const mounted = [...text].some(([other, body]) => other !== file && referenced.test(body))
    if (!mounted) orphans.push(name)
  }
  assert.deepEqual(orphans, [], `nothing imports ${orphans.join(', ')} — mount it or delete it`)
})
