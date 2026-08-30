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
      // Let Vite follow the actual dynamic-import boundaries. Manual vendor
      // chunks pulled the path tracer into index.html as a module preload,
      // making the marketing homepage download the 3D engine before it was
      // needed.
      input: { main: 'index.html', analyze: 'analyze.html' },
    }
  }
})
