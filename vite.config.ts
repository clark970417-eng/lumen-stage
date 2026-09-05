import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serves the offline converters' source assets during development only.
 *
 * These are hundreds of megabytes of FBX and TGA that scripts/*-build.html read
 * to rebuild the cast and the captured poses. They used to be staged in
 * public/, which Vite copies wholesale into dist/ — 306 MB of them reached the
 * deployed site that way. They live outside the project now, and this is what
 * gives the converters a URL to fetch them from without any of it being part
 * of a build.
 */
function converterSources(): Plugin {
  const roots = ['rocketbox-src', 'anim-src']
  const types: Record<string, string> = {
    '.fbx': 'application/octet-stream',
    '.tga': 'image/x-tga',
    '.json': 'application/json',
  }
  return {
    name: 'lumen-converter-sources',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = decodeURIComponent((request.url || '').split('?')[0])
        const root = roots.find((name) => url.startsWith(`/${name}/`))
        if (!root) return next()
        // normalize collapses any .. before it can climb out of the directory.
        const file = join(root, normalize(url.slice(root.length + 2)))
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next()
        response.setHeader('Content-Type', types[extname(file).toLowerCase()] ?? 'application/octet-stream')
        createReadStream(file).pipe(response)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), converterSources()],
  // R3F hooks rely on a singleton context. Keep the renderer and Three.js on
  // one resolved module graph in development as well as in production builds.
  resolve: {
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber']
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing'
    ]
  },
  build: {
    rollupOptions: {
      // Let Vite follow the actual dynamic-import boundaries. Manual vendor
      // chunks pulled the path tracer into index.html as a module preload,
      // making the marketing homepage download the 3D engine before it was
      // needed.
      input: { main: 'index.html', analyze: 'analyze.html' },
    }
  }
})
