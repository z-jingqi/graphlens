import { useState, useMemo, useRef, useEffect } from 'react'
import { useNetworkCapture } from './hooks/useNetworkCapture'
import { useSearch } from './hooks/useSearch'
import { FilterBar } from './components/FilterBar'
import { RequestTable } from './components/RequestTable'
import { DetailPanel } from './components/DetailPanel'
import { SearchPanel } from './components/SearchPanel'
import { applyFilter, DEFAULT_FILTER } from './lib/filter'
import { loadSettings, saveSettings } from './lib/settings'
import type { FilterState, CapturedRequest } from './lib/types'
import type { SettingsState, ColumnWidths } from './lib/settings'
import type { SearchLocation } from './search/types'

const MIN_LIST_WIDTH = 220
const MIN_DETAIL_WIDTH = 240
const MIN_SEARCH_WIDTH = 180
const MAX_SEARCH_WIDTH = 500

export function App() {
  const [settings, setSettings] = useState<SettingsState>(loadSettings)
  const updateSettings = (s: SettingsState) => { setSettings(s); saveSettings(s) }

  const [recording, setRecording] = useState(true)
  const { requests, clear } = useNetworkCapture(settings.clearOnRefresh, recording)
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listWidth, setListWidth] = useState(settings.requestListWidth)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(settings.columnWidths)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchPanelWidth, setSearchPanelWidth] = useState(settings.searchPanelWidth)
  const [detailFindNonce, setDetailFindNonce] = useState<number | undefined>(undefined)
  const [detailJump, setDetailJump] = useState<{
    requestId: string
    location: SearchLocation
    nonce: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Per-request find state ───────────────────────────────────────────────
  // Keyed by request id. Only {open, query} are lifted here; the heavier
  // match logic (index, total, DOM marks) stays local in DetailPanel.
  const [findStates, setFindStates] = useState<Record<string, { open: boolean; query: string }>>({})
  const curFind = selectedId
    ? (findStates[selectedId] ?? { open: false, query: '' })
    : { open: false, query: '' }

  const filtered = useMemo(() => applyFilter(requests, filter), [requests, filter])
  const selected = selectedId ? (filtered.find(r => r.id === selectedId) ?? null) : null

  const search = useSearch(requests)

  // Cmd/Ctrl+F: open in-panel find when a request is selected; otherwise open
  // the global left-side search panel.
  const selectedRef = useRef<CapturedRequest | null>(null)
  selectedRef.current = selected
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (selectedRef.current) {
          const id = selectedRef.current.id
          // Open (or keep open) this request's find bar, preserving any existing query.
          setFindStates(p => ({ ...p, [id]: { open: true, query: p[id]?.query ?? '' } }))
          // Bump nonce to re-focus/select the input inside DetailPanel.
          setDetailFindNonce(n => (n ?? 0) + 1)
        } else {
          setSearchOpen(true)
        }
      }
    }
    // capture:true ensures we intercept before Chrome's native find handler.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const handleSelect = (req: CapturedRequest) => {
    setSelectedId(prev => (prev === req.id ? null : req.id))
  }

  const handleClear = () => {
    clear()
    setSelectedId(null)
    setFindStates({})
  }

  const handleSearchHitClick = (requestId: string, location: SearchLocation) => {
    setSelectedId(requestId)
    setDetailJump({ requestId, location, nonce: Date.now() })
  }

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = listWidth
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 800
    const maxAllowed = Math.max(MIN_LIST_WIDTH, containerWidth - MIN_DETAIL_WIDTH)

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(MIN_LIST_WIDTH, Math.min(maxAllowed, startWidth + ev.clientX - startX))
      setListWidth(next)
    }
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const final = Math.max(MIN_LIST_WIDTH, Math.min(maxAllowed, startWidth + ev.clientX - startX))
      updateSettings({ ...settings, requestListWidth: final })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const startSearchResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = searchPanelWidth

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let last = startWidth
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(MIN_SEARCH_WIDTH, Math.min(MAX_SEARCH_WIDTH, startWidth + ev.clientX - startX))
      last = next
      setSearchPanelWidth(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      updateSettings({ ...settings, searchPanelWidth: last })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <FilterBar
        filter={filter}
        onChange={setFilter}
        onClear={handleClear}
        recording={recording}
        onRecordingChange={setRecording}
        settings={settings}
        onSettingsChange={updateSettings}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
      />
      <div ref={containerRef} className="flex flex-1 overflow-hidden min-h-0">
        {searchOpen && (
          <>
            <SearchPanel
              input={search.input}
              onInputChange={search.setInput}
              query={search.query}
              results={search.results}
              requests={requests}
              width={searchPanelWidth}
              onClose={() => setSearchOpen(false)}
              onHitClick={handleSearchHitClick}
            />
            <div
              onMouseDown={startSearchResize}
              className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary transition-colors"
              title="Drag to resize"
            />
          </>
        )}

        <div
          className={selected ? 'shrink-0 overflow-hidden' : 'flex-1 min-w-0 overflow-hidden'}
          style={selected ? { width: listWidth } : undefined}
        >
          <RequestTable
            requests={filtered}
            totalCount={requests.length}
            selected={selected}
            onSelect={handleSelect}
            columnWidths={columnWidths}
            onColumnWidthsChange={setColumnWidths}
            onColumnWidthsCommit={w => updateSettings({ ...settings, columnWidths: w })}
            detailOpen={selected !== null}
          />
        </div>

        {selected && (
          <>
            <div
              onMouseDown={startResize}
              className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary transition-colors"
              title="Drag to resize"
            />
            <div className="flex-1 min-w-0 flex overflow-hidden">
              <DetailPanel
                request={selected}
                onClose={() => setSelectedId(null)}
                jump={detailJump?.requestId === selected.id
                  ? { location: detailJump.location, nonce: detailJump.nonce }
                  : undefined}
                findNonce={detailFindNonce}
                findOpen={curFind.open}
                findQuery={curFind.query}
                onFindQueryChange={q =>
                  setFindStates(p => ({ ...p, [selected.id]: { open: true, query: q } }))
                }
                onFindClose={() =>
                  setFindStates(p => ({ ...p, [selected.id]: { open: false, query: '' } }))
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
