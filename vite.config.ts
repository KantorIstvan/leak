import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri expects a fixed port and its own console output.
  clearScreen: false,
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  // Tests never reach Supabase; the client just needs a URL to construct.
  test: { env: { VITE_SUPABASE_URL: 'http://localhost', VITE_SUPABASE_PUBLISHABLE_KEY: 'test' } },
})
