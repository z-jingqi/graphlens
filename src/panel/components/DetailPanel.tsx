import { useState, useEffect } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { CapturedRequest, CapturedFrame } from '../lib/types'
import type { SearchLocation } from '../search/types'
import { JsonTree } from './JsonTree'
import { CopyMenu } from './CopyMenu'
import { CopyIconButton } from './CopyIconButton'
import { HighlightedCode } from './HighlightedCode'
import { TypeAvatar } from './TypeAvatar'
import clsx from 'clsx'

type Tab = 'query' | 'variables' | 'response' | 'headers' | 'messages' | 'eventstream'

interface Props {
  request: CapturedRequest
  onClose: () => void
  jump?: { location: SearchLocation; nonce: number }
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

function HeadersGrid({ headers }: { headers: { name: string; value: string }[] }) {
  if (headers.length === 0) {
    return <span className="text-xs text-muted-foreground italic">(none)</span>
  }
  return (
    <div className="grid gap-x-3 gap-y-0" style={{ gridTemplateColumns: '160px 1fr' }}>
      {headers.map((h, i) => (
        <div key={i} className="contents">
          <div className="py-0.5 text-xs font-mono json-key truncate" title={h.name}>
            {h.name}
          </div>
          <div className="py-0.5 text-xs font-mono text-foreground break-all whitespace-pre-wrap">
            {h.value}
          </div>
        </div>
      ))}
    </div>
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

function FrameRow({ frame }: { frame: CapturedFrame }) {
  const isSend = frame.direction === 'send'
  const [expanded, setExpanded] = useState(false)
  const time = new Date(frame.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
  const preview = frame.data.length > 120 ? frame.data.slice(0, 120) + '…' : frame.data
  const isJson = (() => { try { JSON.parse(frame.data); return true } catch { return false } })()

  return (
    <div
      className={clsx(
        'px-3 py-1.5 border-b border-border/40 cursor-pointer hover:bg-accent transition-colors text-xs',
        isSend ? 'border-l-2 border-l-blue-400' : 'border-l-2 border-l-emerald-400'
      )}
      onClick={() => setExpanded(e => !e)}
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
        <span className="text-muted-foreground truncate min-w-0">{preview}</span>
        <span className="text-muted-foreground/60 font-mono shrink-0 ml-auto">{frame.data.length}B</span>
      </div>
      {expanded && (
        <div className="mt-1.5 bg-muted/40 rounded-md p-2 overflow-x-auto">
          {isJson
            ? <JsonTree data={JSON.parse(frame.data)} />
            : <pre className="font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap break-all">{frame.data}</pre>
          }
        </div>
      )}
    </div>
  )
}

export function DetailPanel({ request, onClose, jump }: Props) {
  const { classification: c, har, responseJson, responseBody } = request
  const isWsLike = request.transport === 'websocket'
  const isSse = request.transport === 'sse'
  // fetch-based SSE keeps graphql classification; EventSource SSE has type='sse'
  const isEventSourceSse = isSse && c.type !== 'graphql'
  const hasStream = isWsLike || isSse

  const [tab, setTab] = useState<Tab>(
    isWsLike ? 'messages' : isSse ? 'eventstream' : 'response'
  )
  const isPending = !har && request.state === 'pending'

  const tabExists = (t: Tab): boolean => {
    if (t === 'messages')    return isWsLike
    if (t === 'eventstream') return isSse
    // WS and EventSource-SSE hide headers until HAR arrives (no useful HTTP data before that)
    if (t === 'headers')     return !((isWsLike || isEventSourceSse) && !request.har)
    if (t === 'query' || t === 'variables') return c.type === 'graphql'
    if (t === 'response')    return !hasStream
    return false
  }

  // When switching requests (or when transport flips, e.g. sse-start), keep the current tab
  // if it exists on the new request shape; otherwise fall back to the sensible default.
  useEffect(() => {
    if (!tabExists(tab)) {
      setTab(isWsLike ? 'messages' : isSse ? 'eventstream' : 'response')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.transport])

  // Jump to the tab that contains a search hit when requested.
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
    // WS and EventSource-SSE: hide Headers until HAR arrives; fetch-SSE always shows Headers
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
  const opLabel =
    c.type === 'graphql'
      ? `${c.operationType?.toUpperCase() ?? 'GQL'} ${c.operationName ?? 'anonymous'}`
      : null

  const connStateBadge = hasStream
    ? ({
        pending: { label: 'Connecting', cls: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30' },
        open:    { label: 'Open',       cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
        closed:  { label: 'Closed',     cls: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30' },
        error:   { label: 'Error',      cls: 'bg-destructive/15 text-destructive border-destructive/30' },
        finished:{ label: 'Closed',     cls: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30' },
      } as Record<string, { label: string; cls: string }>)[request.state]
    : null

  const isStreamTab = tab === 'messages' || tab === 'eventstream'

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0">
      {/* Header band */}
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
          className={clsx(
            'h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer shrink-0'
          )}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* Pill tab band — hidden when only one tab (nothing to switch between) */}
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

      {/* Content */}
      <div className={clsx(
        'flex-1 min-h-0',
        isStreamTab ? 'flex flex-col overflow-hidden' :
        tab === 'headers' ? 'overflow-y-auto p-3 space-y-3' :
        'flex flex-col overflow-hidden p-3 gap-2'
      )}>

        {tab === 'query' && c.query && (
          <>
            <div className="flex items-center justify-between shrink-0">
              <SectionLabel>GraphQL</SectionLabel>
              <CopyIconButton text={c.query} title="Copy query" />
            </div>
            <div className="bg-muted/40 rounded-md p-2 overflow-x-auto overflow-y-auto flex-1 min-h-0">
              <HighlightedCode code={c.query} language="graphql" />
            </div>
          </>
        )}

        {tab === 'variables' && (
          c.variables !== undefined ? (
            <>
              <div className="flex items-center justify-between shrink-0">
                <SectionLabel>JSON</SectionLabel>
                <CopyIconButton text={JSON.stringify(c.variables, null, 2)} title="Copy variables" />
              </div>
              <div className="bg-muted/40 rounded-md p-2 overflow-x-auto overflow-y-auto flex-1 min-h-0">
                <JsonTree data={c.variables} />
              </div>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No variables</span>
          )
        )}

        {/* Messages (WS) and EventStream (SSE) share the same Virtuoso frame list */}
        {isStreamTab && (
          !request.frames?.length
            ? <div className="p-3 text-xs text-muted-foreground italic">
                {request.state === 'pending'
                  ? 'Waiting for connection…'
                  : tab === 'messages' ? 'No messages yet' : 'No events yet'}
              </div>
            : <Virtuoso
                style={{ flex: 1 }}
                totalCount={request.frames.length}
                itemContent={i => {
                  const frame = request.frames![i]
                  if (!frame) return null
                  return <FrameRow key={i} frame={frame} />
                }}
              />
        )}

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
                  ? <JsonTree data={responseJson} />
                  : <pre className="font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap break-all">{responseBody ?? '(empty)'}</pre>
              }
            </div>
          </>
        )}

        {tab === 'headers' && (
          !har ? (
            <span className="text-xs text-muted-foreground italic">
              {request.state === 'pending' ? 'Waiting for response…' : 'Headers not available'}
            </span>
          ) : (
          <div className="space-y-3">
            <CollapsibleSection title="General">
              <InfoRow label="Request URL">{har.request.url}</InfoRow>
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
              <HeadersGrid headers={har.response.headers} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Request Headers"
              action={<CopyIconButton text={headersText(har.request.headers)} title="Copy request headers" />}
            >
              <HeadersGrid headers={har.request.headers} />
            </CollapsibleSection>
          </div>
          )
        )}

      </div>
    </div>
  )
}
