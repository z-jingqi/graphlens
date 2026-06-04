import { describe, it, expect } from 'vitest'
import { findMatches, splitHighlight, dataContains } from './match'

// ── findMatches ───────────────────────────────────────────────────────────────

describe('findMatches', () => {
  it('returns empty array for empty text', () => {
    expect(findMatches('', 'hello')).toEqual([])
  })

  it('returns empty array for empty query', () => {
    expect(findMatches('hello world', '')).toEqual([])
  })

  it('finds a single substring match', () => {
    expect(findMatches('hello world', 'world')).toEqual([{ start: 6, end: 11 }])
  })

  it('finds multiple non-overlapping substring matches', () => {
    expect(findMatches('abcabc', 'abc')).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
    ])
  })

  it('is case-insensitive for substring', () => {
    expect(findMatches('Hello World', 'hello')).toEqual([{ start: 0, end: 5 }])
  })

  it('finds match at the very start', () => {
    expect(findMatches('hello', 'hel')).toEqual([{ start: 0, end: 3 }])
  })

  it('finds match at the very end', () => {
    expect(findMatches('say hello', 'hello')).toEqual([{ start: 4, end: 9 }])
  })

  // ── regex mode ─────────────────────────────────────────────────────────────

  it('handles /pattern/ regex syntax', () => {
    const result = findMatches('GetUser GetProduct', '/get(user|product)/i')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ start: 0, end: 7 })
    expect(result[1]).toEqual({ start: 8, end: 18 })
  })

  it('automatically adds g flag to regex', () => {
    const result = findMatches('aaa', '/a/')
    expect(result).toHaveLength(3)
  })

  it('respects flags in regex pattern', () => {
    // Case-sensitive (no i flag)
    const cs = findMatches('Hello HELLO', '/hello/')
    expect(cs).toHaveLength(0)

    const ci = findMatches('Hello HELLO', '/hello/i')
    expect(ci).toHaveLength(2)
  })

  it('does not infinite-loop on zero-length regex match', () => {
    // /a*/ can match empty string — must not loop forever
    const result = findMatches('abc', '/a*/')
    expect(Array.isArray(result)).toBe(true)
    // The guard breaks after the first zero-width match
    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('falls back to substring for invalid regex', () => {
    // /([/ is an invalid regex pattern
    const result = findMatches('hello world', '/([/')
    // Falls back to substring search for the literal '/([/'
    // which won't be found in 'hello world'
    expect(result).toEqual([])
  })
})

// ── splitHighlight ────────────────────────────────────────────────────────────

describe('splitHighlight', () => {
  it('returns a single non-match segment when no match found', () => {
    const result = splitHighlight('hello world', 'xyz')
    expect(result).toEqual([{ text: 'hello world', match: false }])
  })

  it('wraps a mid-string match with surrounding non-match segments', () => {
    const result = splitHighlight('say hello there', 'hello')
    expect(result).toEqual([
      { text: 'say ', match: false },
      { text: 'hello', match: true },
      { text: ' there', match: false },
    ])
  })

  it('handles a match at the start (no leading non-match)', () => {
    const result = splitHighlight('hello world', 'hello')
    expect(result).toEqual([
      { text: 'hello', match: true },
      { text: ' world', match: false },
    ])
  })

  it('handles a match at the end (no trailing non-match)', () => {
    const result = splitHighlight('say hello', 'hello')
    expect(result).toEqual([
      { text: 'say ', match: false },
      { text: 'hello', match: true },
    ])
  })

  it('handles a full-string match', () => {
    const result = splitHighlight('hello', 'hello')
    expect(result).toEqual([{ text: 'hello', match: true }])
  })

  it('handles multiple adjacent matches', () => {
    const result = splitHighlight('abab', 'ab')
    expect(result).toEqual([
      { text: 'ab', match: true },
      { text: 'ab', match: true },
    ])
  })
})

// ── dataContains ──────────────────────────────────────────────────────────────

describe('dataContains', () => {
  it('returns false for empty query', () => {
    expect(dataContains({ user: { id: '1' } }, '')).toBe(false)
  })

  it('detects a top-level key in an object', () => {
    expect(dataContains({ user: { id: '1' } }, 'user')).toBe(true)
  })

  it('detects a nested value', () => {
    expect(dataContains({ user: { id: 'abc123' } }, 'abc123')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(dataContains({ name: 'Alice' }, 'alice')).toBe(true)
  })

  it('returns false when no match', () => {
    expect(dataContains({ user: { id: '1' } }, 'xyz')).toBe(false)
  })

  it('returns false for unstringifiable data (circular)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const circular: any = {}
    circular.self = circular
    expect(dataContains(circular, 'self')).toBe(false)
  })

  it('works on primitive string', () => {
    expect(dataContains('hello world', 'hello')).toBe(true)
  })

  it('works on a number', () => {
    expect(dataContains(42, '42')).toBe(true)
  })
})
