import { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'

interface Option<T extends string> {
  value: T
  label: string
}

interface MultiSelectFilterProps<T extends string> {
  label: string
  options: Option<T>[]
  selected: Set<T>
  onChange: (next: Set<T>) => void
}

export function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
}: MultiSelectFilterProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (value: T) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  const clear = () => onChange(new Set<T>())

  const isActive = selected.size > 0

  const buttonLabel = () => {
    if (!isActive) return label
    const names = [...selected].map(v => options.find(o => o.value === v)?.label ?? v)
    if (names.length === 1) return `${label}: ${names[0]}`
    return `${label}: ${names[0]} +${names.length - 1}`
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'h-6 inline-flex items-center gap-1 px-2 rounded-md border text-xs font-normal cursor-pointer transition-colors whitespace-nowrap',
          isActive
            ? 'border-primary/60 text-primary bg-primary/10'
            : 'border-border text-muted-foreground bg-background hover:text-foreground hover:bg-accent'
        )}
      >
        <span>{buttonLabel()}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5 shrink-0">
          <path d="M2.5 4.5L6 8L9.5 4.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-popover border border-border rounded-md shadow-lg z-50 min-w-36 overflow-hidden py-1">
          <button
            onClick={clear}
            disabled={!isActive}
            className="block w-full px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-accent border-b border-border/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-1"
          >
            Clear
          </button>
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground hover:bg-accent cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-primary cursor-pointer"
              />
              <span className="flex-1">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
