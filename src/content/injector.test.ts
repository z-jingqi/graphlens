// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── chrome stub for injector ───────────────────────────────────────────────────

function setupInjector() {
  const sentMessages: unknown[] = []

  ;(globalThis as Record<string, unknown>).chrome = {
    runtime: {
      sendMessage: vi.fn((msg: unknown) => {
        sentMessages.push(msg)
        return Promise.resolve()
      }),
    },
  }

  // Delete the guard so the IIFE can re-run on each fresh module import
  vi.resetModules()

  return { sentMessages }
}

describe('injector.ts', () => {
  let ctx: ReturnType<typeof setupInjector>

  beforeEach(async () => {
    ctx = setupInjector()
    await import('./injector.ts')
  })

  it('forwards a graphlens-patch message to chrome.runtime.sendMessage', () => {
    const msg = { source: 'graphlens-patch', kind: 'started', id: 'r1' }
    window.dispatchEvent(new MessageEvent('message', {
      data: msg,
      source: window,
    }))

    const sendMessage = ((globalThis as Record<string, unknown>).chrome as {
      runtime: { sendMessage: ReturnType<typeof vi.fn> }
    }).runtime.sendMessage

    expect(sendMessage).toHaveBeenCalledWith(msg)
  })

  it('ignores messages with a different source', () => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: 'something-else', kind: 'started' },
      source: window,
    }))

    const sendMessage = ((globalThis as Record<string, unknown>).chrome as {
      runtime: { sendMessage: ReturnType<typeof vi.fn> }
    }).runtime.sendMessage

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('ignores messages not originating from window itself', () => {
    // e.source !== window — simulated by using an iframe source
    // In happy-dom we can't easily create a real different source, but we can
    // dispatch a message event whose source is null (as it would be from a cross-origin frame)
    const event = new MessageEvent('message', {
      data: { source: 'graphlens-patch', kind: 'started' },
      source: null,
    })
    window.dispatchEvent(event)

    const sendMessage = ((globalThis as Record<string, unknown>).chrome as {
      runtime: { sendMessage: ReturnType<typeof vi.fn> }
    }).runtime.sendMessage

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('ignores null/undefined data', () => {
    window.dispatchEvent(new MessageEvent('message', { data: null, source: window }))
    window.dispatchEvent(new MessageEvent('message', { data: undefined, source: window }))

    const sendMessage = ((globalThis as Record<string, unknown>).chrome as {
      runtime: { sendMessage: ReturnType<typeof vi.fn> }
    }).runtime.sendMessage

    expect(sendMessage).not.toHaveBeenCalled()
  })
})
