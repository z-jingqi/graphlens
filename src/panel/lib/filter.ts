import type { CapturedRequest, FilterState } from './types'

export const DEFAULT_FILTER: FilterState = {
  search: '',
  invertSearch: false,
  opTypes: new Set(),
  requestTypes: new Set(),
}

// `/pattern/flags` → regex; `/pattern/` → regex with default flags; anything else → plain substring.
function buildMatcher(query: string): (text: string) => boolean {
  const m = query.match(/^\/(.+)\/([gimsuy]*)$/)
  if (m) {
    try {
      const re = new RegExp(m[1], m[2] || 'i')
      return text => re.test(text)
    } catch {
      // fall through to substring match if regex is invalid
    }
  }
  const q = query.toLowerCase()
  return text => text.toLowerCase().includes(q)
}

export function applyFilter(requests: CapturedRequest[], f: FilterState): CapturedRequest[] {
  const matcher = f.search ? buildMatcher(f.search) : null

  return requests.filter(req => {
    if (f.requestTypes.size > 0 && !f.requestTypes.has(req.transport ?? req.classification.type)) return false

    if (f.opTypes.size > 0) {
      if (req.classification.type !== 'graphql') return false
      if (!req.classification.operationType || !f.opTypes.has(req.classification.operationType))
        return false
    }

    if (matcher) {
      const isGql = req.classification.type === 'graphql'
      const hit = isGql
        ? matcher(req.classification.operationName ?? '')
        : matcher(req.har?.request.url ?? req.url)
      if (f.invertSearch ? hit : !hit) return false
    }

    return true
  })
}
