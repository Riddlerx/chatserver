import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  build: {
    // Use '../public' for Docker builds (self-hosted), 'dist' for Vercel
    outDir: process.env.BUILD_TARGET === 'docker' ? '../public' : 'dist',
    emptyOutDir: true, // clears old files automatically before each build
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://backend:3000',
        ws: true,
      },
      '/uploads': {
        target: 'http://backend:3000',
        changeOrigin: true,
      },
    },
  },
}))
