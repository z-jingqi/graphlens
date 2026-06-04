// Shared match-finding utilities used by the global search engine and the
// in-detail find bar. Kept separate so engine.ts can import it without
// pulling in any React or component code.

export type MatchRange = { start: number; end: number }

/**
 * Returns all non-overlapping match positions for `query` within `text`.
 * Supports `/pattern/flags` regex syntax; falls back to case-insensitive
 * substring matching.
 */
export function findMatches(text: string, query: string): MatchRange[] {
  if (!text || !query) return []

  const regexMatch = query.match(/^\/(.+)\/([gimsuy]*)$/)
  if (regexMatch) {
    try {
      const flags = regexMatch[2] || ''
      const flagsWithG = flags.includes('g') ? flags : flags + 'g'
      const re = new RegExp(regexMatch[1], flagsWithG)
      const results: MatchRange[] = []
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
  const results: MatchRange[] = []
  let pos = 0
  while (pos <= lower.length - q.length) {
    const idx = lower.indexOf(q, pos)
    if (idx === -1) break
    results.push({ start: idx, end: idx + q.length })
    pos = idx + Math.max(1, q.length)
  }
  return results
}

/**
 * Splits `text` into alternating non-match / match segments for inline
 * highlight rendering.
 */
export function splitHighlight(
  text: string,
  query: string,
): Array<{ text: string; match: boolean }> {
  const ranges = findMatches(text, query)
  if (ranges.length === 0) return [{ text, match: false }]
  const result: Array<{ text: string; match: boolean }> = []
  let pos = 0
  for (const { start, end } of ranges) {
    if (pos < start) result.push({ text: text.slice(pos, start), match: false })
    result.push({ text: text.slice(start, end), match: true })
    pos = end
  }
  if (pos < text.length) result.push({ text: text.slice(pos), match: false })
  return result
}

/**
 * Returns true if serialising `data` to JSON contains `query`
 * (case-insensitive). Used by JsonNode to decide whether to auto-expand
 * when find is active.
 */
export function dataContains(data: unknown, query: string): boolean {
  if (!query) return false
  try {
    return JSON.stringify(data).toLowerCase().includes(query.toLowerCase())
  } catch {
    return false
  }
}
