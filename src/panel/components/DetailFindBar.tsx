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
  const suffixRef = useRef<HTMLSpanElement>(null)

  // Focus on mount and whenever focusTrigger changes (repeat Cmd+F press).
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusTrigger])

  // Keep input right-padding in sync with the suffix label's rendered width so
  // typed text never overlaps the count or "No results" label.
  useEffect(() => {
    const input = inputRef.current
    const suffix = suffixRef.current
    if (!input) return
    if (!suffix) {
      input.style.paddingRight = '8px'
      return
    }
    const w = suffix.getBoundingClientRect().width
    // 8px gap + suffix width + 8px right inset
    input.style.paddingRight = `${Math.ceil(w) + 16}px`
  })

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? onPrev() : onNext() }
    // Prevent Cmd+F from bubbling to Chrome's native find when the bar is already open.
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      e.stopPropagation()
      inputRef.current?.select()
    }
  }

  const noMatch = !!query && total === 0
  const countLabel = !query ? '' : noMatch ? 'No results' : `${currentIndex} / ${total}`

  return (
    // Floating card — parent positions it absolute bottom-right.
    <div className="flex items-center gap-1 px-2 py-1.5 bg-card border border-border rounded-lg shadow-lg">
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKey}
          placeholder="Find in panel…"
          spellCheck={false}
          className={`h-6 w-44 rounded-md border bg-background pl-2 text-xs outline-none focus:border-primary placeholder:text-muted-foreground ${noMatch ? 'border-destructive/60' : 'border-border'}`}
        />
        {countLabel && (
          <span
            ref={suffixRef}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground/70 whitespace-nowrap"
          >
            {countLabel}
          </span>
        )}
      </div>
      <button
        onClick={onPrev}
        disabled={total === 0}
        title="Previous (Shift+Enter)"
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
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
