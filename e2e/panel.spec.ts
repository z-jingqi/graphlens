/**
 * Layer B — Full panel UI E2E tests.
 *
 * Loads panel.html via HTTP (served from dist/ by the test-app server).
 * A chrome shim is injected via addInitScript() so that all chrome.* API
 * calls in the panel resolve against our controllable fake.
 *
 * We then push graphlens-patch messages via window.__emit() and assert that
 * the React panel renders the expected rows, tabs, and state transitions.
 *
 * Prerequisites:
 *   1. npm run build   (produces dist/panel.html + assets)
 *   2. The webServer in playwright.config.ts starts test-app/server.mjs which
 *      serves dist/ as static files at http://localhost:3099/
 */

import { test, expect, type Page } from '@playwright/test'

const PANEL_URL = 'http://localhost:3099/panel.html'

// ── Chrome shim injected before panel scripts load ────────────────────────────

const CHROME_SHIM = `
(() => {
  const ports = new Map()
  const requestListeners = []
  const navListeners = []

  // Expose window.__emit so tests can push patch messages into the panel
  window.__emit = (msg) => {
    const portData = ports.get('panel:1')
    if (portData) portData.listeners.forEach(fn => fn(msg))
  }

  // Expose window.__emitRequest so tests can fire HAR entries
  window.__emitRequest = (entry) => {
    requestListeners.forEach(fn => fn(entry))
  }

  window.chrome = {
    devtools: {
      inspectedWindow: { tabId: 1 },
      network: {
        onRequestFinished: {
          addListener: fn => requestListeners.push(fn),
          removeListener: fn => {},
        },
        onNavigated: {
          addListener: fn => navListeners.push(fn),
          removeListener: fn => {},
        },
        getHAR: cb => cb({ entries: [] }),
      },
    },
    runtime: {
      connect: ({ name }) => {
        const listeners = []
        const port = {
          name,
          onMessage: { addListener: fn => { listeners.push(fn) }, removeListener: () => {} },
          onDisconnect: { addListener: () => {} },
          postMessage: () => {},
          disconnect: () => {},
        }
        ports.set(name, { ...port, listeners })
        return port
      },
    },
  }
})()
`

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadPanel(page: Page) {
  await page.addInitScript(CHROME_SHIM)
  await page.goto(PANEL_URL)
  // Wait for the React app to mount
  await page.waitForSelector('[title="Stop recording"], [title="Start recording"]', { timeout: 10_000 })
}

function patchMsg(kind: string, extra: Record<string, unknown>) {
  return { source: 'graphlens-patch', kind, ...extra }
}

async function emitMsg(page: Page, msg: Record<string, unknown>) {
  await page.evaluate((m) => (window as unknown as { __emit: (m: unknown) => void }).__emit(m), msg)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Panel UI (Layer B)', () => {
  test.beforeEach(async ({ page }) => {
    await loadPanel(page)
  })

  // ── Row creation & state ──────────────────────────────────────────────────

  test('shows a pending row for a graphql HTTP request', async ({ page }) => {
    await emitMsg(page, patchMsg('started', {
      id: 'r1',
      url: 'https://api.example.com/graphql',
      method: 'POST',
      startedAt: Date.now(),
      body: '{"query":"query GetUser { user { id } }","operationName":"GetUser"}',
    }))
    await expect(page.getByText('GetUser')).toBeVisible()
  })

  test('non-graphql HTTP request does NOT appear', async ({ page }) => {
    await emitMsg(page, patchMsg('started', {
      id: 'r-plain',
      url: 'https://api.example.com/rest/users',
      method: 'GET',
      startedAt: Date.now(),
    }))
    // Wait a moment to make sure no row appears
    await page.waitForTimeout(200)
    await expect(page.getByText('rest/users')).not.toBeVisible()
  })

  test('transitions HTTP row to finished after completed', async ({ page }) => {
    const id = 'r2'
    await emitMsg(page, patchMsg('started', {
      id,
      url: 'https://api.example.com/graphql',
      method: 'POST',
      startedAt: Date.now(),
      body: '{"query":"query GetUser { user { id } }","operationName":"GetUser"}',
    }))
    await emitMsg(page, patchMsg('completed', { id, status: 200, durationMs: 45 }))
    await expect(page.getByText('200')).toBeVisible()
  })

  test('WS with graphql subprotocol shows row immediately', async ({ page }) => {
    await emitMsg(page, patchMsg('started', {
      id: 'ws1',
      url: 'wss://api.example.com/ws',
      method: 'WS',
      startedAt: Date.now(),
      transport: 'websocket',
      protocols: ['graphql-transport-ws'],
    }))
    // Row appears immediately (pending state) — name is the URL's last path segment
    await expect(page.getByText('Pending…')).toBeVisible()
  })

  test('WS without subprotocol is hidden until a subscribe frame', async ({ page }) => {
    const id = 'ws-plain'
    await emitMsg(page, patchMsg('started', {
      id,
      url: 'wss://api.example.com/ws-plain',
      method: 'WS',
      startedAt: Date.now(),
      transport: 'websocket',
      protocols: [],
    }))
    await page.waitForTimeout(200)
    // Should not be visible yet
    await expect(page.getByText('ws-plain')).not.toBeVisible()

    // Send a subscribe frame
    await emitMsg(page, patchMsg('frame', {
      id,
      direction: 'send',
      data: JSON.stringify({ type: 'subscribe', id: '1', payload: { query: 'subscription OnUser { userUpdated { id } }', operationName: 'OnUser' } }),
      timestamp: Date.now(),
    }))
    await expect(page.getByText('OnUser')).toBeVisible()
  })

  // ── Detail panel ──────────────────────────────────────────────────────────

  test('clicking a row opens the detail panel with tabs', async ({ page }) => {
    await emitMsg(page, patchMsg('started', {
      id: 'r3',
      url: 'https://api.example.com/graphql',
      method: 'POST',
      startedAt: Date.now(),
      body: '{"query":"query GetUser { user { id } }","operationName":"GetUser"}',
    }))
    await emitMsg(page, patchMsg('completed', { id: 'r3', status: 200, durationMs: 30 }))

    await page.getByText('GetUser').click()
    // Scope to the detail panel tab bar to avoid matching the FilterBar "Query" pill
    const tabs = page.getByRole('button', { name: 'Variables' })
    await expect(tabs).toBeVisible()
    await expect(page.getByRole('button', { name: 'Headers' })).toBeVisible()
  })

  // ── Filter bar ────────────────────────────────────────────────────────────

  test('text filter hides non-matching rows', async ({ page }) => {
    await emitMsg(page, patchMsg('started', {
      id: 'r-user',
      url: 'https://api.example.com/graphql',
      method: 'POST',
      startedAt: Date.now(),
      body: '{"query":"query GetUser { user { id } }","operationName":"GetUser"}',
    }))
    await emitMsg(page, patchMsg('started', {
      id: 'r-product',
      url: 'https://api.example.com/graphql',
      method: 'POST',
      startedAt: Date.now() + 1,
      body: '{"query":"query GetProduct { product { id } }","operationName":"GetProduct"}',
    }))

    await page.waitForSelector('input[placeholder="Filter"]')
    await page.fill('input[placeholder="Filter"]', 'GetProduct')
    // Wait for debounce
    await page.waitForTimeout(300)

    await expect(page.getByText('GetProduct')).toBeVisible()
    await expect(page.getByText('GetUser')).not.toBeVisible()
  })

  // ── Record toggle ─────────────────────────────────────────────────────────

  test('stopping recording suppresses new rows', async ({ page }) => {
    // Stop recording
    await page.click('[title="Stop recording"]')

    await emitMsg(page, patchMsg('started', {
      id: 'r-muted',
      url: 'https://api.example.com/graphql',
      method: 'POST',
      startedAt: Date.now(),
      body: '{"query":"query MutedQuery { user { id } }","operationName":"MutedQuery"}',
    }))
    await page.waitForTimeout(200)
    await expect(page.getByText('MutedQuery')).not.toBeVisible()
  })

  // ── Clear button ──────────────────────────────────────────────────────────

  test('clear button removes all rows', async ({ page }) => {
    await emitMsg(page, patchMsg('started', {
      id: 'r-clear',
      url: 'https://api.example.com/graphql',
      method: 'POST',
      startedAt: Date.now(),
      body: '{"query":"query ClearTest { user { id } }","operationName":"ClearTest"}',
    }))
    await expect(page.getByText('ClearTest')).toBeVisible()

    await page.click('[title="Clear requests"]')
    await expect(page.getByText('ClearTest')).not.toBeVisible()
  })

  // ── WS / SSE streams ──────────────────────────────────────────────────────

  test('WS row shows frame count after messages', async ({ page }) => {
    const id = 'ws-stream'
    await emitMsg(page, patchMsg('started', {
      id,
      url: 'wss://api.example.com/ws',
      method: 'WS',
      startedAt: Date.now(),
      transport: 'websocket',
      protocols: ['graphql-ws'],
    }))
    await emitMsg(page, patchMsg('completed', { id, status: 101, durationMs: 0 }))
    for (let i = 0; i < 3; i++) {
      await emitMsg(page, patchMsg('frame', {
        id,
        direction: 'receive',
        data: JSON.stringify({ type: 'next', id: '1', payload: { data: { count: i } } }),
        timestamp: Date.now() + i,
      }))
    }
    // Status cell shows "3 msgs"
    await expect(page.getByText(/3 msgs/i)).toBeVisible()
  })

  test('WS row transitions to Closed after disconnect', async ({ page }) => {
    const id = 'ws-close'
    await emitMsg(page, patchMsg('started', {
      id,
      url: 'wss://api.example.com/ws',
      method: 'WS',
      startedAt: Date.now(),
      transport: 'websocket',
      protocols: ['graphql-ws'],
    }))
    await emitMsg(page, patchMsg('completed', { id, status: 101, durationMs: 0 }))
    await emitMsg(page, patchMsg('disconnected', { id, durationMs: 1000 }))
    await expect(page.getByText('Closed')).toBeVisible()
  })
})
