import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, `npm run dev` serves the UI on :5173 and forwards /api to the FastAPI server.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
