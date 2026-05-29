import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const UNHASHED = new Set(['patch', 'injector', 'background'])

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'chrome111',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(__dirname, 'devtools.html'),
        panel: resolve(__dirname, 'panel.html'),
        patch: resolve(__dirname, 'src/content/patch.ts'),
        injector: resolve(__dirname, 'src/content/injector.ts'),
        background: resolve(__dirname, 'src/background/background.ts'),
      },
      output: {
        entryFileNames: chunk =>
          UNHASHED.has(chunk.name) ? '[name].js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
