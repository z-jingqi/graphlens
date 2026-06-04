import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings'

// ── helpers: stub localStorage ────────────────────────────────────────────────

function makeStorage() {
  const store: Record<string, string> = {}
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v }),
    removeItem: vi.fn((k: string) => { delete store[k] }),
    clear: vi.fn(() => { for (const k in store) delete store[k] }),
    key: vi.fn(),
    get length() { return Object.keys(store).length },
    _store: store,
  }
}

let storage: ReturnType<typeof makeStorage>

beforeEach(() => {
  storage = makeStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── loadSettings ──────────────────────────────────────────────────────────────

describe('loadSettings', () => {
  it('returns DEFAULT_SETTINGS when localStorage has no entry', () => {
    const result = loadSettings()
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('merges a partial stored object over defaults', () => {
    storage._store['graphlens-settings'] = JSON.stringify({ clearOnRefresh: false })
    const result = loadSettings()
    expect(result.clearOnRefresh).toBe(false)
    // Other defaults still present
    expect(result.requestListWidth).toBe(DEFAULT_SETTINGS.requestListWidth)
  })

  it('deep-merges columnWidths', () => {
    storage._store['graphlens-settings'] = JSON.stringify({
      columnWidths: { name: 999 },
    })
    const result = loadSettings()
    expect(result.columnWidths.name).toBe(999)
    // Defaults for other columns intact
    expect(result.columnWidths.status).toBe(DEFAULT_SETTINGS.columnWidths.status)
    expect(result.columnWidths.size).toBe(DEFAULT_SETTINGS.columnWidths.size)
  })

  it('returns defaults when localStorage contains invalid JSON', () => {
    storage._store['graphlens-settings'] = 'not-json'
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults when localStorage.getItem throws', () => {
    storage.getItem.mockImplementation(() => { throw new Error('storage error') })
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

// ── saveSettings ──────────────────────────────────────────────────────────────

describe('saveSettings', () => {
  it('serialises and stores the settings', () => {
    saveSettings({ ...DEFAULT_SETTINGS, clearOnRefresh: false })
    expect(storage.setItem).toHaveBeenCalledWith(
      'graphlens-settings',
      expect.stringContaining('"clearOnRefresh":false')
    )
  })

  it('does not throw when localStorage.setItem throws', () => {
    storage.setItem.mockImplementation(() => { throw new Error('quota exceeded') })
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow()
  })
})
