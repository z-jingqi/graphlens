// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useNetworkCapture } from './useNetworkCapture'
import { createChromeStub } from '../../../test/chrome-stub'
import { makeHar } from '../../../test/fixtures'
import type { FakePort } from '../../../test/chrome-stub'

// ── helpers ───────────────────────────────────────────────────────────────────

function patchMsg(kind: string, extra: Record<string, unknown>) {
  return { source: 'graphlens-patch', kind, ...extra }
}

function startedHttp(id: string, url = 'https://api.example.com/graphql', body = '{"query":"query GetUser { user { id } }"}') {
  return patchMsg('started', { id, url, method: 'POST', startedAt: 1000, body })
}

function startedWs(id: string, protocols: string[] = []) {
  return patchMsg('started', {
    id,
    url: 'wss://api.example.com/ws',
    method: 'WS',
    startedAt: 1000,
    transport: 'websocket',
    protocols,
  })
}

function completedMsg(id: string, status: number, durationMs = 50) {
  return patchMsg('completed', { id, status, durationMs })
}

function graphqlWsSubscribe(id: string, opId = '1') {
  return patchMsg('frame', {
    id,
    direction: 'send',
    data: JSON.stringify({
      type: 'subscribe',
      id: opId,
      payload: { query: 'subscription OnUser { userUpdated { id } }' },
    }),
    timestamp: 2000,
  })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useNetworkCapture', () => {
  let stub: ReturnType<typeof createChromeStub>
  let port: FakePort

  beforeEach(() => {
    stub = createChromeStub()
    // Set chrome globally BEFORE rendering; DON'T delete in afterEach
    // (cleanup() must run while chrome is still available so effect teardown succeeds)
    ;(globalThis as Record<string, unknown>).chrome = stub.chrome
  })

  afterEach(async () => {
    // Explicitly unmount React components FIRST (while chrome is still defined)
    // so that effect teardown (removeListener calls) succeed.
    await cleanup()
    vi.restoreAllMocks()
    // Only now it's safe to clear chrome
    delete (globalThis as Record<string, unknown>).chrome
  })

  it('exposes an empty requests array on mount', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    await waitFor(() => {}, { timeout: 50 })
    expect(result.current.requests).toEqual([])
  })

  it('connects to the background port named panel:1', async () => {
    renderHook(() => useNetworkCapture(false, true))
    await waitFor(() => expect(stub.getPort('panel:1')).toBeDefined())
    port = stub.getPort('panel:1')!
    expect(port).toBeDefined()
  })

  // ── HTTP graphql request lifecycle ────────────────────────────────────────

  it('creates a pending row when a graphql started message arrives', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => {
      port.emit(startedHttp('req-1'))
    })

    expect(result.current.requests).toHaveLength(1)
    expect(result.current.requests[0].id).toBe('req-1')
    expect(result.current.requests[0].state).toBe('pending')
    expect(result.current.requests[0].classification.type).toBe('graphql')
  })

  it('transitions to finished when completed arrives', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('req-1')) })
    await act(async () => { port.emit(completedMsg('req-1', 200, 75)) })

    await waitFor(() => expect(result.current.requests[0].state).toBe('finished'))
    expect(result.current.requests[0].status).toBe(200)
    expect(result.current.requests[0].duration).toBe(75)
  })

  it('drops non-graphql HTTP started messages', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => {
      port.emit(patchMsg('started', {
        id: 'req-plain',
        url: 'https://api.example.com/rest/users',
        method: 'GET',
        startedAt: 1000,
        body: undefined,
      }))
    })

    expect(result.current.requests).toHaveLength(0)
  })

  // ── WebSocket gating ──────────────────────────────────────────────────────

  it('shows WS row immediately when graphql subprotocol is negotiated', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedWs('ws-1', ['graphql-transport-ws'])) })

    expect(result.current.requests).toHaveLength(1)
    expect(result.current.requests[0].state).toBe('pending')
    expect(result.current.requests[0].transport).toBe('websocket')
  })

  it('transitions WS to open on status 101', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedWs('ws-1', ['graphql-transport-ws'])) })
    await act(async () => { port.emit(completedMsg('ws-1', 101)) })

    await waitFor(() => expect(result.current.requests[0].state).toBe('open'))
  })

  it('buffers WS without graphql subprotocol until a subscribe frame', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedWs('ws-2', [])) })

    // Not visible yet
    expect(result.current.requests).toHaveLength(0)

    await act(async () => { port.emit(graphqlWsSubscribe('ws-2')) })

    // Now promoted
    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    expect(result.current.requests[0].id).toBe('ws-2')
    expect(result.current.requests[0].state).toBe('open')
  })

  it('drops plain WS that disconnects before any graphql frame', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedWs('ws-plain', [])) })
    await act(async () => {
      port.emit(patchMsg('disconnected', { id: 'ws-plain', durationMs: 100 }))
    })

    expect(result.current.requests).toHaveLength(0)
  })

  // ── SSE gating ────────────────────────────────────────────────────────────

  it('buffers EventSource SSE until a graphql frame', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => {
      port.emit(patchMsg('started', {
        id: 'sse-1',
        url: 'https://api.example.com/events',
        method: 'GET',
        startedAt: 1000,
        transport: 'sse',
      }))
    })
    expect(result.current.requests).toHaveLength(0)

    await act(async () => {
      port.emit(patchMsg('frame', {
        id: 'sse-1',
        direction: 'receive',
        data: '{"query":"subscription OnData { data { id } }"}',
        timestamp: 2000,
      }))
    })

    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    expect(result.current.requests[0].state).toBe('open')
  })

  // ── fetch-SSE ─────────────────────────────────────────────────────────────

  it('upgrades fetch row transport to sse on sse-start', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('sse-2')) })
    await act(async () => { port.emit(patchMsg('sse-start', { id: 'sse-2' })) })

    await waitFor(() => expect(result.current.requests[0].transport).toBe('sse'))
  })

  it('transitions fetch-SSE row to open on completed status 200', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('sse-3')) })
    await act(async () => { port.emit(patchMsg('sse-start', { id: 'sse-3' })) })
    await act(async () => { port.emit(completedMsg('sse-3', 200)) })

    await waitFor(() => expect(result.current.requests[0].state).toBe('open'))
  })

  // ── frames ────────────────────────────────────────────────────────────────

  it('appends frames to an open WS row', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedWs('ws-3', ['graphql-ws'])) })
    await act(async () => { port.emit(completedMsg('ws-3', 101)) })
    await act(async () => {
      port.emit(patchMsg('frame', { id: 'ws-3', direction: 'receive', data: '{"type":"next","id":"1","payload":{}}', timestamp: 3000 }))
    })
    await act(async () => {
      port.emit(patchMsg('frame', { id: 'ws-3', direction: 'receive', data: '{"type":"complete","id":"1"}', timestamp: 4000 }))
    })

    await waitFor(() => expect(result.current.requests[0].frames?.length).toBe(2))
  })

  // ── disconnected ──────────────────────────────────────────────────────────

  it('transitions to closed on disconnected', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedWs('ws-4', ['graphql-ws'])) })
    await act(async () => { port.emit(completedMsg('ws-4', 101)) })
    await act(async () => {
      port.emit(patchMsg('disconnected', { id: 'ws-4', durationMs: 5000 }))
    })

    await waitFor(() => expect(result.current.requests[0].state).toBe('closed'))
    expect(result.current.requests[0].duration).toBe(5000)
  })

  it('transitions to error on disconnected with failed=true', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedWs('ws-5', ['graphql-ws'])) })
    await act(async () => { port.emit(completedMsg('ws-5', 101)) })
    await act(async () => {
      port.emit(patchMsg('disconnected', { id: 'ws-5', durationMs: 100, failed: true }))
    })

    await waitFor(() => expect(result.current.requests[0].state).toBe('error'))
    expect(result.current.requests[0].hasErrors).toBe(true)
  })

  // ── recording guard ───────────────────────────────────────────────────────

  it('ignores messages when recording is false', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, false))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('req-muted')) })

    expect(result.current.requests).toHaveLength(0)
  })

  // ── clear ─────────────────────────────────────────────────────────────────

  it('clear() empties the requests list', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('req-1')) })
    await act(async () => { result.current.clear() })

    expect(result.current.requests).toHaveLength(0)
  })

  // ── clearOnNavigate ───────────────────────────────────────────────────────

  it('clears requests on navigation when clearOnNavigate=true', async () => {
    const { result } = renderHook(() => useNetworkCapture(true, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('req-nav')) })
    await act(async () => { stub.emitNavigation() })

    expect(result.current.requests).toHaveLength(0)
  })

  it('does not clear on navigation when clearOnNavigate=false', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('req-nav2')) })
    await act(async () => { stub.emitNavigation() })

    expect(result.current.requests).toHaveLength(1)
  })

  // ── HAR enrichment ────────────────────────────────────────────────────────

  it('enriches a pending row when HAR onRequestFinished fires', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('req-har')) })

    const harEntry = makeHar({
      url: 'https://api.example.com/graphql',
      method: 'POST',
      startedMs: 1000,
      status: 200,
    })
    harEntry.getContent = (cb) => cb('{"data":{"user":{"id":"1"}}}', '')

    await act(async () => { stub.emitRequest(harEntry) })

    await waitFor(() => expect(result.current.requests[0].har).toBeDefined())
    expect(result.current.requests[0].responseBody).toBe('{"data":{"user":{"id":"1"}}}')
  })

  it('detects errors in HAR response body', async () => {
    const { result } = renderHook(() => useNetworkCapture(false, true))
    port = stub.getPort('panel:1')!

    await act(async () => { port.emit(startedHttp('req-err')) })

    const harEntry = makeHar({ url: 'https://api.example.com/graphql', method: 'POST', startedMs: 1000 })
    harEntry.getContent = (cb) =>
      cb('{"errors":[{"message":"Not found"}],"data":null}', '')

    await act(async () => { stub.emitRequest(harEntry) })

    await waitFor(() => expect(result.current.requests[0].hasErrors).toBe(true))
  })
})
