import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps every asset URL relative, so the same build works on
// GitHub Pages (served from /<repo>/) and from the offline local server.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
    sourcemap: false,
  },
  server: { port: 5173 },
})
