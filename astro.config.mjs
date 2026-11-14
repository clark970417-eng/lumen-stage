import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://lumen-stage.vercel.app',
  base: process.env.BASE_PATH || '/',
  integrations: [react()],
  build: { format: 'file', assets: 'assets' },
  vite: { resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'] } },
})
