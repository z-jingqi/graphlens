import { splitHighlight } from '../search/match'

interface Props {
  text: string
  query: string
  className?: string
}

/**
 * Renders `text` with matching substrings wrapped in <mark data-find-mark>
 * elements so the detail-panel find system can scroll to and style them.
 * When `query` is empty the component is a zero-overhead passthrough.
 */
export function Highlighted({ text, query, className }: Props) {
  if (!query) return <span className={className}>{text}</span>

  const parts = splitHighlight(text, query)
  if (parts.length === 1 && !parts[0].match) return <span className={className}>{text}</span>

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.match ? (
          <mark
            key={i}
            data-find-mark
            className="bg-primary/25 text-primary rounded-sm not-italic"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  )
}
