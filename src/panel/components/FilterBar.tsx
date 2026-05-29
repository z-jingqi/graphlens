import { useRef, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { FilterState, GqlOperationType, RequestType } from '../lib/types'
import type { SettingsState } from '../lib/settings'
import { MultiSelectFilter } from './MultiSelectFilter'

interface FilterBarProps {
  filter: FilterState
  onChange: (f: FilterState) => void
  onClear: () => void
  recording: boolean
  onRecordingChange: (r: boolean) => void
  settings: SettingsState
  onSettingsChange: (s: SettingsState) => void
  searchOpen: boolean
  onSearchOpenChange: (open: boolean) => void
}

const OP_TYPE_OPTIONS: { value: GqlOperationType; label: string }[] = [
  { value: 'query', label: 'Query' },
  { value: 'mutation', label: 'Mutation' },
  { value: 'subscription', label: 'Subscription' },
]

const REQUEST_TYPE_OPTIONS: { value: RequestType; label: string }[] = [
  { value: 'graphql', label: 'Graphql' },
  { value: 'websocket', label: 'Graphql-ws' },
  { value: 'sse', label: 'Graphql-sse' },
]

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M3.6 3.6l8.8 8.8" />
    </svg>
  )
}

function RecordingIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5.5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6.5" cy="6.5" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  )
}

export function FilterBar({
  filter,
  onChange,
  onClear,
  recording,
  onRecordingChange,
  settings,
  onSettingsChange,
  searchOpen,
  onSearchOpenChange,
}: FilterBarProps) {
  const [inputVal, setInputVal] = useState(filter.search)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange({ ...filter, search: inputVal })
    }, 150)
    return () => clearTimeout(timerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputVal])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border shrink-0">
      <button
        onClick={() => onRecordingChange(!recording)}
        title={recording ? 'Stop recording' : 'Start recording'}
        className={clsx(
          'h-6 w-6 rounded-md flex items-center justify-center hover:bg-accent transition-colors cursor-pointer border-none bg-transparent',
          recording ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        <RecordingIcon on={recording} />
      </button>

      <button
        onClick={onClear}
        title="Clear requests"
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors cursor-pointer border-none bg-transparent"
      >
        <ClearIcon />
      </button>

      <button
        onClick={() => onSearchOpenChange(!searchOpen)}
        title={searchOpen ? 'Close search' : 'Search all requests'}
        className={clsx(
          'h-6 w-6 rounded-md flex items-center justify-center hover:bg-accent transition-colors cursor-pointer border-none bg-transparent',
          searchOpen ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        <SearchIcon />
      </button>

      <div className="w-px h-5 bg-border shrink-0" />

      <div className="relative">
        <input
          className="h-6 w-56 rounded-md border border-border bg-background pl-2 pr-6 text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
          placeholder="Filter"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          spellCheck={false}
        />
        {inputVal && (
          <button
            onClick={() => setInputVal('')}
            title="Clear filter"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        )}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filter.invertSearch}
          onChange={e => onChange({ ...filter, invertSearch: e.target.checked })}
          className="accent-primary cursor-pointer"
        />
        <span className={filter.invertSearch ? 'text-foreground' : ''}>Invert</span>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!settings.clearOnRefresh}
          onChange={e => onSettingsChange({ ...settings, clearOnRefresh: !e.target.checked })}
          className="accent-primary cursor-pointer"
        />
        <span className={!settings.clearOnRefresh ? 'text-foreground' : ''}>Preserve log</span>
      </label>

      <div className="w-px h-5 bg-border shrink-0" />

      <MultiSelectFilter
        label="Transport"
        options={REQUEST_TYPE_OPTIONS}
        selected={filter.requestTypes}
        onChange={requestTypes => onChange({ ...filter, requestTypes })}
      />

      <div className="w-px h-5 bg-border shrink-0" />

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onChange({ ...filter, opTypes: new Set() })}
          className={clsx(
            'h-5 px-1.5 rounded text-[10px] leading-none cursor-pointer transition-colors whitespace-nowrap border-none',
            filter.opTypes.size === 0
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent bg-transparent'
          )}
        >
          All
        </button>
        {OP_TYPE_OPTIONS.map(o => {
          const active = filter.opTypes.has(o.value)
          return (
            <button
              key={o.value}
              onClick={() => onChange({
                ...filter,
                opTypes: active ? new Set() : new Set([o.value]),
              })}
              className={clsx(
                'h-5 px-1.5 rounded text-[10px] leading-none cursor-pointer transition-colors whitespace-nowrap border-none',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent bg-transparent'
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
