import { useEffect, useRef } from 'react'

interface Props {
  query: string
  currentIndex: number  // 1-based for display
  total: number
  focusTrigger?: number // bump to re-focus the input (e.g. on each Cmd+F keypress)
  onChange: (q: string) => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

export function DetailFindBar({
  query,
  currentIndex,
  total,
  focusTrigger,
  onChange,
  onPrev,
  onNext,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus on mount and whenever focusTrigger changes (repeat Cmd+F press).
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusTrigger])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    if (e.key === 'Enter') { e.shiftKey ? onPrev() : onNext() }
  }

  const countLabel = !query ? '' : total === 0 ? 'No results' : `${currentIndex} / ${total}`

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-card border-b border-border shrink-0">
      <input
        ref={inputRef}
        value={query}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder="Find in panel…"
        spellCheck={false}
        className="h-6 w-44 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
      />
      <span className="text-xs text-muted-foreground tabular-nums shrink-0 min-w-[60px]">
        {countLabel}
      </span>
      <button
        onClick={onPrev}
        disabled={total === 0}
        title="Previous (Shift+Enter)"
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
        {/* up chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M5 3 L1 8 L9 8 Z" />
        </svg>
      </button>
      <button
        onClick={onNext}
        disabled={total === 0}
        title="Next (Enter)"
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
        {/* down chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M5 7 L1 2 L9 2 Z" />
        </svg>
      </button>
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </div>
  )
}
