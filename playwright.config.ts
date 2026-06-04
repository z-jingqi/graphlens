import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3099',
    trace: 'on-first-retry',
  },

  projects: [
    {
      // Layer A: interception tests — these use chromium.launchPersistentContext
      // inside the test fixture (extension loading requires it).  The project
      // config here is intentionally minimal.
      name: 'interception',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/interception.spec.ts',
    },
    {
      // Layer B: panel UI tests — load panel.html via HTTP + injected chrome shim.
      name: 'panel',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/panel.spec.ts',
    },
  ],

  webServer: {
    command: 'node test-app/server.mjs',
    port: 3099,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
})
