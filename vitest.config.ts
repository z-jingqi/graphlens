import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node; individual files opt into happy-dom via
    // // @vitest-environment happy-dom pragma comment
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/panel/main.tsx',
        'src/devtools.ts',
        'src/content/injector.ts',
      ],
    },
  },
})
