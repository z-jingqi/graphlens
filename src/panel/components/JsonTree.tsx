import { useState, useEffect, useLayoutEffect, useRef, createContext, useContext, useMemo } from 'react'
import clsx from 'clsx'
import { copyToClipboard } from '../lib/copy'
import { getCollapsed, setCollapsed as cacheSetCollapsed } from '../lib/jsonCollapseCache'
import { Highlighted } from './Highlighted'
import { findMatches } from '../search/match'

const STR_MAX = 100
const SNIPPET_CTX = 30
const ARRAY_GROUP_THRESHOLD = 50
const ARRAY_GROUP_SIZE = 50

function getDisplayString(
  data: string,
  findQuery: string,
): { display: string; before: boolean; after: boolean } {
  if (!findQuery || data.length <= STR_MAX) {
    return { display: data.slice(0, STR_MAX), before: false, after: data.length > STR_MAX }
  }
  const matches = findMatches(data, findQuery)
  if (!matches.length) {
    return { display: data.slice(0, STR_MAX), before: false, after: data.length > STR_MAX }
  }
  // Build a window that covers both the match START and END plus context on each side.
  // This handles: match beyond truncation point, match spanning the truncation boundary,
  // and match at the start whose end exceeds STR_MAX (e.g. searching the full string value).
  const { start, end } = matches[0]
  const from = Math.max(0, start - SNIPPET_CTX)
  const to   = Math.min(data.length, Math.max(end + SNIPPET_CTX, from + STR_MAX))
  return { display: data.slice(from, to), before: from > 0, after: to < data.length }
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface MenuState {
  x: number
  y: number
  value: unknown
  path: string
}

interface MenuCtxValue {
  openMenu: (e: React.MouseEvent, value: unknown, path: string) => void
}

const MenuCtx = createContext<MenuCtxValue>({ openMenu: () => {} })

// ── Collapse cache context ────────────────────────────────────────────────────

const CollapseCtx = createContext<string | undefined>(undefined)

// ── Find / search context ─────────────────────────────────────────────────────

interface FindCtxValue {
  query: string
  expandToken?: string | number
  searchIndex: SearchIndex
}

interface SearchIndex {
  matchedSubtreePaths: Set<string>
  matchCountByPath: Map<string, number>
  keyMatchCountByPath: Map<string, number>
}

function emptySearchIndex(): SearchIndex {
  return {
    matchedSubtreePaths: new Set(),
    matchCountByPath: new Map(),
    keyMatchCountByPath: new Map(),
  }
}

const FindCtx = createContext<FindCtxValue>({ query: '', searchIndex: emptySearchIndex() })

function primitiveText(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function buildChildPath(parentPath: string, key: string, isIndex: boolean): string {
  if (isIndex) return `${parentPath}[${key}]`
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return parentPath ? `${parentPath}.${key}` : key
  return `${parentPath}["${key.replace(/"/g, '\\"')}"]`
}

function buildArrayGroupPath(parentPath: string, start: number, end: number): string {
  return `${parentPath}[${start}..${end}]`
}

function createTextMatcher(query: string): (text: string) => boolean {
  const regexMatch = query.match(/^\/(.+)\/([gimsuy]*)$/)
  if (regexMatch) {
    try {
      const flags = (regexMatch[2] || '').replace(/g/g, '')
      const re = new RegExp(regexMatch[1], flags)
      return (text: string) => re.test(text)
    } catch {
      // invalid regex — fall through to substring
    }
  }

  const q = query.toLowerCase()
  return (text: string) => text.toLowerCase().includes(q)
}

function buildSearchIndex(data: unknown, query: string): SearchIndex {
  const searchIndex = emptySearchIndex()
  const { matchedSubtreePaths, matchCountByPath, keyMatchCountByPath } = searchIndex
  if (!query) return searchIndex

  const matchesText = createTextMatcher(query)
  const seen = new WeakSet<object>()

  const addMatchPath = (ancestors: string[], path: string, count: number) => {
    ancestors.forEach(p => {
      matchedSubtreePaths.add(p)
      matchCountByPath.set(p, (matchCountByPath.get(p) ?? 0) + count)
    })
    matchedSubtreePaths.add(path)
    matchCountByPath.set(path, (matchCountByPath.get(path) ?? 0) + count)
  }

  const visit = (value: unknown, path: string, ancestors: string[]): boolean => {
    if (value === null || typeof value !== 'object') {
      const text = typeof value === 'string'
        ? getDisplayString(value, query).display
        : primitiveText(value)
      const count = findMatches(text, query).length
      if (count === 0) return false
      addMatchPath(ancestors, path, count)
      return true
    }

    if (seen.has(value)) return false
    seen.add(value)

    let hasMatch = false
    if (Array.isArray(value)) {
      const grouped = value.length > ARRAY_GROUP_THRESHOLD
      value.forEach((child, i) => {
        const childPath = buildChildPath(path, String(i), true)
        const childAncestors = grouped
          ? [
              ...ancestors,
              path,
              buildArrayGroupPath(
                path,
                Math.floor(i / ARRAY_GROUP_SIZE) * ARRAY_GROUP_SIZE,
                Math.min(value.length - 1, Math.floor(i / ARRAY_GROUP_SIZE) * ARRAY_GROUP_SIZE + ARRAY_GROUP_SIZE - 1)
              ),
            ]
          : [...ancestors, path]
        if (visit(child, childPath, childAncestors)) hasMatch = true
      })
    } else {
      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        const childPath = buildChildPath(path, key, false)
        if (matchesText(key)) {
          const count = findMatches(key, query).length
          keyMatchCountByPath.set(childPath, count)
          addMatchPath(ancestors, childPath, count)
          hasMatch = true
        }
        if (visit(child, childPath, [...ancestors, path])) hasMatch = true
      })
    }

    if (hasMatch) matchedSubtreePaths.add(path)
    return hasMatch
  }

  visit(data, '', [])
  return searchIndex
}

function HiddenFindMarks({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="sr-only" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <mark key={i} data-find-mark />
      ))}
    </span>
  )
}

function JsonContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
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

  const copy = (text: string) => { copyToClipboard(text); onClose() }

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999 }}
      className="bg-popover border border-border rounded-md shadow-lg overflow-hidden py-1 min-w-44"
    >
      <button
        onClick={() => copy(primitiveText(menu.value))}
        className="block w-full px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer whitespace-nowrap"
      >
        Copy value
      </button>
      {menu.path && (
        <button
          onClick={() => copy(menu.path)}
          className="block w-full px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer whitespace-nowrap"
        >
          Copy property path
        </button>
      )}
    </div>
  )
}

// ── Triangle icon ─────────────────────────────────────────────────────────────

function Triangle({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10"
      className={clsx('transition-transform shrink-0 text-muted-foreground', open ? 'rotate-90' : '')}
      fill="currentColor"
    >
      <path d="M3 1 L7 5 L3 9 Z" />
    </svg>
  )
}

// ── Node ──────────────────────────────────────────────────────────────────────

interface NodeProps {
  data: unknown
  depth: number
  path: string
  keyLabel?: string
  comma?: boolean
}

function isExpandable(val: unknown): boolean {
  if (val === null || typeof val !== 'object') return false
  if (Array.isArray(val)) return val.length > 0
  return Object.keys(val as object).length > 0
}

function renderKeyLabel(label: string, isIdx: boolean, findQuery: string) {
  if (isIdx) {
    return (
      <><span className="text-muted-foreground">{label}</span><span className="text-muted-foreground">:&nbsp;</span></>
    )
  }
  return (
    <><span className="json-key">&quot;{findQuery ? <Highlighted text={label} query={findQuery} /> : label}&quot;</span><span className="text-muted-foreground">:&nbsp;</span></>
  )
}

function JsonEntry({
  entryKey,
  val,
  parentPath,
  depth,
  comma,
}: {
  entryKey: string
  val: unknown
  parentPath: string
  depth: number
  comma: boolean
}) {
  const { openMenu } = useContext(MenuCtx)
  const { query: findQuery } = useContext(FindCtx)
  const isIndex = /^\d+$/.test(entryKey)
  const kPath = buildChildPath(parentPath, entryKey, isIndex)

  if (isExpandable(val)) {
    return (
      <JsonNode
        data={val}
        depth={depth}
        path={kPath}
        keyLabel={entryKey}
        comma={comma}
      />
    )
  }

  return (
    <div
      className="flex items-center gap-0 h-[25px] rounded hover:bg-accent/50 -mx-1 px-1 cursor-default"
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(e, val, kPath) }}
    >
      <span className="w-3.5 shrink-0" />
      {renderKeyLabel(entryKey, isIndex, findQuery)}
      <JsonNode data={val} depth={depth} path={kPath} />
      {comma && <span className="text-muted-foreground">,</span>}
    </div>
  )
}

function JsonArrayRange({
  array,
  start,
  end,
  parentPath,
  itemDepth,
  comma,
}: {
  array: unknown[]
  start: number
  end: number
  parentPath: string
  itemDepth: number
  comma: boolean
}) {
  const { openMenu } = useContext(MenuCtx)
  const cacheKey = useContext(CollapseCtx)
  const { query: findQuery, expandToken, searchIndex } = useContext(FindCtx)
  const rangePath = buildArrayGroupPath(parentPath, start, end)
  const [collapsed, setCollapsed] = useState(() =>
    cacheKey ? getCollapsed(cacheKey, rangePath, 3) : true
  )
  const rangeHasMatch = searchIndex.matchedSubtreePaths.has(rangePath)
  const hiddenMatchCount = searchIndex.matchCountByPath.get(rangePath) ?? 0

  useLayoutEffect(() => {
    if (rangeHasMatch) setCollapsed(false)
  }, [rangeHasMatch, expandToken, findQuery])

  const toggle = () => setCollapsed(c => {
    const next = !c
    if (cacheKey) cacheSetCollapsed(cacheKey, rangePath, next)
    return next
  })
  const ctxMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openMenu(e, array.slice(start, end + 1), rangePath)
  }

  const label = `[${start}…${end}]`
  const count = end - start + 1

  return (
    <div>
      <div
        className="flex items-center gap-1 h-[25px] cursor-pointer rounded hover:bg-accent/50 -mx-1 px-1"
        onClick={toggle}
        onContextMenu={ctxMenu}
      >
        <Triangle open={!collapsed} />
        <span className="text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground/60">
          {count} item{count !== 1 ? 's' : ''}
        </span>
        {collapsed && <HiddenFindMarks count={hiddenMatchCount} />}
        {collapsed && comma && <span className="text-muted-foreground">,</span>}
      </div>
      {!collapsed && (
        <div className="pl-4">
          {array.slice(start, end + 1).map((val, offset) => {
            const i = start + offset
            return (
              <JsonEntry
                key={i}
                entryKey={String(i)}
                val={val}
                parentPath={parentPath}
                depth={itemDepth}
                comma={i < array.length - 1}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function JsonNode({ data, depth, path, keyLabel, comma = false }: NodeProps) {
  const { openMenu } = useContext(MenuCtx)
  const cacheKey = useContext(CollapseCtx)
  const { query: findQuery, expandToken, searchIndex } = useContext(FindCtx)

  const [collapsed, setCollapsed] = useState(() =>
    cacheKey ? getCollapsed(cacheKey, path, depth) : depth > 2
  )
  const toggle = () => setCollapsed(c => {
    const next = !c
    if (cacheKey) cacheSetCollapsed(cacheKey, path, next)
    return next
  })

  // When find navigation highlights a match in this subtree, expand once.
  // The current search should not keep overriding a user's manual collapse.
  const subtreeHasMatch = isExpandable(data) && searchIndex.matchedSubtreePaths.has(path)
  const hiddenMatchCount = Math.max(
    0,
    (searchIndex.matchCountByPath.get(path) ?? 0) - (searchIndex.keyMatchCountByPath.get(path) ?? 0)
  )

  // Search-driven expansion is local UI state only; user toggles still own the
  // persisted collapse cache.
  useLayoutEffect(() => {
    if (subtreeHasMatch) setCollapsed(false)
  }, [subtreeHasMatch, expandToken, findQuery])

  const ctxMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openMenu(e, data, path)
  }

  // ── Primitives ────────────────────────────────────────────────────────────
  if (data === null) return (
    <span className="json-null">
      {findQuery ? <Highlighted text="null" query={findQuery} /> : 'null'}
    </span>
  )
  if (typeof data === 'boolean') return (
    <span className="json-bool">
      {findQuery ? <Highlighted text={String(data)} query={findQuery} /> : String(data)}
    </span>
  )
  if (typeof data === 'number') return (
    <span className="json-num">
      {findQuery ? <Highlighted text={String(data)} query={findQuery} /> : data}
    </span>
  )
  if (typeof data === 'string') {
    const { display, before, after } = getDisplayString(data, findQuery)
    return (
      <span className="json-str">
        &quot;
        {before && <span className="text-muted-foreground/60">…</span>}
        {findQuery ? <Highlighted text={display} query={findQuery} /> : display}
        {after  && <span className="text-muted-foreground/60">…</span>}
        &quot;
        {data.length > STR_MAX && (
          <span className="text-muted-foreground/60 text-[10px] ml-1">{data.length.toLocaleString()} chars</span>
        )}
      </span>
    )
  }

  // ── Arrays and Objects ───────────────────────────────────────────────────
  const isArr = Array.isArray(data)
  const entries: [string, unknown][] = isArr
    ? (data as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(data as Record<string, unknown>)

  const openBr = isArr ? '[' : '{'
  const closeBr = isArr ? ']' : '}'
  const count = entries.length
  const summary = isArr
    ? `${count} item${count !== 1 ? 's' : ''}`
    : `${count} key${count !== 1 ? 's' : ''}`

  if (count === 0) {
    return (
      <>
        {keyLabel !== undefined && (
          <><span className="json-key">&quot;{keyLabel}&quot;</span><span className="text-muted-foreground">: </span></>
        )}
        <span className="text-muted-foreground">{openBr}{closeBr}</span>
        {comma && <span className="text-muted-foreground">,</span>}
      </>
    )
  }

  // ── Collapsed ─────────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        className="flex items-center gap-1 h-[25px] cursor-pointer rounded hover:bg-accent/50 -mx-1 px-1"
        onClick={toggle}
        onContextMenu={ctxMenu}
      >
        <Triangle open={false} />
        {keyLabel !== undefined && renderKeyLabel(keyLabel, /^\d+$/.test(keyLabel), findQuery)}
        <span className="text-muted-foreground">
          {openBr}<span className="text-[10px]">…</span>{closeBr}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{summary}</span>
        <HiddenFindMarks count={hiddenMatchCount} />
        {comma && <span className="text-muted-foreground">,</span>}
      </div>
    )
  }

  // ── Expanded ──────────────────────────────────────────────────────────────
  return (
    <div>
      <div
        className="flex items-center gap-1 h-[25px] cursor-pointer rounded hover:bg-accent/50 -mx-1 px-1"
        onClick={toggle}
        onContextMenu={ctxMenu}
      >
        <Triangle open={true} />
        {keyLabel !== undefined && renderKeyLabel(keyLabel, /^\d+$/.test(keyLabel), findQuery)}
        <span className="text-muted-foreground">{openBr}</span>
        <span className="text-[10px] text-muted-foreground/60">{summary}</span>
      </div>

      <div className="pl-4">
        {isArr && count > ARRAY_GROUP_THRESHOLD
          ? Array.from({ length: Math.ceil(count / ARRAY_GROUP_SIZE) }, (_, groupIndex) => {
              const start = groupIndex * ARRAY_GROUP_SIZE
              const end = Math.min(count - 1, start + ARRAY_GROUP_SIZE - 1)
              return (
                <JsonArrayRange
                  key={`${start}-${end}`}
                  array={data as unknown[]}
                  start={start}
                  end={end}
                  parentPath={path}
                  itemDepth={depth + 1}
                  comma={end < count - 1}
                />
              )
            })
          : entries.map(([key, val], i) => (
            <JsonEntry
              key={key}
              entryKey={key}
              val={val}
              parentPath={path}
              depth={depth + 1}
              comma={i < entries.length - 1}
            />
          ))}
      </div>

      <div className="flex items-center h-[25px]" onContextMenu={ctxMenu}>
        <span className="text-muted-foreground">{closeBr}</span>
        {comma && <span className="text-muted-foreground">,</span>}
      </div>
    </div>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────

export function JsonTree({
  data,
  cacheKey,
  search,
  searchExpandToken,
}: {
  data: unknown
  cacheKey?: string
  search?: string
  searchExpandToken?: string | number
}) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const searchIndex = useMemo(
    () => buildSearchIndex(data, search ?? ''),
    [data, search]
  )

  const openMenu = (e: React.MouseEvent, value: unknown, path: string) => {
    setMenu({ x: e.clientX, y: e.clientY, value, path })
  }

  return (
    <MenuCtx.Provider value={{ openMenu }}>
      <CollapseCtx.Provider value={cacheKey}>
        <FindCtx.Provider value={{ query: search ?? '', expandToken: searchExpandToken, searchIndex }}>
          <div className="font-mono text-xs leading-6">
            <JsonNode key={cacheKey} data={data} depth={0} path="" />
          </div>
        </FindCtx.Provider>
      </CollapseCtx.Provider>
      {menu && <JsonContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </MenuCtx.Provider>
  )
}
