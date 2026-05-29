import type { CapturedRequest } from '../lib/types'
import type { SearchHit, SearchLocation, SearchResult } from './types'
import { makeSnippet } from './highlight'

const MAX_HITS_PER_SOURCE = 5
const MAX_FRAME_SCAN = 200
const MAX_TOTAL_HITS = 500

// Returns all non-overlapping match positions for `query` within `text`.
// Supports the same `/pattern/flags` regex syntax as the toolbar filter.
function findMatches(text: string, query: string): Array<{ start: number; end: number }> {
  if (!text || !query) return []

  const regexMatch = query.match(/^\/(.+)\/([gimsuy]*)$/)
  if (regexMatch) {
    try {
      const flags = regexMatch[2] || ''
      const flagsWithG = flags.includes('g') ? flags : flags + 'g'
      const re = new RegExp(regexMatch[1], flagsWithG)
      const results: Array<{ start: number; end: number }> = []
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        results.push({ start: m.index, end: m.index + m[0].length })
        if (m[0].length === 0) { re.lastIndex++; break }
      }
      return results
    } catch {
      // invalid regex — fall through to substring
    }
  }

  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const results: Array<{ start: number; end: number }> = []
  let pos = 0
  while (pos <= lower.length - q.length) {
    const idx = lower.indexOf(q, pos)
    if (idx === -1) break
    results.push({ start: idx, end: idx + q.length })
    pos = idx + Math.max(1, q.length)
  }
  return results
}

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
