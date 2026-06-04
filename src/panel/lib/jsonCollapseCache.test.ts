import { describe, it, expect } from 'vitest'
import { getCollapsed, setCollapsed } from './jsonCollapseCache'

// NOTE: jsonCollapseCache uses a module-level Map, so state persists across
// tests within this file. We use unique cacheKey prefixes per test to avoid
// bleed. The MAX_ENTRIES=200 eviction test uses a different key namespace.

const KEY = () => `test-${Math.random().toString(36).slice(2)}`

// ── getCollapsed defaults ─────────────────────────────────────────────────────

describe('getCollapsed — default behaviour', () => {
  it('returns false for depth 0 (not set)', () => {
    expect(getCollapsed(KEY(), 'root', 0)).toBe(false)
  })

  it('returns false for depth 1 (not set)', () => {
    expect(getCollapsed(KEY(), 'root.child', 1)).toBe(false)
  })

  it('returns false for depth 2 (not set)', () => {
    expect(getCollapsed(KEY(), 'root.child.grand', 2)).toBe(false)
  })

  it('returns true for depth 3 (auto-collapsed)', () => {
    expect(getCollapsed(KEY(), 'root.a.b.c', 3)).toBe(true)
  })

  it('returns true for depth 10 (auto-collapsed)', () => {
    expect(getCollapsed(KEY(), 'deep', 10)).toBe(true)
  })
})

// ── setCollapsed + getCollapsed round-trip ────────────────────────────────────

describe('setCollapsed / getCollapsed', () => {
  it('stored true is returned', () => {
    const k = KEY()
    setCollapsed(k, 'root', true)
    expect(getCollapsed(k, 'root', 0)).toBe(true)
  })

  it('stored false overrides the depth>2 default', () => {
    const k = KEY()
    setCollapsed(k, 'deep.path', false)
    expect(getCollapsed(k, 'deep.path', 5)).toBe(false)
  })

  it('multiple paths under one key are independent', () => {
    const k = KEY()
    setCollapsed(k, 'a', true)
    setCollapsed(k, 'b', false)
    expect(getCollapsed(k, 'a', 0)).toBe(true)
    expect(getCollapsed(k, 'b', 0)).toBe(false)
  })

  it('different cacheKeys are independent', () => {
    const k1 = KEY()
    const k2 = KEY()
    setCollapsed(k1, 'path', true)
    // k2 was never set — should return depth default
    expect(getCollapsed(k2, 'path', 0)).toBe(false)
  })

  it('overwriting a value works', () => {
    const k = KEY()
    setCollapsed(k, 'root', false)
    setCollapsed(k, 'root', true)
    expect(getCollapsed(k, 'root', 0)).toBe(true)
  })
})

// ── LRU eviction at MAX_ENTRIES ───────────────────────────────────────────────

describe('setCollapsed — LRU eviction', () => {
  it('evicts the oldest cache entry when limit (200) is exceeded', () => {
    // Use a unique first key we can check
    const firstKey = `eviction-first-${KEY()}`
    setCollapsed(firstKey, 'path', true)

    // Add 200 more unique keys to push the cache to its limit and trigger eviction
    for (let i = 0; i < 200; i++) {
      setCollapsed(`eviction-fill-${i}-${KEY()}`, 'path', true)
    }

    // The first key should have been evicted (defaults kick back in)
    expect(getCollapsed(firstKey, 'path', 0)).toBe(false)
  })
})
