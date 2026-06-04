import type { CapturedRequest } from '../lib/types'
import type { SearchHit, SearchLocation, SearchResult } from './types'
import { makeSnippet } from './highlight'
import { findMatches } from './match'

const MAX_HITS_PER_SOURCE = 5
const MAX_FRAME_SCAN = 200
const MAX_TOTAL_HITS = 500

export function searchRequests(requests: CapturedRequest[], query: string): SearchResult[] {
  if (!query.trim()) return []

  const allResults: SearchResult[] = []
  let totalHits = 0

  for (const req of requests) {
    if (totalHits >= MAX_TOTAL_HITS) break

    const hits: SearchHit[] = []

    const scan = (text: string | undefined | null, location: SearchLocation) => {
      if (!text || totalHits + hits.length >= MAX_TOTAL_HITS) return
      const matches = findMatches(text, query).slice(0, MAX_HITS_PER_SOURCE)
      for (const { start, end } of matches) {
        hits.push({ location, snippet: makeSnippet(text, start, end) })
      }
    }

    scan(req.classification.operationName, { kind: 'operationName' })
    scan(req.har?.request.url ?? req.url, { kind: 'url' })
    scan(req.classification.query, { kind: 'query' })
    if (req.classification.variables !== undefined) {
      scan(JSON.stringify(req.classification.variables, null, 2), { kind: 'variables' })
    }
    scan(req.requestBody, { kind: 'requestBody' })
    scan(req.responseBody, { kind: 'responseBody' })

    const frames = req.frames?.slice(0, MAX_FRAME_SCAN) ?? []
    for (let i = 0; i < frames.length && totalHits + hits.length < MAX_TOTAL_HITS; i++) {
      scan(frames[i].data, { kind: 'frame', frameIndex: i, eventName: frames[i].eventName })
    }

    if (hits.length > 0) {
      allResults.push({ requestId: req.id, hits })
      totalHits += hits.length
    }
  }

  return allResults
}
