import { describe, it, expect } from 'vitest'
import { makeSnippet } from './highlight'

describe('makeSnippet', () => {
  it('returns pre/match/post for a mid-string match with both ellipses', () => {
    // Place 'fox' in the middle of text longer than 2*ctx chars on each side
    const text = 'a'.repeat(50) + 'fox' + 'b'.repeat(50)
    const start = 50
    const end = 53
    const result = makeSnippet(text, start, end)
    expect(result.match).toBe('fox')
    // 50 > ctx(30), so both sides are truncated
    expect(result.pre).toMatch(/^…/)
    expect(result.post).toMatch(/…$/)
  })

  it('no leading ellipsis when match is within ctx chars of start', () => {
    const text = 'short match here'
    const result = makeSnippet(text, 6, 11) // 'match'
    expect(result.match).toBe('match')
    expect(result.pre).not.toContain('…')
  })

  it('no trailing ellipsis when match is within ctx chars of end', () => {
    const text = 'hello and match'
    const result = makeSnippet(text, 10, 15) // 'match'
    expect(result.match).toBe('match')
    expect(result.post).not.toContain('…')
  })

  it('match at the very start — no pre, no leading ellipsis', () => {
    const text = 'hello world'
    const result = makeSnippet(text, 0, 5)
    expect(result.match).toBe('hello')
    expect(result.pre).toBe('')
  })

  it('match at the very end — no post, no trailing ellipsis', () => {
    const text = 'hello world'
    const result = makeSnippet(text, 6, 11)
    expect(result.match).toBe('world')
    expect(result.post).toBe('')
  })

  it('respects custom ctx window', () => {
    const text = 'abcdefghij_MATCH_abcdefghij'
    const start = text.indexOf('_MATCH_') + 1  // 'MATCH'
    const end = start + 5
    const small = makeSnippet(text, start, end, 3)
    const large = makeSnippet(text, start, end, 100)
    expect(small.pre.length).toBeLessThan(large.pre.length + 2) // small has less context
    expect(large.pre).not.toContain('…') // 100-char window covers the whole text
  })

  it('match longer than ctx on both sides gets ellipses on both sides', () => {
    // 50 chars before and after the match
    const text = 'a'.repeat(50) + 'MATCH' + 'b'.repeat(50)
    const start = 50
    const end = 55
    const result = makeSnippet(text, start, end, 10)
    expect(result.pre).toMatch(/^…/)
    expect(result.post).toMatch(/…$/)
    expect(result.match).toBe('MATCH')
  })

  it('default ctx is 30 chars', () => {
    const text = 'a'.repeat(40) + 'X' + 'b'.repeat(40)
    const result = makeSnippet(text, 40, 41) // match 'X'
    expect(result.pre).toMatch(/^…/)
    expect(result.pre.replace('…', '').length).toBe(30)
    expect(result.post).toMatch(/…$/)
    expect(result.post.replace('…', '').length).toBe(30)
  })
})
