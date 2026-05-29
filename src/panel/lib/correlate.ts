import type { CapturedRequest, HarEntry } from './types'

const MATCH_WINDOW_MS = 2000

export function findPendingMatch(
  records: CapturedRequest[],
  har: HarEntry
): CapturedRequest | undefined {
  const harStart = new Date(har.startedDateTime).getTime()
  const method = har.request.method.toUpperCase()
  const url = har.request.url
  const isWsHar = har._resourceType === 'websocket'

  let best: CapturedRequest | undefined
  for (const r of records) {
    if (r.har) continue
    // Pure EventSource SSE has no HAR counterpart; fetch-based SSE (graphql type) does.
    if (r.transport === 'sse' && r.classification.type !== 'graphql') continue
    if (r.url !== url) continue
    // WS handshake appears as GET in HAR but 'WS' in patch; skip method check for WS
    if (!isWsHar && r.method.toUpperCase() !== method) continue
    if (isWsHar && r.transport !== 'websocket') continue
    if (Math.abs(r.startedAt - harStart) > MATCH_WINDOW_MS) continue
    if (!best || r.startedAt < best.startedAt) best = r
  }
  return best
}
