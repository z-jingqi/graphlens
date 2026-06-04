// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearch } from './useSearch'
import type { CapturedRequest } from '../lib/types'

function makeReq(id: string, operationName: string): CapturedRequest {
  return {
    id,
    state: 'finished',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    startedAt: 1000,
    classification: { type: 'graphql', operationType: 'query', operationName },
    hasErrors: false,
    timestamp: 1000,
    duration: 50,
    status: 200,
  }
}

describe('useSearch', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with blank input and empty results', () => {
    const { result } = renderHook(() => useSearch([]))
    expect(result.current.input).toBe('')
    expect(result.current.query).toBe('')
    expect(result.current.results).toEqual([])
  })

  it('debounces input → query by 150ms', async () => {
    vi.useFakeTimers()
    const reqs = [makeReq('r1', 'GetUser')]
    const { result } = renderHook(() => useSearch(reqs))

    act(() => { result.current.setInput('GetUser') })
    // query is not yet updated
    expect(result.current.query).toBe('')

    await act(async () => { vi.advanceTimersByTime(150) })
    expect(result.current.query).toBe('GetUser')
  })

  it('trailing input wins when typed quickly', async () => {
    vi.useFakeTimers()
    const reqs = [makeReq('r1', 'GetUser')]
    const { result } = renderHook(() => useSearch(reqs))

    act(() => { result.current.setInput('Get') })
    act(() => { result.current.setInput('GetUser') })
    await act(async () => { vi.advanceTimersByTime(150) })

    expect(result.current.query).toBe('GetUser')
  })

  it('blank / whitespace query returns empty results', async () => {
    vi.useFakeTimers()
    const reqs = [makeReq('r1', 'GetUser')]
    const { result } = renderHook(() => useSearch(reqs))

    act(() => { result.current.setInput('  ') })
    await act(async () => { vi.advanceTimersByTime(150) })

    expect(result.current.results).toEqual([])
  })

  it('returns search results when query matches', async () => {
    vi.useFakeTimers()
    const reqs = [makeReq('r1', 'GetUser'), makeReq('r2', 'GetProduct')]
    const { result } = renderHook(() => useSearch(reqs))

    act(() => { result.current.setInput('GetUser') })
    await act(async () => { vi.advanceTimersByTime(150) })

    expect(result.current.results.length).toBeGreaterThanOrEqual(1)
    expect(result.current.results[0].requestId).toBe('r1')
  })

  it('results recompute when requests change', async () => {
    vi.useFakeTimers()
    let reqs = [makeReq('r1', 'GetUser')]
    const { result, rerender } = renderHook(() => useSearch(reqs))

    act(() => { result.current.setInput('GetUser') })
    await act(async () => { vi.advanceTimersByTime(150) })
    expect(result.current.results).toHaveLength(1)

    // Add a second request with the same operationName
    reqs = [...reqs, makeReq('r2', 'GetUser')]
    rerender()

    expect(result.current.results).toHaveLength(2)
  })
})
