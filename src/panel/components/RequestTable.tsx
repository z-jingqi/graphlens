import { useRef, useEffect, useState, useMemo } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import clsx from 'clsx'
import type { CapturedRequest } from '../lib/types'
import type { ColumnWidths } from '../lib/settings'
import { TypeAvatar } from './TypeAvatar'
import { formatSize } from '../lib/format'

function useTick(active: boolean, intervalMs: number) {
  const [, setT] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setT(t => (t + 1) & 0xffff), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
}

interface Props {
  requests: CapturedRequest[]
  totalCount: number
  selected: CapturedRequest | null
  onSelect: (req: CapturedRequest) => void
  columnWidths: ColumnWidths
  onColumnWidthsChange: (w: ColumnWidths) => void
  onColumnWidthsCommit: (w: ColumnWidths) => void
  detailOpen: boolean
}

const PADDING_LEFT = 12  // tailwind px-3
const GAP = 8            // tailwind gap-2
const MIN_COL = 60

function statusColorClass(code: number): string {
  if (code >= 500) return 'text-destructive'
  if (code >= 400) return 'text-destructive'
  if (code >= 300) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-success'
}

function rowName(req: CapturedRequest): string {
  if (req.classification.type === 'graphql') {
    return req.classification.operationName ?? 'anonymous'
  }
  const url = req.har?.request.url ?? req.url
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs.length > 0 ? segs[segs.length - 1] : u.host
    return last + u.search
  } catch {
    return url
  }
}

function gridTemplate(cw: ColumnWidths, detailOpen: boolean): string {
  if (detailOpen) return '1fr'
  return `${cw.name}px ${cw.status}px ${cw.size}px ${cw.time}px`
}

function RequestRow({
  req,
  isSelected,
  onClick,
  template,
  detailOpen,
}: {
  req: CapturedRequest
  isSelected: boolean
  onClick: () => void
  template: string
  detailOpen: boolean
}) {
  const name = rowName(req)

  return (
    <div
      className={clsx(
        'grid gap-2 px-3 py-2 border-b border-border/40 cursor-pointer transition-colors border-l-2',
        isSelected
          ? 'bg-primary/15 border-l-primary'
          : 'hover:bg-accent border-l-transparent',
        req.hasErrors && !isSelected && 'border-l-destructive'
      )}
      style={{ gridTemplateColumns: template }}
      onClick={onClick}
      title={name}
    >
      <div className="flex items-center gap-2 min-w-0 self-center pr-2">
        <TypeAvatar req={req} variant="inline" />
        <span className={clsx(
          'overflow-hidden text-ellipsis whitespace-nowrap text-xs',
          req.hasErrors ? 'text-destructive font-bold' : 'text-foreground'
        )}>
          {name}
        </span>
      </div>
      {!detailOpen && (
        <>
          <span className={clsx('text-xs font-mono self-center tabular-nums flex items-center pr-2', statusColorClass(req.status))}>
            {req.state === 'pending' && req.status === 0
              ? <span className="text-muted-foreground italic">Pending…</span>
              : req.state === 'open'
                ? <span className="text-cyan-600 dark:text-cyan-400 italic">{req.frames?.length ?? 0} msgs</span>
                : req.state === 'closed'
                  ? <span className="text-muted-foreground">Closed</span>
                  : req.state === 'error'
                    ? <span className="text-destructive">Error</span>
                    : (req.status || '—')}
          </span>
          <span className="text-xs font-mono text-muted-foreground self-center tabular-nums pr-2">
            {req.har ? formatSize(req.har.response.content?.size ?? 0) : '—'}
          </span>
          <span className="text-xs font-mono text-muted-foreground self-center tabular-nums pr-2">
            {req.state === 'pending' && req.duration === 0
              ? `${Date.now() - req.startedAt}ms`
              : `${req.duration}ms`}
          </span>
        </>
      )}
    </div>
  )
}

interface BoundarySpec {
  leftKey: keyof ColumnWidths
  rightKey: keyof ColumnWidths
  left: number
}

function ResizeHandle({
  boundary,
  columnWidths,
  onChange,
  onCommit,
}: {
  boundary: BoundarySpec
  columnWidths: ColumnWidths
  onChange: (next: ColumnWidths) => void
  onCommit: (next: ColumnWidths) => void
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startLeft = columnWidths[boundary.leftKey]
    const startRight = columnWidths[boundary.rightKey]
    const totalAdjustable = startLeft + startRight
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let last: ColumnWidths = columnWidths
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      let newLeft = startLeft + delta
      let newRight = startRight - delta
      if (newLeft < MIN_COL) { newLeft = MIN_COL; newRight = totalAdjustable - MIN_COL }
      if (newRight < MIN_COL) { newRight = MIN_COL; newLeft = totalAdjustable - MIN_COL }
      last = { ...columnWidths, [boundary.leftKey]: newLeft, [boundary.rightKey]: newRight }
      onChange(last)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onCommit(last)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      title="Drag to resize"
      className="absolute top-0 bottom-0 w-2 cursor-col-resize pointer-events-auto group"
      style={{ left: boundary.left - 4 }}
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border group-hover:bg-primary" />
      <div className="absolute inset-0 group-hover:bg-primary/20 group-active:bg-primary/40" />
    </div>
  )
}

function computeBoundaries(cw: ColumnWidths): BoundarySpec[] {
  const boundaries: BoundarySpec[] = []
  let x = PADDING_LEFT + cw.name
  boundaries.push({ leftKey: 'name', rightKey: 'status', left: x })
  x += GAP + cw.status
  boundaries.push({ leftKey: 'status', rightKey: 'size', left: x })
  x += GAP + cw.size
  boundaries.push({ leftKey: 'size', rightKey: 'time', left: x })
  return boundaries
}

export function RequestTable({
  requests,
  totalCount,
  selected,
  onSelect,
  columnWidths,
  onColumnWidthsChange,
  onColumnWidthsCommit,
  detailOpen,
}: Props) {
  const needsTick = requests.some(r => (r.state === 'pending' && r.status === 0) || r.state === 'open')
  useTick(needsTick, 250)

  // ── Auto-scroll to newest request ───────────────────────────────────────
  const virtuoso = useRef<VirtuosoHandle>(null)
  const followingRef = useRef(true)
  const lastScrollTop = useRef(0)
  const scrollTimer = useRef<number | null>(null)
  const requestsLenRef = useRef(requests.length)
  requestsLenRef.current = requests.length

  useEffect(() => {
    if (requests.length === 0) return
    if (scrollTimer.current != null) window.clearTimeout(scrollTimer.current)
    scrollTimer.current = window.setTimeout(() => {
      if (followingRef.current) {
        virtuoso.current?.scrollToIndex({
          index: requests.length - 1,
          behavior: 'auto',
          align: 'end',
        })
      }
    }, 300)
    return () => {
      if (scrollTimer.current != null) window.clearTimeout(scrollTimer.current)
    }
  }, [requests.length])

  // When the panel becomes visible again, snap to the newest row if following.
  useEffect(() => {
    const onShown = () => {
      if (followingRef.current && requestsLenRef.current > 0) {
        virtuoso.current?.scrollToIndex({
          index: requestsLenRef.current - 1,
          align: 'end',
          behavior: 'auto',
        })
      }
    }
    window.addEventListener('graphlens:shown', onShown)
    return () => window.removeEventListener('graphlens:shown', onShown)
  }, [])

  // ── Locate-selected pill ─────────────────────────────────────────────────
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 0 })

  const selectedIndex = useMemo(
    () => (selected ? requests.findIndex(r => r.id === selected.id) : -1),
    [requests, selected]
  )

  const showLocate =
    !!selected &&
    requests.length > 100 &&
    selectedIndex >= 0 &&
    (selectedIndex < visibleRange.startIndex || selectedIndex > visibleRange.endIndex)

  const above = showLocate && selectedIndex < visibleRange.startIndex

  const template = gridTemplate(columnWidths, detailOpen)
  const boundaries = !detailOpen && requests.length > 0 ? computeBoundaries(columnWidths) : []

  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden">
      <div
        className="grid gap-2 px-3 py-1.5 bg-card border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground shrink-0"
        style={{ gridTemplateColumns: template }}
      >
        <span className="pr-2">Name</span>
        {!detailOpen && (
          <>
            <span className="pr-2">Status</span>
            <span className="pr-2">Size</span>
            <span className="pr-2">Time</span>
          </>
        )}
      </div>

      {requests.length === 0 ? (
        totalCount === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground px-6 text-center">
            <span>Recording network activity…</span>
            <span>Perform a request or</span>
            <button
              onClick={() => chrome.devtools.inspectedWindow.reload({})}
              className="mt-1 px-3 py-1 rounded-md border border-border text-xs text-foreground hover:bg-accent transition-colors cursor-pointer bg-transparent"
            >
              Reload page
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground px-6 text-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 mb-1">
              <circle cx="9" cy="9" r="6" />
              <line x1="13.5" y1="13.5" x2="17" y2="17" />
              <line x1="7" y1="9" x2="11" y2="9" />
            </svg>
            <span className="font-medium">No matching requests</span>
            <span className="text-muted-foreground/70">Try adjusting or clearing the filters</span>
          </div>
        )
      ) : (
        <Virtuoso
          ref={virtuoso}
          className="virtuoso-fill"
          totalCount={requests.length}
          atBottomThreshold={30}
          atBottomStateChange={atBottom => {
            if (atBottom) followingRef.current = true
          }}
          rangeChanged={setVisibleRange}
          scrollerRef={el => {
            if (el instanceof HTMLElement && el.dataset.scrollBound !== '1') {
              el.dataset.scrollBound = '1'
              el.addEventListener('scroll', () => {
                const top = el.scrollTop
                if (top < lastScrollTop.current - 4) {
                  followingRef.current = false
                }
                lastScrollTop.current = top
              })
            }
          }}
          itemContent={i => {
            const req = requests[i]
            if (!req) return null
            return (
              <RequestRow
                key={req.id}
                req={req}
                isSelected={selected?.id === req.id}
                onClick={() => onSelect(req)}
                template={template}
                detailOpen={detailOpen}
              />
            )
          }}
        />
      )}

      {/* Full-height resize handles overlay */}
      {boundaries.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-20">
          {boundaries.map(b => (
            <ResizeHandle
              key={`${b.leftKey}|${b.rightKey}`}
              boundary={b}
              columnWidths={columnWidths}
              onChange={onColumnWidthsChange}
              onCommit={onColumnWidthsCommit}
            />
          ))}
        </div>
      )}

      {/* Locate-selected pill — floats at top/bottom pointing toward the selected row */}
      {showLocate && (
        <button
          onClick={() =>
            virtuoso.current?.scrollToIndex({ index: selectedIndex, align: 'center', behavior: 'auto' })
          }
          title="Scroll to selected request"
          className={clsx(
            'absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 max-w-[80%]',
            'px-2.5 py-1 rounded-full shadow-lg border-none cursor-pointer transition-all',
            'bg-primary text-primary-foreground text-xs font-medium hover:brightness-110',
            above ? 'top-8' : 'bottom-3'
          )}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="shrink-0">
            {above
              ? <path d="M5 2 L9 7 L1 7 Z" />
              : <path d="M5 8 L1 3 L9 3 Z" />
            }
          </svg>
          <span className="truncate">{rowName(selected!)}</span>
        </button>
      )}
    </div>
  )
}
