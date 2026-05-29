import { useState } from 'react'
import clsx from 'clsx'
import { copyToClipboard } from '../lib/copy'

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="1" width="8" height="9" rx="1.2" />
      <path d="M9 10v2a1.2 1.2 0 0 1-1.2 1.2H1.2A1.2 1.2 0 0 1 0 12V4.2A1.2 1.2 0 0 1 1.2 3H3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,7 5.5,10.5 12,3.5" />
    </svg>
  )
}

interface Props {
  text: string
  title?: string
  className?: string
}

export function CopyIconButton({ text, title = 'Copy', className }: Props) {
  const [copied, setCopied] = useState(false)

  if (!text) return null

  const handle = async () => {
    if (!text) return
    await copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <button
      onClick={handle}
      title={copied ? 'Copied' : title}
      className={clsx(
        'h-6 w-6 rounded-md flex items-center justify-center transition-colors border-none bg-transparent cursor-pointer',
        copied
          ? 'text-success'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        className
      )}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}
