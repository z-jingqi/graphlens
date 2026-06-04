import { describe, it, expect } from 'vitest'
import { searchRequests } from './engine'
import type { CapturedRequest, CapturedFrame } from '../lib/types'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides?: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: 'req-1',
    state: 'finished',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    startedAt: 1_000,
    classification: { type: 'graphql', operationType: 'query' },
    hasErrors: false,
    timestamp: 1_000,
    duration: 50,
    status: 200,
    ...overrides,
  }
}

function makeFrame(data: string, eventName?: string): CapturedFrame {
  return { direction: 'receive', timestamp: 2_000, data, eventName }
}

// ── blank/whitespace query ────────────────────────────────────────────────────

describe('searchRequests', () => {
  it('returns empty array for blank query', () => {
    expect(searchRequests([makeReq()], '')).toEqual([])
  })

  it('returns empty array for whitespace-only query', () => {
    expect(searchRequests([makeReq()], '   ')).toEqual([])
  })

  it('returns empty array when no request matches', () => {
    const reqs = [makeReq({ classification: { type: 'graphql', operationName: 'GetUser' } })]
    expect(searchRequests(reqs, 'xyz_not_present')).toEqual([])
  })

  // ── location kinds ────────────────────────────────────────────────────────

  it('finds a hit in operationName', () => {
    const reqs = [makeReq({ classification: { type: 'graphql', operationName: 'FindUser' } })]
    const results = searchRequests(reqs, 'FindUser')
    expect(results).toHaveLength(1)
    expect(results[0].hits[0].location.kind).toBe('operationName')
  })

  it('finds a hit in url (falls back to req.url when no har)', () => {
    const reqs = [makeReq({ url: 'https://api.special.com/graphql' })]
    const results = searchRequests(reqs, 'special')
    expect(results[0].hits[0].location.kind).toBe('url')
  })

  it('uses har.request.url over req.url when har is present', () => {
    const reqs = [makeReq({
      url: 'https://old.example.com/graphql',
      har: {
        request: { method: 'POST', url: 'https://api.har-url.com/graphql', headers: [] },
        response: { status: 200, statusText: 'OK', headers: [], content: { mimeType: '', size: 0 } },
        startedDateTime: new Date(1000).toISOString(),
        time: 50,
        getContent: cb => cb('', ''),
      },
    })]
    const results = searchRequests(reqs, 'har-url')
    expect(results).toHaveLength(1)
    expect(results[0].hits[0].location.kind).toBe('url')
  })

  it('finds a hit in query', () => {
    const reqs = [makeReq({
      classification: {
        type: 'graphql',
        query: 'query GetUser($id: ID!) { user(id: $id) { name uniqueField } }',
      },
    })]
    const results = searchRequests(reqs, 'uniqueField')
    expect(results[0].hits.some(h => h.location.kind === 'query')).toBe(true)
  })

  it('finds a hit in variables (stringified)', () => {
    const reqs = [makeReq({
      classification: {
        type: 'graphql',
        variables: { userId: 'special-id-xyz' },
      },
    })]
    const results = searchRequests(reqs, 'special-id-xyz')
    expect(results[0].hits.some(h => h.location.kind === 'variables')).toBe(true)
  })

  it('does not scan variables when they are undefined', () => {
    const reqs = [makeReq({ classification: { type: 'graphql' } })]
    // 'undefined' as a string should not match since variables is not scanned
    const results = searchRequests(reqs, 'undefined')
    expect(results.every(r => r.hits.every(h => h.location.kind !== 'variables'))).toBe(true)
  })

  it('finds a hit in requestBody', () => {
    const reqs = [makeReq({ requestBody: '{"query":"{ uniqueRequestBodyContent }"}' })]
    const results = searchRequests(reqs, 'uniqueRequestBodyContent')
    expect(results[0].hits.some(h => h.location.kind === 'requestBody')).toBe(true)
  })

  it('finds a hit in responseBody', () => {
    const reqs = [makeReq({ responseBody: '{"data":{"uniqueResponseBodyContent":"1"}}' })]
    const results = searchRequests(reqs, 'uniqueResponseBodyContent')
    expect(results[0].hits.some(h => h.location.kind === 'responseBody')).toBe(true)
  })

  it('finds a hit in frames with correct frameIndex and eventName', () => {
    const frames = [
      makeFrame('first-frame-unrelated-data'),
      makeFrame('second-frame-targetContent', 'customEvent'),
    ]
    const reqs = [makeReq({ frames })]
    const results = searchRequests(reqs, 'targetContent')
    const frameHit = results[0].hits.find(h => h.location.kind === 'frame')
    expect(frameHit).toBeDefined()
    if (frameHit?.location.kind === 'frame') {
      expect(frameHit.location.frameIndex).toBe(1)
      expect(frameHit.location.eventName).toBe('customEvent')
    }
  })

  // ── caps ──────────────────────────────────────────────────────────────────

  it('caps hits at MAX_HITS_PER_SOURCE (5) per location', () => {
    // Create a request body with many matches of the same token
    const body = Array.from({ length: 10 }, (_, i) => `hit${i}`).join(' ')
    // Use unique tokens so each gets its own hit
    const reqs = [makeReq({ requestBody: body })]
    const results = searchRequests(reqs, 'hit')
    const requestBodyHits = results[0].hits.filter(h => h.location.kind === 'requestBody')
    expect(requestBodyHits.length).toBeLessThanOrEqual(5)
  })

  it('caps total hits at MAX_TOTAL_HITS (500) and stops scanning', () => {
    // Generate 600 requests, each with 1 hit — should stop at 500
    const reqs = Array.from({ length: 600 }, (_, i) =>
      makeReq({
        id: `req-${i}`,
        classification: { type: 'graphql', operationName: 'hitToken' },
      })
    )
    const results = searchRequests(reqs, 'hitToken')
    const totalHits = results.reduce((sum, r) => sum + r.hits.length, 0)
    expect(totalHits).toBeLessThanOrEqual(500)
    expect(results.length).toBeLessThan(600)
  })

  it('scans at most MAX_FRAME_SCAN (200) frames', () => {
    const frames = Array.from({ length: 300 }, (_, i) =>
      makeFrame(i >= 200 ? 'ONLY_AFTER_200' : `frame-${i}`)
    )
    const reqs = [makeReq({ frames })]
    // Token only appears after frame 200 — should not be found
    const results = searchRequests(reqs, 'ONLY_AFTER_200')
    expect(results).toHaveLength(0)
  })

  // ── snippet ───────────────────────────────────────────────────────────────

  it('attaches a snippet with pre/match/post to each hit', () => {
    const reqs = [makeReq({ classification: { type: 'graphql', operationName: 'GetUserDetails' } })]
    const results = searchRequests(reqs, 'User')
    const hit = results[0].hits[0]
    expect(hit.snippet.match).toContain('User')
    expect(typeof hit.snippet.pre).toBe('string')
    expect(typeof hit.snippet.post).toBe('string')
  })

  // ── multi-request ─────────────────────────────────────────────────────────

  it('returns results for multiple matching requests', () => {
    const reqs = [
      makeReq({ id: 'r1', classification: { type: 'graphql', operationName: 'FindUser' } }),
      makeReq({ id: 'r2', classification: { type: 'graphql', operationName: 'FindProduct' } }),
      makeReq({ id: 'r3', classification: { type: 'graphql', operationName: 'GetOrder' } }),
    ]
    const results = searchRequests(reqs, 'Find')
    expect(results).toHaveLength(2)
    expect(results.map(r => r.requestId)).toContain('r1')
    expect(results.map(r => r.requestId)).toContain('r2')
  })
})
