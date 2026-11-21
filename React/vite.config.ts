import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // The path the app is served from. GitHub Pages serves it at /<repo>/,
  // so the deploy workflow sets BASE_PATH; locally it stays /gptitor/.
  base: process.env.BASE_PATH || "/gptitor/",
  plugins: [react()],
})
