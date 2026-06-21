import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  server: {
    port: 5175,
    strictPort: true
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  envPrefix: ['VITE_', 'MANIFEST_']
})
