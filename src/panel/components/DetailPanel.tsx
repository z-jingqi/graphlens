import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { CapturedRequest, CapturedFrame, Classification } from '../lib/types'
import type { SearchLocation } from '../search/types'
import { JsonTree } from './JsonTree'
import { CopyMenu } from './CopyMenu'
import { CopyIconButton } from './CopyIconButton'
import { HighlightedCode } from './HighlightedCode'
import { Highlighted } from './Highlighted'
import { DetailFindBar } from './DetailFindBar'
import { TypeAvatar } from './TypeAvatar'
import { findMatches } from '../search/match'
import clsx from 'clsx'

type Tab = 'query' | 'variables' | 'response' | 'headers' | 'messages' | 'eventstream'

interface Props {
  request: CapturedRequest
  onClose: () => void
  jump?: { location: SearchLocation; nonce: number }
  findNonce?: number  // bumped by App on each Cmd+F press when detail is open
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  )
}

function statusColorClass(code: number): string {
  if (code >= 400) return 'text-destructive'
  if (code >= 300) return 'text-yellow-600 dark:text-yellow-400'
  if (code >= 200) return 'text-success'
  return 'text-muted-foreground'
}

function StatusDot({ code }: { code: number }) {
  return (
    <span
      className={clsx(
        'inline-block w-2 h-2 rounded-full mr-1.5',
        code >= 400 ? 'bg-destructive' : code >= 300 ? 'bg-yellow-500' : code >= 200 ? 'bg-success' : 'bg-muted-foreground'
      )}
    />
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-3 py-0.5" style={{ gridTemplateColumns: '160px 1fr' }}>
      <div className="text-xs text-muted-foreground truncate" title={label}>{label}</div>
      <div className="text-xs font-mono text-foreground break-all whitespace-pre-wrap">{children}</div>
    </div>
  )
}

interface HeaderMenu { x: number; y: number; name: string; value: string }

function HeaderContextMenu({ menu, onClose }: { menu: HeaderMenu; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onScroll = () => onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  const copy = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}); onClose() }

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999 }}
      className="bg-popover border border-border rounded-md shadow-lg overflow-hidden py-1 min-w-44"
    >
      <button
        onClick={() => copy(menu.value)}
        className="block w-full px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer whitespace-nowrap"
      >
        Copy value
      </button>
      <button
        onClick={() => copy(menu.name)}
        className="block w-full px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer whitespace-nowrap"
      >
        Copy name
      </button>
    </div>
  )
}

function HeadersGrid({ headers, findQuery = '' }: { headers: { name: string; value: string }[]; findQuery?: string }) {
  const [menu, setMenu] = useState<HeaderMenu | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  if (headers.length === 0) {
    return <span className="text-xs text-muted-foreground italic">(none)</span>
  }
  return (
    <>
      <div className="flex flex-col">
        {headers.map((h, i) => (
          <div
            key={i}
            className="flex items-start gap-x-2 rounded hover:bg-accent/40 -mx-1 px-1 cursor-default"
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, name: h.name, value: h.value }) }}
          >
            <div className="py-0.5 text-xs font-mono json-key break-all shrink-0" style={{ width: 160 }} title={h.name}>
              <Highlighted text={h.name} query={findQuery} />
            </div>
            <div className="py-0.5 text-xs font-mono text-foreground break-all whitespace-pre-wrap flex-1 min-w-0">
              <Highlighted text={h.value} query={findQuery} />
            </div>
          </div>
        ))}
      </div>
      {menu && <HeaderContextMenu menu={menu} onClose={closeMenu} />}
    </>
  )
}

function headersText(headers: { name: string; value: string }[]): string {
  return headers.map(h => `${h.name}: ${h.value}`).join('\n')
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className={clsx('transition-transform shrink-0 text-muted-foreground', open ? 'rotate-90' : '')}
      fill="currentColor"
    >
      <path d="M3 1 L7 5 L3 9 Z" />
    </svg>
  )
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  action,
  children,
}: {
  title: string
  defaultOpen?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section>
      <div className="flex items-center gap-1 group">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 flex-1 text-left px-1 py-1 -mx-1 rounded-md hover:bg-accent transition-colors border-none bg-transparent cursor-pointer min-w-0"
        >
          <Chevron open={open} />
          <span className="text-xs font-semibold text-foreground">{title}</span>
        </button>
        {open && action}
      </div>
      {open && <div className="mt-1 pl-3">{children}</div>}
    </section>
  )
}

function FrameRow({ frame, requestId, search }: { frame: CapturedFrame; requestId: string; search?: string }) {
  const isSend = frame.direction === 'send'
  const [userExpanded, setUserExpanded] = useState(false)
  const hasMatch = search ? findMatches(frame.data, search).length > 0 : false
  // Auto-expand when the frame contains a search match; keeps expanding even if
  // the user has not explicitly clicked.
  const expanded = userExpanded || hasMatch

  const time = new Date(frame.timestamp).toLocaleTimeString([], {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  })
  const preview = frame.data.length > 120 ? frame.data.slice(0, 120) + '…' : frame.data
  const isJson = (() => { try { JSON.parse(frame.data); return true } catch { return false } })()

  return (
    <div
      className={clsx(
        'px-3 py-1.5 border-b border-border/40 cursor-pointer hover:bg-accent transition-colors text-xs',
        isSend ? 'border-l-2 border-l-blue-400' : 'border-l-2 border-l-emerald-400'
      )}
      onClick={() => setUserExpanded(e => !e)}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={clsx('font-mono shrink-0', isSend ? 'text-blue-500' : 'text-emerald-500')}>
          {isSend ? '↑' : '↓'}
        </span>
        {frame.eventName && (
          <span className={clsx(
            'text-[10px] font-bold shrink-0',
            frame.eventName === 'next'     ? 'text-emerald-500' :
            frame.eventName === 'complete' ? 'text-blue-400' :
            frame.eventName === 'error'    ? 'text-destructive' :
                                             'text-orange-500'
          )}>{frame.eventName}</span>
        )}
        {frame.classification?.operationName && (
          <span className="text-[10px] text-primary font-mono shrink-0">{frame.classification.operationName}</span>
        )}
        <span className="text-muted-foreground font-mono shrink-0">{time}</span>
        <span className="text-muted-foreground truncate min-w-0">
          {search ? <Highlighted text={preview} query={search} /> : preview}
        </span>
        <span className="text-muted-foreground/60 font-mono shrink-0 ml-auto">{frame.data.length}B</span>
      </div>
      {expanded && (
        <div className="mt-1.5 bg-muted/40 rounded-md p-2 overflow-x-auto">
          {isJson
            ? <JsonTree
                data={JSON.parse(frame.data)}
                cacheKey={`${requestId}:frame:${frame.timestamp}`}
                search={search}
              />
            : <pre className="font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap break-all">
                {search ? <Highlighted text={frame.data} query={search} /> : frame.data}
              </pre>
          }
        </div>
      )}
    </div>
  )
}

// ── Subscription grouping ─────────────────────────────────────────────────────

export interface FrameGroup {
  key: string
  label: string
  subLabel?: string
  frames: { frame: CapturedFrame; index: number }[]
}

export function buildGroups(frames: CapturedFrame[]): FrameGroup[] {
  const map = new Map<string, FrameGroup>()

  frames.forEach((frame, index) => {
    const key = frame.correlationId ?? frame.eventName ?? '__other__'

    if (!map.has(key)) {
      let label: string
      let subLabel: string | undefined
      if (key === '__other__') {
        label = 'Other'
      } else if (frame.correlationId) {
        label = frame.classification?.operationName ?? 'Subscription'
        subLabel = `#${frame.correlationId}`
      } else {
        label = frame.eventName ?? 'Other'
      }
      map.set(key, { key, label, subLabel, frames: [] })
    }

    const group = map.get(key)!
    if (frame.classification?.operationName && group.label === 'Subscription') {
      group.label = frame.classification.operationName
    }
    group.frames.push({ frame, index })
  })

  return Array.from(map.values())
}

// ── Batch operations ──────────────────────────────────────────────────────────

function BatchQueryTab({ operations, requestId, findQuery }: {
  operations: Classification[]
  requestId: string
  findQuery: string
}) {
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
      {operations.map((op, i) => (
        <CollapsibleSection
          key={i}
          title={`${i + 1}. ${op.operationType?.toUpperCase() ?? 'GQL'} ${op.operationName ?? 'anonymous'}`}
          action={op.query ? <CopyIconButton text={op.query} title="Copy query" /> : undefined}
        >
          {op.query ? (
            <div className="bg-muted/40 rounded-md p-2 overflow-x-auto">
              {findQuery
                ? <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
                    <Highlighted text={op.query} query={findQuery} />
                  </pre>
                : <HighlightedCode code={op.query} language="graphql" />
              }
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">No query (persisted)</span>
          )}
        </CollapsibleSection>
      ))}
    </div>
  )
}

function BatchVariablesTab({ operations, requestId, findQuery }: {
  operations: Classification[]
  requestId: string
  findQuery: string
}) {
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
      {operations.map((op, i) => (
        <CollapsibleSection
          key={i}
          title={`${i + 1}. ${op.operationName ?? 'anonymous'}`}
          action={op.variables !== undefined
            ? <CopyIconButton text={JSON.stringify(op.variables, null, 2)} title="Copy variables" />
            : undefined
          }
        >
          {op.variables !== undefined ? (
            <div className="bg-muted/40 rounded-md p-2 overflow-x-auto">
              <JsonTree
                data={op.variables}
                cacheKey={`${requestId}:vars:${i}`}
                search={findQuery || undefined}
              />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">No variables</span>
          )}
        </CollapsibleSection>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DetailPanel({ request, onClose, jump, findNonce }: Props) {
  const { classification: c, har, responseJson, responseBody } = request
  const isWsLike = request.transport === 'websocket'
  const isSse = request.transport === 'sse'
  const isEventSourceSse = isSse && c.type !== 'graphql'
  const hasStream = isWsLike || isSse

  const [tab, setTab] = useState<Tab>(
    isWsLike ? 'messages' : isSse ? 'eventstream' : 'response'
  )
  const isPending = !har && request.state === 'pending'
  const isBatch = (request.operations?.length ?? 0) > 1

  // ── Find / in-panel search ────────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)  // 0-based
  const [findTotal, setFindTotal] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Open the find bar (or re-focus it) whenever App fires a Cmd+F nonce.
  useEffect(() => {
    if (findNonce == null) return
    setFindOpen(true)
  }, [findNonce])

  // Reset navigation index when query or tab changes; query is kept across tabs.
  useEffect(() => { setFindIndex(0) }, [findQuery, tab])

  // ── Subscription grouping ─────────────────────────────────────────────────
  const [groupBySubscription, setGroupBySubscription] = useState(false)
  const isStreamTab = tab === 'messages' || tab === 'eventstream'
  const groups = useMemo(() => {
    if (!groupBySubscription || !request.frames?.length) return null
    return buildGroups(request.frames)
  }, [groupBySubscription, request.frames])

  // ── Frame-level match indices (Messages/EventStream) ──────────────────────
  const frameMatchIndices = useMemo(() => {
    if (!findQuery || !isStreamTab || !request.frames) return []
    return request.frames
      .map((f, i) => (findMatches(f.data, findQuery).length > 0 ? i : -1))
      .filter(i => i !== -1)
  }, [findQuery, isStreamTab, request.frames])

  // After each paint: count DOM marks (non-frame tabs) or frame matches (frame tab).
  useLayoutEffect(() => {
    if (!findOpen || !findQuery) { setFindTotal(0); return }
    if (isStreamTab) {
      setFindTotal(frameMatchIndices.length)
    } else {
      const n = contentRef.current?.querySelectorAll('[data-find-mark]').length ?? 0
      setFindTotal(n)
    }
  })

  // Scroll active match into view whenever index or total changes.
  useEffect(() => {
    if (!findOpen || !findQuery || findTotal === 0) return

    if (isStreamTab) {
      const safeIdx = ((findIndex % findTotal) + findTotal) % findTotal
      const frameIdx = frameMatchIndices[safeIdx]
      if (frameIdx !== undefined) {
        virtuosoRef.current?.scrollToIndex({ index: frameIdx, behavior: 'smooth' })
      }
    } else {
      if (!contentRef.current) return
      const marks = Array.from(contentRef.current.querySelectorAll<HTMLElement>('[data-find-mark]'))
      if (!marks.length) return
      const safeIdx = ((findIndex % marks.length) + marks.length) % marks.length
      marks.forEach((el, i) => el.classList.toggle('find-mark-active', i === safeIdx))
      marks[safeIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [findOpen, findQuery, findIndex, findTotal, isStreamTab, frameMatchIndices])

  const onFindNext = () => setFindIndex(i => (i + 1) % Math.max(1, findTotal))
  const onFindPrev = () => setFindIndex(i => (i - 1 + Math.max(1, findTotal)) % Math.max(1, findTotal))

  // ── Tab availability ──────────────────────────────────────────────────────
  const tabExists = (t: Tab): boolean => {
    if (t === 'messages')    return isWsLike
    if (t === 'eventstream') return isSse
    if (t === 'headers')     return !((isWsLike || isEventSourceSse) && !request.har)
    if (t === 'query' || t === 'variables') return c.type === 'graphql'
    if (t === 'response')    return !hasStream
    return false
  }

  useEffect(() => {
    if (!tabExists(tab)) {
      setTab(isWsLike ? 'messages' : isSse ? 'eventstream' : 'response')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.transport])

  // Jump to the tab that contains a global search hit.
  useEffect(() => {
    if (!jump) return
    const loc = jump.location
    let target: Tab
    if (loc.kind === 'operationName' || loc.kind === 'query') target = 'query'
    else if (loc.kind === 'url') target = 'headers'
    else if (loc.kind === 'variables' || loc.kind === 'requestBody') target = 'variables'
    else if (loc.kind === 'responseBody') target = 'response'
    else if (loc.kind === 'frame') target = isWsLike ? 'messages' : 'eventstream'
    else return
    if (tabExists(target)) setTab(target)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.nonce])

  const frameCount = request.frames?.length ?? 0
  const tabs: { id: Tab; label: string }[] = [
    ...((isWsLike || isEventSourceSse) && !request.har ? [] : [{ id: 'headers' as Tab, label: 'Headers' }]),
    ...(c.type === 'graphql'
      ? [{ id: 'query' as Tab, label: 'Query' }, { id: 'variables' as Tab, label: 'Variables' }]
      : []),
    ...(isWsLike
      ? [{ id: 'messages' as Tab, label: `Messages${frameCount > 0 ? ` (${frameCount})` : ''}` }]
      : isSse
        ? [{ id: 'eventstream' as Tab, label: `EventStream${frameCount > 0 ? ` (${frameCount})` : ''}` }]
        : [{ id: 'response' as Tab, label: 'Response' }]
    ),
  ]

  const url = request.url
  const opLabel = (() => {
    if (isBatch) return `BATCH (${request.operations!.length} operations)`
    if (c.type === 'graphql') return `${c.operationType?.toUpperCase() ?? 'GQL'} ${c.operationName ?? 'anonymous'}`
    return null
  })()

  const connStateBadge = hasStream
    ? ({
        pending: { label: 'Connecting', cls: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30' },
        open:    { label: 'Open',       cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
        closed:  { label: 'Closed',     cls: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30' },
        error:   { label: 'Error',      cls: 'bg-destructive/15 text-destructive border-destructive/30' },
        finished:{ label: 'Closed',     cls: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30' },
      } as Record<string, { label: string; cls: string }>)[request.state]
    : null

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden min-w-0">
      {/* ── Header band ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border shrink-0">
        <div className="flex flex-col min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-2 min-w-0">
            <TypeAvatar req={request} variant="inline" />
            <span
              className="text-xs font-mono text-foreground overflow-hidden text-ellipsis whitespace-nowrap"
              title={url}
            >
              {url}
            </span>
            {connStateBadge && (
              <span className={clsx(
                'shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                connStateBadge.cls
              )}>
                {connStateBadge.label}
              </span>
            )}
          </div>
          {opLabel && (
            <span
              className="text-xs text-muted-foreground font-mono overflow-hidden text-ellipsis whitespace-nowrap"
              title={opLabel}
            >
              {opLabel}
            </span>
          )}
        </div>
        <CopyMenu request={request} />
        <button
          onClick={onClose}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer shrink-0"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* ── Pill tab band ─────────────────────────────────────────────────── */}
      {tabs.length > 1 && (
        <div className="flex items-center px-3 py-1.5 bg-card border-b border-border shrink-0">
          <div className="inline-flex h-7 items-center gap-0.5 rounded-md bg-muted p-0.5">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'inline-flex items-center rounded-sm px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer border-none',
                  tab === t.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div
        ref={contentRef}
        className={clsx(
          'flex-1 min-h-0',
          isStreamTab ? 'flex flex-col overflow-hidden' :
          tab === 'headers' ? 'overflow-y-auto p-3 space-y-3' :
          'flex flex-col overflow-hidden p-3 gap-2'
        )}
      >

        {/* ── Query ───────────────────────────────────────────────────────── */}
        {tab === 'query' && (
          isBatch ? (
            <BatchQueryTab
              operations={request.operations!}
              requestId={request.id}
              findQuery={findQuery}
            />
          ) : c.query ? (
            <>
              <div className="flex items-center justify-between shrink-0">
                <SectionLabel>GraphQL</SectionLabel>
                <CopyIconButton text={c.query} title="Copy query" />
              </div>
              <div className="bg-muted/40 rounded-md p-2 overflow-x-auto overflow-y-auto flex-1 min-h-0">
                {findQuery
                  ? <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground m-0">
                      <Highlighted text={c.query} query={findQuery} />
                    </pre>
                  : <HighlightedCode code={c.query} language="graphql" />
                }
              </div>
            </>
          ) : null
        )}

        {/* ── Variables ───────────────────────────────────────────────────── */}
        {tab === 'variables' && (
          isBatch ? (
            <BatchVariablesTab
              operations={request.operations!}
              requestId={request.id}
              findQuery={findQuery}
            />
          ) : (
            c.variables !== undefined ? (
              <>
                <div className="flex items-center justify-between shrink-0">
                  <SectionLabel>JSON</SectionLabel>
                  <CopyIconButton text={JSON.stringify(c.variables, null, 2)} title="Copy variables" />
                </div>
                <div className="bg-muted/40 rounded-md p-2 overflow-x-auto overflow-y-auto flex-1 min-h-0">
                  <JsonTree
                    data={c.variables}
                    cacheKey={`${request.id}:vars`}
                    search={findQuery || undefined}
                  />
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No variables</span>
            )
          )
        )}

        {/* ── Messages / EventStream ───────────────────────────────────────── */}
        {isStreamTab && (
          <>
            {(request.frames?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 border-b border-border shrink-0 bg-card">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={groupBySubscription}
                    onChange={e => setGroupBySubscription(e.target.checked)}
                    className="accent-primary cursor-pointer"
                  />
                  <span className={groupBySubscription ? 'text-foreground' : ''}>Group by subscription</span>
                </label>
              </div>
            )}

            {!request.frames?.length ? (
              <div className="p-3 text-xs text-muted-foreground italic">
                {request.state === 'pending'
                  ? 'Waiting for connection…'
                  : tab === 'messages' ? 'No messages yet' : 'No events yet'}
              </div>
            ) : groups ? (
              /* Grouped view */
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {groups.map(group => (
                  <CollapsibleSection
                    key={group.key}
                    title={group.label}
                    action={
                      <span className="text-[10px] text-muted-foreground shrink-0 mr-1">
                        {group.subLabel && <span className="font-mono mr-1">{group.subLabel}</span>}
                        {group.frames.length} {group.frames.length === 1 ? 'event' : 'events'}
                      </span>
                    }
                  >
                    <div className="-ml-3">
                      {group.frames.map(({ frame, index }) => (
                        <FrameRow
                          key={index}
                          frame={frame}
                          requestId={request.id}
                          search={findQuery || undefined}
                        />
                      ))}
                    </div>
                  </CollapsibleSection>
                ))}
              </div>
            ) : (
              /* Flat virtualized view */
              <Virtuoso
                ref={virtuosoRef}
                style={{ flex: 1 }}
                totalCount={request.frames.length}
                itemContent={i => {
                  const frame = request.frames![i]
                  if (!frame) return null
                  return (
                    <FrameRow
                      key={i}
                      frame={frame}
                      requestId={request.id}
                      search={findQuery || undefined}
                    />
                  )
                }}
              />
            )}
          </>
        )}

        {/* ── Response ────────────────────────────────────────────────────── */}
        {tab === 'response' && (
          <>
            <div className="flex items-center justify-between shrink-0">
              <SectionLabel>Body</SectionLabel>
              {!isPending && (
                <CopyIconButton
                  text={responseJson !== undefined
                    ? JSON.stringify(responseJson, null, 2)
                    : (responseBody ?? '')}
                  title="Copy response"
                />
              )}
            </div>
            <div className="bg-muted/40 rounded-md p-2 overflow-x-auto overflow-y-auto flex-1 min-h-0">
              {isPending
                ? <span className="text-xs text-muted-foreground italic">Waiting for response…</span>
                : responseJson !== undefined
                  ? <JsonTree
                      data={responseJson}
                      cacheKey={`${request.id}:response`}
                      search={findQuery || undefined}
                    />
                  : <pre className="font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap break-all m-0">
                      {findQuery
                        ? <Highlighted text={responseBody ?? '(empty)'} query={findQuery} />
                        : (responseBody ?? '(empty)')
                      }
                    </pre>
              }
            </div>
          </>
        )}

        {/* ── Headers ─────────────────────────────────────────────────────── */}
        {tab === 'headers' && (
          !har ? (
            <span className="text-xs text-muted-foreground italic">
              {request.state === 'pending' ? 'Waiting for response…' : 'Headers not available'}
            </span>
          ) : (
            <div className="space-y-3">
              <CollapsibleSection title="General">
                <InfoRow label="Request URL">
                  <Highlighted text={har.request.url} query={findQuery} />
                </InfoRow>
                <InfoRow label="Request Method">{har.request.method}</InfoRow>
                <InfoRow label="Status Code">
                  <span className={clsx('inline-flex items-center', statusColorClass(har.response.status))}>
                    <StatusDot code={har.response.status} />
                    {har.response.status} {har.response.statusText}
                  </span>
                </InfoRow>
                {(har as { _serverIPAddress?: string })._serverIPAddress && (
                  <InfoRow label="Remote Address">
                    {(har as { _serverIPAddress?: string })._serverIPAddress}
                  </InfoRow>
                )}
                <InfoRow label="Duration">{request.duration}ms</InfoRow>
                {har.response.content?.size != null && (
                  <InfoRow label="Response Size">{har.response.content.size} bytes</InfoRow>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Response Headers"
                action={<CopyIconButton text={headersText(har.response.headers)} title="Copy response headers" />}
              >
                <HeadersGrid headers={har.response.headers} findQuery={findQuery} />
              </CollapsibleSection>

              <CollapsibleSection
                title="Request Headers"
                action={<CopyIconButton text={headersText(har.request.headers)} title="Copy request headers" />}
              >
                <HeadersGrid headers={har.request.headers} findQuery={findQuery} />
              </CollapsibleSection>
            </div>
          )
        )}

      </div>

      {/* ── Find bar — floating bottom-right overlay ───────────────────────── */}
      {findOpen && (
        <div className="absolute bottom-3 right-3 z-20">
          <DetailFindBar
            query={findQuery}
            currentIndex={findTotal === 0 ? 0 : ((findIndex % findTotal) + findTotal) % findTotal + 1}
            total={findTotal}
            focusTrigger={findNonce}
            onChange={q => { setFindQuery(q); setFindIndex(0) }}
            onPrev={onFindPrev}
            onNext={onFindNext}
            onClose={() => { setFindOpen(false); setFindQuery('') }}
          />
        </div>
      )}
    </div>
  )
}
