import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Minimal chrome stub for background.ts ─────────────────────────────────────

interface FakePort {
  name: string
  postMessage: ReturnType<typeof vi.fn>
  onDisconnect: { addListener: (fn: () => void) => void }
  disconnect: () => void
}

interface FakeSender {
  tab?: { id?: number }
}

function setupBackground() {
  const connectListeners: ((port: FakePort) => void)[] = []
  const messageListeners: ((msg: unknown, sender: FakeSender) => void)[] = []

  const chrome = {
    runtime: {
      onConnect: {
        addListener: (fn: (port: FakePort) => void) => connectListeners.push(fn),
      },
      onMessage: {
        addListener: (fn: (msg: unknown, sender: FakeSender) => void) =>
          messageListeners.push(fn),
      },
    },
  }

  ;(globalThis as Record<string, unknown>).chrome = chrome

  // Re-run background module fresh
  vi.resetModules()

  return {
    fireConnect: (port: FakePort) => connectListeners.forEach(fn => fn(port)),
    fireMessage: (msg: unknown, sender: FakeSender) =>
      messageListeners.forEach(fn => fn(msg, sender)),
    chrome,
  }
}

function makePort(name: string): FakePort {
  const dcListeners: (() => void)[] = []
  return {
    name,
    postMessage: vi.fn(),
    onDisconnect: {
      addListener: fn => dcListeners.push(fn),
    },
    disconnect: () => dcListeners.forEach(fn => fn()),
  }
}

describe('background.ts', () => {
  let ctx: ReturnType<typeof setupBackground>

  beforeEach(async () => {
    ctx = setupBackground()
    await import('./background.ts')
  })

  it('routes a message to the panel port matching the sender tab id', async () => {
    const panel = makePort('panel:5')
    ctx.fireConnect(panel)

    const msg = { source: 'graphlens-patch', kind: 'started', id: 'r1' }
    ctx.fireMessage(msg, { tab: { id: 5 } })

    expect(panel.postMessage).toHaveBeenCalledWith(msg)
  })

  it('does not route a message when no panel is connected for that tab', () => {
    const panel = makePort('panel:99')
    ctx.fireConnect(panel)

    const msg = { source: 'graphlens-patch', kind: 'started' }
    // Fire from tab 42, but panel is connected for tab 99
    ctx.fireMessage(msg, { tab: { id: 42 } })

    expect(panel.postMessage).not.toHaveBeenCalled()
  })

  it('does not route when sender has no tab', () => {
    const panel = makePort('panel:5')
    ctx.fireConnect(panel)

    ctx.fireMessage({ kind: 'test' }, {})
    expect(panel.postMessage).not.toHaveBeenCalled()
  })

  it('removes a panel from routing after it disconnects', async () => {
    const panel = makePort('panel:7')
    ctx.fireConnect(panel)

    panel.disconnect()

    ctx.fireMessage({ source: 'graphlens-patch' }, { tab: { id: 7 } })
    expect(panel.postMessage).not.toHaveBeenCalled()
  })

  it('routes only to the most recently connected panel for a given tab', async () => {
    const panelOld = makePort('panel:3')
    const panelNew = makePort('panel:3')

    ctx.fireConnect(panelOld)
    ctx.fireConnect(panelNew) // overwrites panelOld for tab 3

    ctx.fireMessage({ kind: 'test' }, { tab: { id: 3 } })

    expect(panelNew.postMessage).toHaveBeenCalled()
    expect(panelOld.postMessage).not.toHaveBeenCalled()
  })

  it('ignores connections with port names that do not match panel:<tabId>', () => {
    const otherPort = makePort('other:port')
    ctx.fireConnect(otherPort)

    // Even if we fire from tab undefined, it should not route to otherPort
    ctx.fireMessage({ kind: 'test' }, { tab: { id: 0 } })
    expect(otherPort.postMessage).not.toHaveBeenCalled()
  })

  it('does not throw if postMessage throws (port disconnected during send)', () => {
    const panel = makePort('panel:8')
    panel.postMessage.mockImplementation(() => { throw new Error('port closed') })
    ctx.fireConnect(panel)

    expect(() =>
      ctx.fireMessage({ source: 'graphlens-patch' }, { tab: { id: 8 } })
    ).not.toThrow()
  })
})
