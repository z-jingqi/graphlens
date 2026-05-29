import { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { CapturedRequest } from '../lib/types'
import { buildCurl, buildFetchSnippet, copyToClipboard } from '../lib/copy'

interface CopyMenuProps {
  request: CapturedRequest
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </svg>
  )
}

export function CopyMenu({ request }: CopyMenuProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 150)
  }

  useEffect(() => {
    return () => cancelClose()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const copy = async (text: string) => {
    if (!text) return
    await copyToClipboard(text)
    setCopied(true)
    setOpen(false)
    setTimeout(() => setCopied(false), 2000)
  }

  const { classification: c, responseJson } = request
  const items: { label: string; value: string }[] = [
    ...(c.type === 'graphql'
      ? [
          { label: 'Copy operation name', value: c.operationName ?? '' },
          { label: 'Copy query', value: c.query ?? '' },
          { label: 'Copy variables (JSON)', value: JSON.stringify(c.variables, null, 2) },
        ]
      : []),
    { label: 'Copy response (JSON)', value: JSON.stringify(responseJson, null, 2) },
    { label: 'Copy as cURL', value: buildCurl(request) },
    { label: 'Copy as fetch()', value: buildFetchSnippet(request) },
  ].filter(i => i.value && i.value !== 'undefined')

  if (items.length === 0) return null

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => { cancelClose(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <button
        className={clsx(
          'h-6 px-2 rounded-md flex items-center gap-1.5 text-xs transition-colors cursor-pointer border-none bg-transparent',
          copied
            ? 'text-success'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        {copied ? (
          '✓ Copied'
        ) : (
          <>
            <CopyIcon />
            <span>Copy ▾</span>
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 right-0 bg-popover border border-border rounded-md shadow-lg z-50 min-w-44 overflow-hidden py-1"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => copy(item.value)}
              className="block w-full px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer whitespace-nowrap"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
