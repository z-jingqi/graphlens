import { describe, it, expect } from 'vitest'
import { formatSize } from './format'

describe('formatSize', () => {
  it('returns — for 0', () => {
    expect(formatSize(0)).toBe('—')
  })

  it('returns — for negative number', () => {
    expect(formatSize(-1)).toBe('—')
    expect(formatSize(-1000)).toBe('—')
  })

  it('formats bytes (< 1KB)', () => {
    expect(formatSize(1)).toBe('1 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1023)).toBe('1023 B')
  })

  it('formats exactly 1 KB', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
  })

  it('formats KB values with 1 decimal place', () => {
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(2048)).toBe('2.0 KB')
  })

  it('formats just below 1 MB as KB', () => {
    expect(formatSize(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('formats exactly 1 MB', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
  })

  it('formats larger MB values', () => {
    expect(formatSize(1024 * 1024 * 2.5)).toBe('2.5 MB')
  })
})
