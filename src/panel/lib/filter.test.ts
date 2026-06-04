import { describe, it, expect } from 'vitest'
import { applyFilter, DEFAULT_FILTER } from './filter'
import type { CapturedRequest, FilterState } from './types'

// ── helpers ───────────────────────────────────────────────────────────────────

function graphqlReq(overrides?: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: 'r1',
    state: 'finished',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    startedAt: 1000,
    classification: {
      type: 'graphql',
      operationType: 'query',
      operationName: 'GetUser',
    },
    hasErrors: false,
    timestamp: 1000,
    duration: 50,
    status: 200,
    ...overrides,
  }
}

function filter(partial: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_FILTER, ...partial }
}

// ── DEFAULT_FILTER ────────────────────────────────────────────────────────────

describe('DEFAULT_FILTER', () => {
  it('has empty search and empty sets', () => {
    expect(DEFAULT_FILTER.search).toBe('')
    expect(DEFAULT_FILTER.invertSearch).toBe(false)
    expect(DEFAULT_FILTER.opTypes.size).toBe(0)
    expect(DEFAULT_FILTER.requestTypes.size).toBe(0)
  })
})

// ── applyFilter ───────────────────────────────────────────────────────────────

describe('applyFilter', () => {
  it('returns all requests when filter is empty', () => {
    const reqs = [graphqlReq({ id: 'r1' }), graphqlReq({ id: 'r2' })]
    expect(applyFilter(reqs, DEFAULT_FILTER)).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(applyFilter([], DEFAULT_FILTER)).toEqual([])
  })

  // ── requestTypes ───────────────────────────────────────────────────────────

  it('filters by requestType — keeps graphql when set contains graphql', () => {
    const reqs = [
      graphqlReq({ id: 'gql', classification: { type: 'graphql' } }),
      graphqlReq({ id: 'ws', classification: { type: 'websocket' }, transport: 'websocket' }),
    ]
    const result = applyFilter(reqs, filter({ requestTypes: new Set(['graphql']) }))
    expect(result.map(r => r.id)).toEqual(['gql'])
  })

  it('uses transport field when present for requestType matching', () => {
    // A graphql-over-SSE row has classification.type='graphql' but transport='sse'
    const sse = graphqlReq({
      id: 'sse',
      classification: { type: 'graphql' },
      transport: 'sse',
    })
    const http = graphqlReq({ id: 'http' })

    // Filter for sse should keep sse (transport) not http (no transport → classification.type)
    const result = applyFilter([sse, http], filter({ requestTypes: new Set(['sse']) }))
    expect(result.map(r => r.id)).toEqual(['sse'])
  })

  it('keeps websocket rows when requestTypes includes websocket', () => {
    const ws = graphqlReq({ id: 'ws', classification: { type: 'websocket' }, transport: 'websocket' })
    const http = graphqlReq({ id: 'http' })
    const result = applyFilter([ws, http], filter({ requestTypes: new Set(['websocket']) }))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ws')
  })

  // ── opTypes ────────────────────────────────────────────────────────────────

  it('excludes non-graphql rows entirely when opTypes is set', () => {
    const ws = graphqlReq({ id: 'ws', classification: { type: 'websocket' } })
    const gql = graphqlReq({ id: 'gql', classification: { type: 'graphql', operationType: 'query' } })
    const result = applyFilter([ws, gql], filter({ opTypes: new Set(['query']) }))
    expect(result.map(r => r.id)).toEqual(['gql'])
  })

  it('excludes graphql rows whose operationType is not in the set', () => {
    const query = graphqlReq({ id: 'q', classification: { type: 'graphql', operationType: 'query' } })
    const mutation = graphqlReq({ id: 'm', classification: { type: 'graphql', operationType: 'mutation' } })
    const result = applyFilter([query, mutation], filter({ opTypes: new Set(['mutation']) }))
    expect(result.map(r => r.id)).toEqual(['m'])
  })

  it('excludes graphql rows with no operationType when opTypes is set', () => {
    const noType = graphqlReq({ id: 'n', classification: { type: 'graphql' } })
    const result = applyFilter([noType], filter({ opTypes: new Set(['query']) }))
    expect(result).toHaveLength(0)
  })

  // ── text search ────────────────────────────────────────────────────────────

  it('matches graphql by operationName (substring, case-insensitive)', () => {
    const reqs = [
      graphqlReq({ id: 'u', classification: { type: 'graphql', operationName: 'GetUser' } }),
      graphqlReq({ id: 'p', classification: { type: 'graphql', operationName: 'GetProduct' } }),
    ]
    const result = applyFilter(reqs, filter({ search: 'user' }))
    expect(result.map(r => r.id)).toEqual(['u'])
  })

  it('matches non-graphql by URL', () => {
    const ws = graphqlReq({
      id: 'ws',
      url: 'wss://api.example.com/ws',
      classification: { type: 'websocket' },
    })
    const result = applyFilter([ws], filter({ search: 'example' }))
    expect(result).toHaveLength(1)
  })

  it('uses har.request.url over req.url for non-graphql match', () => {
    const req = graphqlReq({
      id: 'r',
      url: 'wss://old.example.com/ws',
      classification: { type: 'websocket' },
      har: {
        request: {
          method: 'GET',
          url: 'wss://api.example.com/ws',
          headers: [],
        },
        response: { status: 101, statusText: 'Switching Protocols', headers: [], content: { mimeType: '', size: 0 } },
        startedDateTime: new Date(1000).toISOString(),
        time: 10,
        getContent: cb => cb('', ''),
      },
    })
    const result = applyFilter([req], filter({ search: 'api.example.com' }))
    expect(result).toHaveLength(1)
  })

  it('supports /regex/flags syntax for search', () => {
    const reqs = [
      graphqlReq({ id: 'u', classification: { type: 'graphql', operationName: 'GetUser' } }),
      graphqlReq({ id: 'p', classification: { type: 'graphql', operationName: 'GetProduct' } }),
    ]
    const result = applyFilter(reqs, filter({ search: '/get(user|product)/i' }))
    expect(result).toHaveLength(2)
  })

  it('falls back to substring when regex pattern is invalid', () => {
    // Invalid regex — should not throw, falls back to substring
    const reqs = [
      graphqlReq({ id: 'u', classification: { type: 'graphql', operationName: 'GetUser' } }),
    ]
    expect(() => applyFilter(reqs, filter({ search: '/([/' }))).not.toThrow()
  })

  // ── invertSearch ───────────────────────────────────────────────────────────

  it('invertSearch keeps only non-matching rows', () => {
    const reqs = [
      graphqlReq({ id: 'u', classification: { type: 'graphql', operationName: 'GetUser' } }),
      graphqlReq({ id: 'p', classification: { type: 'graphql', operationName: 'GetProduct' } }),
    ]
    const result = applyFilter(reqs, filter({ search: 'user', invertSearch: true }))
    expect(result.map(r => r.id)).toEqual(['p'])
  })

  it('invertSearch with empty search passes all rows', () => {
    const reqs = [graphqlReq({ id: 'u' })]
    const result = applyFilter(reqs, filter({ search: '', invertSearch: true }))
    expect(result).toHaveLength(1)
  })

  // ── combined filters ───────────────────────────────────────────────────────

  it('combined requestTypes + opTypes + search all apply', () => {
    const reqs = [
      graphqlReq({ id: 'q', classification: { type: 'graphql', operationType: 'query', operationName: 'GetUser' } }),
      graphqlReq({ id: 'm', classification: { type: 'graphql', operationType: 'mutation', operationName: 'CreateUser' } }),
      graphqlReq({ id: 'w', classification: { type: 'websocket' }, transport: 'websocket' }),
    ]
    const result = applyFilter(reqs, {
      requestTypes: new Set(['graphql']),
      opTypes: new Set(['query']),
      search: 'user',
      invertSearch: false,
    })
    expect(result.map(r => r.id)).toEqual(['q'])
  })
})
