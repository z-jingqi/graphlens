import { useMemo } from 'react'
import type { CapturedRequest } from '../lib/types'
import type { SearchResult, SearchLocation } from '../search/types'
import { SearchResultGroup } from './SearchResultGroup'

interface Props {
  input: string
  onInputChange: (v: string) => void
  query: string
  results: SearchResult[]
  requests: CapturedRequest[]
  width: number
  onClose: () => void
  onHitClick: (requestId: string, location: SearchLocation) => void
}

export function SearchPanel({
  input,
  onInputChange,
  query,
  results,
  requests,
  width,
  onClose,
  onHitClick,
}: Props) {
  const requestMap = useMemo(() => {
    const m = new Map<string, CapturedRequest>()
    requests.forEach(r => m.set(r.id, r))
    return m
  }, [requests])

  const totalHits = results.reduce((n, r) => n + r.hits.length, 0)

  return (
    <div
      className="flex flex-col h-full bg-card border-r border-border shrink-0 overflow-hidden"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold flex-1">Search</span>
        <button
          onClick={onClose}
          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer shrink-0"
          title="Close search"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* Input + stats */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <svg
            width="12" height="12" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          >
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            autoFocus
            className="h-6 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
            placeholder="Search all requests…"
            value={input}
            onChange={e => onInputChange(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground italic leading-none">
          {query
            ? totalHits === 0
              ? 'No matches'
              : `${totalHits} result${totalHits !== 1 ? 's' : ''} in ${results.length} request${results.length !== 1 ? 's' : ''}`
            : 'Searches name, URL, query, variables, body, frames'}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.map(r => (
          <SearchResultGroup
            key={r.requestId}
            result={r}
            request={requestMap.get(r.requestId)}
            onHitClick={onHitClick}
          />
        ))}
      </div>
    </div>
  )
}
