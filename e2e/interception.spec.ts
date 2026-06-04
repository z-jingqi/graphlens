/**
 * Layer A — Page interception E2E tests.
 *
 * These tests verify that patch.ts correctly intercepts fetch, XHR, WebSocket,
 * and EventSource in a real browser.  We use chromium.launchPersistentContext
 * with the extension loaded so that patch.js / injector.js run in the page.
 *
 * Rather than inspecting the DevTools panel (which requires complex DevTools
 * automation), we intercept window.postMessage events — that is, the raw
 * messages that patch.ts sends before injector.ts forwards them.
 *
 * Prerequisites:
 *   1. npm run build           (produces dist/)
 *   2. npm run test-app        (starts the test server on :3099)
 *   3. npx playwright install  (installs browsers)
 */

import { test, expect, chromium } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '../dist')

// ── Custom fixture that launches Chrome with the extension loaded ─────────────

async function withExtensionContext(
  cb: (ctx: Awaited<ReturnType<typeof chromium.launchPersistentContext>>) => Promise<void>
) {
  const userDataDir = path.join(os.tmpdir(), `graphlens-e2e-${Date.now()}`)
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,        // extensions need headful or new-headless mode
    channel: 'chromium',   // use Playwright's bundled Chromium
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      '--no-sandbox',
    ],
  })
  try {
    await cb(context)
  } finally {
    await context.close()
  }
}

// ── Helper: collect postMessage events from a page ────────────────────────────

async function collectMessages(
  ctx: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
  trigger: (page: ReturnType<typeof ctx.newPage> extends Promise<infer P> ? P : never) => Promise<void>,
  opts = { waitMs: 800 }
): Promise<Record<string, unknown>[]> {
  const page = await ctx.newPage()

  // Install a message collector BEFORE the page loads so we capture every message
  await page.addInitScript(() => {
    ;(window as unknown as { __gqlMessages: unknown[] }).__gqlMessages = []
    window.addEventListener('message', e => {
      const data = e.data as Record<string, unknown> | null
      if (data?.source === 'graphlens-patch') {
        ;(window as unknown as { __gqlMessages: unknown[] }).__gqlMessages.push(data)
      }
    })
  })

  await page.goto('http://localhost:3099')
  await trigger(page)
  await page.waitForTimeout(opts.waitMs)

  const msgs = await page.evaluate(
    () => (window as unknown as { __gqlMessages: unknown[] }).__gqlMessages
  ) as Record<string, unknown>[]

  await page.close()
  return msgs
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('patch.ts interception (Layer A)', () => {
  test('captures fetch: started + completed for a GraphQL POST', async () => {
    await withExtensionContext(async ctx => {
      const msgs = await collectMessages(ctx, async page => {
        await page.click('[data-trigger="graphql-query"]')
      })

      const started = msgs.find(m => m.kind === 'started' && String(m.url).includes('/graphql'))
      const completed = msgs.find(m => m.kind === 'completed' && m.id === started?.id)

      expect(started).toBeDefined()
      expect(started!.method).toBe('POST')
      expect(String(started!.body)).toContain('GetUser')
      expect(completed).toBeDefined()
      expect(completed!.status).toBe(200)
    })
  })

  test('captures fetch: started + completed for XHR', async () => {
    await withExtensionContext(async ctx => {
      const msgs = await collectMessages(ctx, async page => {
        await page.click('[data-trigger="graphql-xhr"]')
      })
      expect(msgs.some(m => m.kind === 'started' && m.method === 'POST')).toBe(true)
      expect(msgs.some(m => m.kind === 'completed')).toBe(true)
    })
  })

  test('captures fetch-SSE: sse-start + frame events', async () => {
    await withExtensionContext(async ctx => {
      const msgs = await collectMessages(ctx, async page => {
        await page.click('[data-trigger="fetch-sse"]')
      }, { waitMs: 1500 })

      expect(msgs.some(m => m.kind === 'sse-start')).toBe(true)
      expect(msgs.some(m => m.kind === 'frame' && m.direction === 'receive')).toBe(true)
    })
  })

  test('captures WebSocket: started with protocols, frames, completed', async () => {
    await withExtensionContext(async ctx => {
      const msgs = await collectMessages(ctx, async page => {
        await page.click('[data-trigger="graphql-ws-subscribe"]')
      }, { waitMs: 2000 })

      const started = msgs.find(m => m.kind === 'started' && m.transport === 'websocket')
      expect(started).toBeDefined()
      const protocols = started!.protocols as string[]
      expect(protocols).toContain('graphql-transport-ws')

      // Should have send frames (subscribe) and receive frames (next)
      expect(msgs.some(m => m.kind === 'frame' && m.direction === 'send')).toBe(true)
      expect(msgs.some(m => m.kind === 'frame' && m.direction === 'receive')).toBe(true)
    })
  })

  test('captures EventSource: started with transport=sse, frame events', async () => {
    await withExtensionContext(async ctx => {
      const msgs = await collectMessages(ctx, async page => {
        await page.click('[data-trigger="eventsource-sse"]')
      }, { waitMs: 1000 })

      const started = msgs.find(m => m.kind === 'started' && m.transport === 'sse')
      expect(started).toBeDefined()
      expect(msgs.some(m => m.kind === 'frame' && m.direction === 'receive')).toBe(true)
    })
  })

  test('[negative] plain (non-graphql) WebSocket still produces started message', async () => {
    await withExtensionContext(async ctx => {
      const msgs = await collectMessages(ctx, async page => {
        await page.click('[data-trigger="plain-ws"]')
      })
      // patch.ts intercepts ALL WS — promotion/filtering is the panel's job
      const started = msgs.find(m => m.kind === 'started' && m.transport === 'websocket')
      expect(started).toBeDefined()
      // But the protocols array should NOT include a graphql subprotocol
      const protocols = (started!.protocols as string[]) ?? []
      expect(protocols.every((p: string) => !p.includes('graphql'))).toBe(true)
    })
  })
})
