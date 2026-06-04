import { useEffect, useState, useCallback, useRef } from 'react'
import type { CapturedRequest, CapturedFrame, HarEntry, Transport } from '../lib/types'
import { classify, classifyAll, classifyFrame, isGraphqlWsProtocol, parseGraphqlWsMeta } from '../lib/detect'
import { findPendingMatch } from '../lib/correlate'

const MAX_FRAMES = 1000

interface PendingStartedMsg {
  source: 'graphlens-patch'
  kind: 'started'
  id: string
  url: string
  method: string
  startedAt: number
  body?: string
  transport?: Transport
  protocols?: string[]  // WebSocket subprotocols negotiated at connect time
}

interface PendingCompletedMsg {
  source: 'graphlens-patch'
  kind: 'completed'
  id: string
  status: number
  durationMs: number
  failed?: boolean
}

interface PendingFrameMsg {
  source: 'graphlens-patch'
  kind: 'frame'
  id: string
  direction: 'send' | 'receive'
  data: string
  eventName?: string
  timestamp: number
}

interface PendingDisconnectedMsg {
  source: 'graphlens-patch'
  kind: 'disconnected'
  id: string
  durationMs: number
  failed?: boolean
}

interface PendingSseStartMsg {
  source: 'graphlens-patch'
  kind: 'sse-start'
  id: string
}

type PatchMsg = PendingStartedMsg | PendingCompletedMsg | PendingFrameMsg | PendingDisconnectedMsg | PendingSseStartMsg

export function useNetworkCapture(clearOnNavigate: boolean, recording: boolean) {
  const [requests, setRequests] = useState<CapturedRequest[]>([])
  const requestsRef = useRef(requests)
  requestsRef.current = requests
  const recordingRef = useRef(recording)
  recordingRef.current = recording
  // Buffer SSE/WS started messages; only promote to a visible row when a graphql frame arrives.
  const sseBuffer = useRef<Map<string, PendingStartedMsg>>(new Map())
  // WebSockets without a GraphQL subprotocol are buffered here until a graphql-ws
  // operation frame (subscribe / start) confirms the connection is GraphQL-based.
  const wsBuffer = useRef<Map<string, PendingStartedMsg>>(new Map())
  // Ensures getHAR() backfill only runs once per panel session.
  const harBackfilled = useRef(false)

  // ── HAR finished requests ────────────────────────────────────────────────
  useEffect(() => {
    if (!recording) return
    const handler = (entry: unknown) => {
      const har = entry as HarEntry
      const rt = har._resourceType
      // Accept XHR, fetch, and WebSocket handshakes only; skip everything else.
      if (rt && rt !== 'xhr' && rt !== 'fetch' && rt !== 'websocket') return
      har.getContent((body, encoding) => {
        const bodyText = encoding === 'base64' ? undefined : (body || undefined)
        const classification = classify(har.request.url, har.request.postData?.text)

        let responseJson: unknown
        let hasErrors = false
        if (bodyText) {
          try {
            responseJson = JSON.parse(bodyText)
            const j = responseJson as Record<string, unknown>
            if (Array.isArray(j?.errors) && j.errors.length > 0) hasErrors = true
          } catch {}
        }

        const startedAt = new Date(har.startedDateTime).getTime()

        setRequests(prev => {
          const match = findPendingMatch(prev, har)

          // For plain HTTP (not WS): only keep GraphQL requests,
          // OR already-tracked fetch-SSE rows (their request body is empty → null classification).
          if (rt !== 'websocket' && classification === null) {
            if (!match || match.transport !== 'sse') return prev
          }

          if (match) {
            return prev.map(r =>
              r.id === match.id
                ? {
                    ...r,
                    // Don't overwrite classification if WS/SSE was already promoted to graphql
                    classification: r.transport === 'websocket' || r.transport === 'sse'
                      ? r.classification
                      : (classification ?? r.classification),
                    har,
                    responseBody: bodyText,
                    responseJson,
                    hasErrors,
                    timestamp: startedAt,
                    duration: rt === 'websocket' ? r.duration : Math.round(har.time),
                    status: rt === 'websocket' ? r.status : har.response.status,
                  }
                : r
            )
          }
          // No pending match — create a new row (only reached for graphql, guarded above).
          if (classification === null) return prev
          const allOps = classifyAll(har.request.postData?.text)
          const captured: CapturedRequest = {
            id: `har-${har.startedDateTime}-${har.request.url}-${Math.random().toString(36).slice(2, 8)}`,
            state: 'finished',
            url: har.request.url,
            method: har.request.method,
            startedAt,
            har,
            classification,
            responseBody: bodyText,
            responseJson,
            hasErrors,
            timestamp: startedAt,
            duration: Math.round(har.time),
            status: har.response.status,
            ...(allOps.length > 1 ? { operations: allOps } : {}),
          }
          return [...prev, captured]
        })
      })
    }

    // Backfill HTTP requests that completed before the panel was opened.
    // getHAR() returns all entries since page load; the handler's existing
    // classify + findPendingMatch logic deduplicates any overlap with live events.
    // Response bodies are not available for pre-panel requests (Chrome limitation)
    // but URL, method, status, headers, and postData (query) are all present.
    if (!harBackfilled.current) {
      harBackfilled.current = true
      try {
        chrome.devtools.network.getHAR(harLog => {
          harLog.entries.forEach(e => handler(e as unknown))
        })
      } catch {}
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chrome.devtools.network.onRequestFinished.addListener(handler as any)
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chrome.devtools.network.onRequestFinished.removeListener(handler as any)
    }
  }, [recording])

  // ── Pending events from background ───────────────────────────────────────
  useEffect(() => {
    const tabId = chrome.devtools?.inspectedWindow?.tabId
    if (tabId == null) return

    let port: chrome.runtime.Port | null = null
    let cancelled = false

    const onMessage = (raw: unknown) => {
      const msg = raw as PatchMsg
      if (!msg || msg.source !== 'graphlens-patch') return
      if (!recordingRef.current) return

      if (msg.kind === 'started') {
        // SSE: buffer and only show once a graphql frame arrives.
        if (msg.transport === 'sse') {
          sseBuffer.current.set(msg.id, msg)
          return
        }

        // WebSocket without a known GraphQL subprotocol: buffer until a graphql-ws
        // operation frame (subscribe / start) confirms this is a GraphQL connection.
        // WebSocket with a GraphQL subprotocol (graphql-transport-ws / graphql-ws):
        // show immediately so the developer sees "Connecting → Open" in real time.
        if (msg.transport === 'websocket' && !isGraphqlWsProtocol(msg.protocols)) {
          wsBuffer.current.set(msg.id, msg)
          return
        }

        setRequests(prev => {
          if (prev.some(r => r.id === msg.id)) return prev

          // WebSocket with confirmed GraphQL subprotocol: track immediately.
          if (msg.transport === 'websocket') {
            const captured: CapturedRequest = {
              id: msg.id,
              state: 'pending',
              url: msg.url,
              method: msg.method,
              startedAt: msg.startedAt,
              classification: { type: msg.transport },
              transport: msg.transport,
              hasErrors: false,
              timestamp: msg.startedAt,
              duration: 0,
              status: 0,
            }
            return [...prev, captured]
          }

          // HTTP (fetch/XHR): only track if it looks like GraphQL.
          const classification = classify(msg.url, msg.body)
          if (classification === null) return prev

          const allOps = classifyAll(msg.body)
          const captured: CapturedRequest = {
            id: msg.id,
            state: 'pending',
            url: msg.url,
            method: msg.method,
            startedAt: msg.startedAt,
            classification,
            requestBody: msg.body,
            hasErrors: false,
            timestamp: msg.startedAt,
            duration: 0,
            status: 0,
            ...(allOps.length > 1 ? { operations: allOps } : {}),
          }
          return [...prev, captured]
        })
      } else if (msg.kind === 'sse-start') {
        // Fetch-based SSE: flip an existing HTTP-graphql row to transport='sse'.
        // This must arrive before 'completed' so the completed handler sees transport==='sse'
        // and treats status 200 as a handshake (→ state 'open' instead of 'finished').
        setRequests(prev =>
          prev.map(r => r.id === msg.id ? { ...r, transport: 'sse' as Transport } : r)
        )
      } else if (msg.kind === 'completed') {
        setRequests(prev =>
          prev.map(r => {
            if (r.id !== msg.id) return r
            // For WS/SSE: status 101/200 means handshake succeeded → transition to 'open'
            const isHandshake = (r.transport === 'websocket' && msg.status === 101) ||
              (r.transport === 'sse' && msg.status === 200)
            return {
              ...r,
              state: isHandshake ? 'open' : 'finished',
              status: msg.status,
              duration: msg.durationMs,
              hasErrors: r.hasErrors || !!msg.failed,
            }
          })
        )
      } else if (msg.kind === 'frame') {
        const frameClassification = classifyFrame(msg.data)
        // Promote a buffered SSE or WS connection to a visible row when the first
        // graphql operation frame confirms it is a GraphQL connection.
        const bufferedSse = frameClassification ? sseBuffer.current.get(msg.id) : undefined
        const bufferedWs  = frameClassification ? wsBuffer.current.get(msg.id)  : undefined
        if (bufferedSse) sseBuffer.current.delete(msg.id)
        if (bufferedWs)  wsBuffer.current.delete(msg.id)
        const buffered = bufferedSse ?? bufferedWs

        setRequests(prev => {
          const exists = prev.some(r => r.id === msg.id)

          if (!exists && buffered && frameClassification) {
            const wsMeta = parseGraphqlWsMeta(msg.data)
            const frame: CapturedFrame = {
              direction: msg.direction,
              timestamp: msg.timestamp,
              data: msg.data,
              eventName: msg.eventName,
              classification: frameClassification,
              correlationId: wsMeta.id,
              messageType: wsMeta.type,
            }
            const newRow: CapturedRequest = {
              id: buffered.id,
              state: 'open',
              url: buffered.url,
              method: buffered.method,
              startedAt: buffered.startedAt,
              classification: frameClassification,
              transport: buffered.transport as Transport,
              hasErrors: false,
              timestamp: buffered.startedAt,
              duration: 0,
              status: 0,
              frames: [frame],
            }
            return [...prev, newRow]
          }

          return prev.map(r => {
            if (r.id !== msg.id) return r
            const wsMeta = parseGraphqlWsMeta(msg.data)
            const frame: CapturedFrame = {
              direction: msg.direction,
              timestamp: msg.timestamp,
              data: msg.data,
              eventName: msg.eventName,
              classification: frameClassification ?? undefined,
              correlationId: wsMeta.id,
              messageType: wsMeta.type,
            }
            const existing = r.frames ?? []
            const frames = existing.length >= MAX_FRAMES
              ? [...existing.slice(1), frame]
              : [...existing, frame]

            let classification = r.classification
            if (frameClassification !== null && classification.type !== 'graphql') {
              classification = frameClassification
            }

            return { ...r, frames, classification }
          })
        })
      } else if (msg.kind === 'disconnected') {
        sseBuffer.current.delete(msg.id)
        wsBuffer.current.delete(msg.id)
        setRequests(prev =>
          prev.map(r =>
            r.id === msg.id
              ? {
                  ...r,
                  state: msg.failed ? 'error' : 'closed',
                  duration: msg.durationMs,
                  hasErrors: r.hasErrors || !!msg.failed,
                }
              : r
          )
        )
      }
    }

    const connect = () => {
      if (cancelled) return
      try {
        port = chrome.runtime.connect({ name: `panel:${tabId}` })
        port.onMessage.addListener(onMessage)
        port.onDisconnect.addListener(() => {
          port = null
          if (!cancelled) setTimeout(connect, 500)
        })
      } catch {
        if (!cancelled) setTimeout(connect, 500)
      }
    }
    connect()

    return () => {
      cancelled = true
      try { port?.disconnect() } catch {}
    }
  }, [])

  // ── Clear on navigation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!clearOnNavigate) return
    const onNav = () => setRequests([])
    chrome.devtools.network.onNavigated.addListener(onNav)
    return () => chrome.devtools.network.onNavigated.removeListener(onNav)
  }, [clearOnNavigate])

  const clear = useCallback(() => setRequests([]), [])

  return { requests, clear }
}
