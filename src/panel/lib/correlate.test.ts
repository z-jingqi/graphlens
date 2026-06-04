import { describe, it, expect } from 'vitest'
import { findPendingMatch } from './correlate'
import type { CapturedRequest, HarEntry } from './types'

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_MS = 1_000_000 // 1000 seconds since epoch

function makeRecord(overrides?: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: 'r1',
    state: 'pending',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    startedAt: BASE_MS,
    classification: { type: 'graphql', operationType: 'query' },
    hasErrors: false,
    timestamp: BASE_MS,
    duration: 0,
    status: 0,
    ...overrides,
  }
}

function makeHar(overrides?: {
  url?: string
  method?: string
  startedMs?: number
  resourceType?: string
}): HarEntry {
  const {
    url = 'https://api.example.com/graphql',
    method = 'POST',
    startedMs = BASE_MS,
    resourceType,
  } = overrides ?? {}
  return {
    request: { method, url, headers: [] },
    response: {
      status: 200,
      statusText: 'OK',
      headers: [],
      content: { mimeType: 'application/json', size: 42 },
    },
    startedDateTime: new Date(startedMs).toISOString(),
    time: 50,
    _resourceType: resourceType,
    getContent: cb => cb('', ''),
  }
}

// ── findPendingMatch ──────────────────────────────────────────────────────────

describe('findPendingMatch', () => {
  it('matches a record with the same URL, method, and time', () => {
    const record = makeRecord()
    const har = makeHar()
    expect(findPendingMatch([record], har)).toBe(record)
  })

  it('returns undefined for empty records', () => {
    expect(findPendingMatch([], makeHar())).toBeUndefined()
  })

  it('returns the earliest-startedAt match among multiple candidates', () => {
    const older = makeRecord({ id: 'older', startedAt: BASE_MS - 100 })
    const newer = makeRecord({ id: 'newer', startedAt: BASE_MS + 100 })
    const har = makeHar()
    expect(findPendingMatch([newer, older], har)).toBe(older)
  })

  it('skips records that already have a .har', () => {
    const record = makeRecord({
      har: makeHar(),
    })
    expect(findPendingMatch([record], makeHar())).toBeUndefined()
  })

  it('skips EventSource-SSE records (transport=sse, classification.type=websocket)', () => {
    // EventSource SSE: transport='sse' AND classification.type !== 'graphql'
    const evtSrc = makeRecord({
      transport: 'sse',
      classification: { type: 'websocket' },
    })
    expect(findPendingMatch([evtSrc], makeHar())).toBeUndefined()
  })

  it('does NOT skip fetch-SSE records (transport=sse, classification.type=graphql)', () => {
    const fetchSse = makeRecord({
      transport: 'sse',
      classification: { type: 'graphql' },
    })
    expect(findPendingMatch([fetchSse], makeHar())).toBe(fetchSse)
  })

  it('skips records with URL mismatch', () => {
    const record = makeRecord({ url: 'https://other.example.com/graphql' })
    expect(findPendingMatch([record], makeHar())).toBeUndefined()
  })

  it('skips records with method mismatch for non-WS HAR', () => {
    const record = makeRecord({ method: 'GET' })
    expect(findPendingMatch([record], makeHar({ method: 'POST' }))).toBeUndefined()
  })

  it('is case-insensitive for method matching', () => {
    const record = makeRecord({ method: 'post' })
    const har = makeHar({ method: 'POST' })
    expect(findPendingMatch([record], har)).toBe(record)
  })

  it('matches WS handshake: HAR resourceType=websocket + record transport=websocket, skips method check', () => {
    // Patch emits method='WS', HAR shows method='GET' for WS handshake
    const wsRecord = makeRecord({ method: 'WS', transport: 'websocket' })
    const wsHar = makeHar({ method: 'GET', resourceType: 'websocket' })
    expect(findPendingMatch([wsRecord], wsHar)).toBe(wsRecord)
  })

  it('does NOT match non-websocket record against a WS HAR', () => {
    const httpRecord = makeRecord({ method: 'POST' }) // no transport
    const wsHar = makeHar({ method: 'GET', resourceType: 'websocket' })
    expect(findPendingMatch([httpRecord], wsHar)).toBeUndefined()
  })

  it('matches when time difference is just inside the 2000ms window', () => {
    const record = makeRecord({ startedAt: BASE_MS - 1999 })
    const har = makeHar({ startedMs: BASE_MS })
    expect(findPendingMatch([record], har)).toBe(record)
  })

  it('does NOT match when time difference exceeds 2000ms', () => {
    const record = makeRecord({ startedAt: BASE_MS - 2001 })
    const har = makeHar({ startedMs: BASE_MS })
    expect(findPendingMatch([record], har)).toBeUndefined()
  })

  it('matches across a positive time difference', () => {
    const record = makeRecord({ startedAt: BASE_MS + 1999 })
    const har = makeHar({ startedMs: BASE_MS })
    expect(findPendingMatch([record], har)).toBe(record)
  })
})
