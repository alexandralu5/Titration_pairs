import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Порт 3000 занят веб-сервисом NestJS, поэтому фронтенд запускается на 3001
    port: 3001,
    // Проксирование запросов к веб-сервису (обход CORS): /api/... -> http://localhost:3000/api/...
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
