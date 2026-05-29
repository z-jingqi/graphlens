import type { SearchHit } from '../search/types'

const LOCATION_LABELS: Record<string, string> = {
  operationName: 'Name',
  url: 'URL',
  query: 'Query',
  variables: 'Variables',
  requestBody: 'Request body',
  responseBody: 'Response body',
}

function locationLabel(hit: SearchHit): string {
  const loc = hit.location
  if (loc.kind === 'frame') {
    return loc.eventName
      ? `Frame (${loc.eventName}) #${loc.frameIndex}`
      : `Frame #${loc.frameIndex}`
  }
  return LOCATION_LABELS[loc.kind] ?? loc.kind
}

interface Props {
  hit: SearchHit
  onClick: () => void
}

export function SearchResultHit({ hit, onClick }: Props) {
  const { pre, match, post } = hit.snippet
  return (
    <div
      className="px-3 py-1.5 cursor-pointer hover:bg-accent transition-colors"
      onClick={onClick}
    >
      <div className="text-[10px] text-muted-foreground mb-0.5 leading-none">{locationLabel(hit)}</div>
      <div className="text-xs font-mono text-foreground/80 truncate">
        <span>{pre}</span>
        <mark className="bg-primary/25 text-primary rounded-sm not-italic">{match}</mark>
        <span>{post}</span>
      </div>
    </div>
  )
}
