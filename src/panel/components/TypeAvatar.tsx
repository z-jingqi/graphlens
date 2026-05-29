import clsx from 'clsx'
import type { CapturedRequest } from '../lib/types'

interface AvatarSpec {
  letter: string
  title: string
  fg: string   // text color classes (light + dark)
  bg: string   // background + border classes (badge variant)
}

const TRANSPORT_SPEC: Record<string, AvatarSpec> = {
  websocket: { letter: 'W', title: 'WebSocket', fg: 'text-cyan-600 dark:text-cyan-400',      bg: 'bg-cyan-500/15 border-cyan-500/30' },
  sse:       { letter: 'E', title: 'SSE',        fg: 'text-orange-600 dark:text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30' },
}

function specFor(req: CapturedRequest): AvatarSpec {
  if (req.classification.type === 'graphql') {
    switch (req.classification.operationType) {
      case 'query':        return { letter: 'Q', title: 'Query',        fg: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-500/15 border-blue-500/30' }
      case 'mutation':     return { letter: 'M', title: 'Mutation',     fg: 'text-primary',                           bg: 'bg-primary/15 border-primary/30' }
      case 'subscription': return { letter: 'S', title: 'Subscription', fg: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' }
      default:             return { letter: 'G', title: 'GraphQL',      fg: 'text-primary',                           bg: 'bg-primary/15 border-primary/30' }
    }
  }
  if (req.transport && TRANSPORT_SPEC[req.transport]) return TRANSPORT_SPEC[req.transport]
  return { letter: '?', title: 'Unknown', fg: 'text-muted-foreground', bg: 'bg-muted-foreground/15 border-muted-foreground/30' }
}

interface Props {
  req: CapturedRequest
  variant?: 'badge' | 'inline'
  className?: string
}

export function TypeAvatar({ req, variant = 'badge', className }: Props) {
  const { letter, title, fg, bg } = specFor(req)
  if (variant === 'inline') {
    return (
      <span title={title} className={clsx('font-bold text-xs shrink-0 inline-block w-[13px]', fg, className)}>
        {letter}
      </span>
    )
  }
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border shrink-0',
        bg,
        fg,
        className
      )}
    >
      {letter}
    </span>
  )
}
