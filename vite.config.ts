import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// `base: './'` keeps asset URLs relative so the same build loads from file:// inside Electron.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
