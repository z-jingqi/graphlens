import { useState } from 'react'
import clsx from 'clsx'
import type { CapturedRequest } from '../lib/types'
import type { SearchResult, SearchLocation } from '../search/types'
import { SearchResultHit } from './SearchResultHit'

interface Props {
  result: SearchResult
  request: CapturedRequest | undefined
  onHitClick: (requestId: string, location: SearchLocation) => void
}

export function SearchResultGroup({ result, request, onHitClick }: Props) {
  const [expanded, setExpanded] = useState(true)

  const label =
    request?.classification.operationName
    ?? (request?.classification.operationType
        ? request.classification.operationType.toUpperCase()
        : null)
    ?? request?.url
    ?? result.requestId

  return (
    <div className="border-b border-border/40">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-accent transition-colors border-none bg-transparent cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
          className={clsx('shrink-0 text-muted-foreground transition-transform', expanded ? 'rotate-90' : '')}
        >
          <path d="M2 1 L6 4 L2 7 Z" />
        </svg>
        <span className="text-xs font-semibold text-foreground truncate flex-1" title={label}>
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0">{result.hits.length}</span>
      </button>

      {expanded && result.hits.map((hit, i) => (
        <SearchResultHit
          key={i}
          hit={hit}
          onClick={() => onHitClick(result.requestId, hit.location)}
        />
      ))}
    </div>
  )
}
