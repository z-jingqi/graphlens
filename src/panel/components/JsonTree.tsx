import { useState, useEffect, useRef, createContext, useContext, useMemo } from 'react'
import clsx from 'clsx'
import { copyToClipboard } from '../lib/copy'
import { getCollapsed, setCollapsed as cacheSetCollapsed } from '../lib/jsonCollapseCache'
import { Highlighted } from './Highlighted'
import { dataContains } from '../search/match'

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

// ── Find / search context (query string, empty = inactive) ────────────────────

const FindCtx = createContext<string>('')

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

function JsonNode({ data, depth, path, keyLabel, comma = false }: NodeProps) {
  const { openMenu } = useContext(MenuCtx)
  const cacheKey = useContext(CollapseCtx)
  const findQuery = useContext(FindCtx)

  const [collapsed, setCollapsed] = useState(() =>
    cacheKey ? getCollapsed(cacheKey, path, depth) : depth > 2
  )
  const toggle = () => setCollapsed(c => {
    const next = !c
    if (cacheKey) cacheSetCollapsed(cacheKey, path, next)
    return next
  })

  // When find is active and this node's subtree contains a match, force-expand it.
  const subtreeHasMatch = useMemo(() => {
    if (!findQuery || !isExpandable(data)) return false
    return dataContains(data, findQuery)
  }, [findQuery, data])

  const effectiveCollapsed = collapsed && !subtreeHasMatch

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
    const truncated = data.length > 100
    const display = truncated ? data.slice(0, 100) : data
    return (
      <span className="json-str">
        &quot;{findQuery ? <Highlighted text={display} query={findQuery} /> : display}&quot;
        {truncated && (
          <span className="text-muted-foreground/60 text-[10px] ml-1">… {data.length.toLocaleString()} chars</span>
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

  const renderKeyLabel = (label: string, isIdx: boolean) => {
    if (isIdx) {
      return (
        <><span className="text-muted-foreground">{label}</span><span className="text-muted-foreground">:&nbsp;</span></>
      )
    }
    return (
      <><span className="json-key">&quot;{findQuery ? <Highlighted text={label} query={findQuery} /> : label}&quot;</span><span className="text-muted-foreground">:&nbsp;</span></>
    )
  }

  // ── Collapsed ─────────────────────────────────────────────────────────────
  if (effectiveCollapsed) {
    return (
      <div
        className="flex items-center gap-1 h-[25px] cursor-pointer rounded hover:bg-accent/50 -mx-1 px-1"
        onClick={toggle}
        onContextMenu={ctxMenu}
      >
        <Triangle open={false} />
        {keyLabel !== undefined && renderKeyLabel(keyLabel, /^\d+$/.test(keyLabel))}
        <span className="text-muted-foreground">
          {openBr}<span className="text-[10px]">…</span>{closeBr}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{summary}</span>
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
        {keyLabel !== undefined && renderKeyLabel(keyLabel, /^\d+$/.test(keyLabel))}
        <span className="text-muted-foreground">{openBr}</span>
        <span className="text-[10px] text-muted-foreground/60">{summary}</span>
      </div>

      <div className="pl-4">
        {entries.map(([key, val], i) => {
          const hasComma = i < entries.length - 1
          const isIndex = /^\d+$/.test(key)
          const kPath = buildChildPath(path, key, isIndex)
          if (isExpandable(val)) {
            return (
              <JsonNode
                key={key}
                data={val}
                depth={depth + 1}
                path={kPath}
                keyLabel={key}
                comma={hasComma}
              />
            )
          }
          return (
            <div
              key={key}
              className="flex items-center gap-0 h-[25px] rounded hover:bg-accent/50 -mx-1 px-1 cursor-default"
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(e, val, kPath) }}
            >
              <span className="w-3.5 shrink-0" />
              {isIndex
                ? <><span className="text-muted-foreground">{key}</span><span className="text-muted-foreground">:&nbsp;</span></>
                : <><span className="json-key">&quot;{findQuery ? <Highlighted text={key} query={findQuery} /> : key}&quot;</span><span className="text-muted-foreground">:&nbsp;</span></>
              }
              <JsonNode data={val} depth={depth + 1} path={kPath} />
              {hasComma && <span className="text-muted-foreground">,</span>}
            </div>
          )
        })}
      </div>

      <div className="flex items-center h-[25px]" onContextMenu={ctxMenu}>
        <span className="text-muted-foreground">{closeBr}</span>
        {comma && <span className="text-muted-foreground">,</span>}
      </div>
    </div>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────

export function JsonTree({ data, cacheKey, search }: { data: unknown; cacheKey?: string; search?: string }) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  const openMenu = (e: React.MouseEvent, value: unknown, path: string) => {
    setMenu({ x: e.clientX, y: e.clientY, value, path })
  }

  return (
    <MenuCtx.Provider value={{ openMenu }}>
      <CollapseCtx.Provider value={cacheKey}>
        <FindCtx.Provider value={search ?? ''}>
          <div className="font-mono text-xs leading-6">
            <JsonNode key={cacheKey} data={data} depth={0} path="" />
          </div>
        </FindCtx.Provider>
      </CollapseCtx.Provider>
      {menu && <JsonContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </MenuCtx.Provider>
  )
}
