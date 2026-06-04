import { vi } from 'vitest'

// ── Fake Port ─────────────────────────────────────────────────────────────────

export interface FakePort {
  name: string
  onMessage: {
    addListener: (fn: (msg: unknown) => void) => void
    removeListener: (fn: (msg: unknown) => void) => void
  }
  onDisconnect: {
    addListener: (fn: () => void) => void
    removeListener: (fn: () => void) => void
  }
  postMessage: ReturnType<typeof vi.fn>
  disconnect: () => void
  /** Test helper: push a message to every registered onMessage listener */
  emit: (msg: unknown) => void
  /** Test helper: fire every onDisconnect listener (simulates port closure) */
  triggerDisconnect: () => void
}

function createFakePort(name: string): FakePort {
  const msgListeners: ((msg: unknown) => void)[] = []
  const dcListeners: (() => void)[] = []

  return {
    name,
    onMessage: {
      addListener: fn => msgListeners.push(fn),
      removeListener: fn => {
        const i = msgListeners.indexOf(fn)
        if (i >= 0) msgListeners.splice(i, 1)
      },
    },
    onDisconnect: {
      addListener: fn => dcListeners.push(fn),
      removeListener: fn => {
        const i = dcListeners.indexOf(fn)
        if (i >= 0) dcListeners.splice(i, 1)
      },
    },
    postMessage: vi.fn(),
    disconnect: () => dcListeners.forEach(fn => fn()),
    emit: msg => msgListeners.forEach(fn => fn(msg)),
    triggerDisconnect: () => dcListeners.forEach(fn => fn()),
  }
}

// ── Chrome stub ───────────────────────────────────────────────────────────────

export interface ChromeStub {
  /** The stub to assign to globalThis.chrome */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chrome: any
  /** Returns the last port connected with the given name */
  getPort: (name: string) => FakePort | undefined
  /** Fire onRequestFinished listeners */
  emitRequest: (entry: unknown) => void
  /** Fire onNavigated listeners */
  emitNavigation: () => void
  /** Preset HAR entries returned by getHAR() */
  setHarEntries: (entries: unknown[]) => void
}

export function createChromeStub(): ChromeStub {
  const ports = new Map<string, FakePort>()
  let reqListeners: ((e: unknown) => void)[] = []
  let navListeners: (() => void)[] = []
  let harEntries: unknown[] = []

  const chrome = {
    devtools: {
      inspectedWindow: { tabId: 1 },
      network: {
        onRequestFinished: {
          addListener: (fn: (e: unknown) => void) => reqListeners.push(fn),
          removeListener: (fn: (e: unknown) => void) => {
            reqListeners = reqListeners.filter(l => l !== fn)
          },
        },
        onNavigated: {
          addListener: (fn: () => void) => navListeners.push(fn),
          removeListener: (fn: () => void) => {
            navListeners = navListeners.filter(l => l !== fn)
          },
        },
        getHAR: (cb: (log: { entries: unknown[] }) => void) =>
          cb({ entries: harEntries }),
      },
    },
    runtime: {
      connect: ({ name }: { name: string }) => {
        const port = createFakePort(name)
        ports.set(name, port)
        return port
      },
    },
  }

  return {
    chrome,
    getPort: name => ports.get(name),
    emitRequest: entry => reqListeners.forEach(fn => fn(entry)),
    emitNavigation: () => navListeners.forEach(fn => fn()),
    setHarEntries: entries => { harEntries = entries },
  }
}
