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
      input: { main: 'index.html', analyze: 'analyze.html' }
    }
  }
})
