import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
      input: { main: 'index.html', analyze: 'analyze.html' },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('three-gpu-pathtracer')) return 'pathtracer-vendor'
          if (id.includes('@react-three/postprocessing') || id.includes('/postprocessing/')) return 'postprocessing-vendor'
          if (id.includes('@react-three/drei')) return 'r3f-drei-vendor'
          if (id.includes('@react-three/fiber')) return 'r3f-core-vendor'
          if (id.includes('/three/')) return 'three-vendor'
          if (id.includes('/react-dom/') || id.includes('/react/')) return 'react-vendor'
          return undefined
        }
      }
    }
  }
})
