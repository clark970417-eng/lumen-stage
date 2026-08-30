import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

// The 300 dpi guide pages are print-production sources. The downloadable PDFs
// are the public artifact, so shipping both adds roughly 31 MB without a route.
const buildOnlySources = [resolve('dist/guide-pages')]

await Promise.all(buildOnlySources.map((path) => rm(path, { recursive: true, force: true })))
