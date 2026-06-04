// Runs in the inspected page's MAIN world via manifest `content_scripts[].world: "MAIN"`.
// Wraps fetch + XMLHttpRequest so the panel can show pending requests before HAR fires.

(() => {
  if ((window as unknown as { __gqlInspectorPatched?: boolean }).__gqlInspectorPatched) return
  ;(window as unknown as { __gqlInspectorPatched?: boolean }).__gqlInspectorPatched = true

  const SOURCE = 'graphlens-patch'
  const post = (kind: 'started' | 'completed' | 'frame' | 'disconnected' | 'sse-start', data: Record<string, unknown>) => {
    try {
      window.postMessage({ source: SOURCE, kind, ...data }, '*')
    } catch {}
  }

  const newId = (): string => {
    try {
      return crypto.randomUUID()
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }
  }

  // Reads a teed SSE ReadableStream and posts 'frame' per event, 'disconnected' when done.
  async function pumpSse(body: ReadableStream<Uint8Array>, id: string, startedAt: number): Promise<void> {
    const reader = body.getReader()
    const dec = new TextDecoder('utf-8')
    let buf = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        // SSE events are delimited by blank lines (\n\n)
        const blocks = buf.split('\n\n')
        buf = blocks.pop()!
        for (const block of blocks) {
          if (!block.trim()) continue
          let eventName: string | undefined
          const dataLines: string[] = []
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) {
              const v = line.slice(6)
              eventName = (v.startsWith(' ') ? v.slice(1) : v).trimEnd()
            } else if (line.startsWith('data:')) {
              const v = line.slice(5)
              dataLines.push(v.startsWith(' ') ? v.slice(1) : v)
            }
            // id:, retry:, comment lines (starting with :) are ignored
          }
          // Skip truly empty blocks (no event name, no data — keepalive padding etc.)
          if (dataLines.length === 0 && !eventName) continue
          const data = dataLines.join('\n')
          const capped = data.length > 65536 ? data.slice(0, 65536) + '…[truncated]' : data
          post('frame', { id, direction: 'receive', data: capped, eventName, timestamp: Date.now() })
        }
      }
      post('disconnected', { id, durationMs: Date.now() - startedAt })
    } catch (err) {
      // AbortError means the caller cancelled the stream intentionally — treat as graceful close.
      const failed = !(err instanceof DOMException && err.name === 'AbortError')
      post('disconnected', { id, durationMs: Date.now() - startedAt, failed })
    }
  }

  // ── fetch wrapper ─────────────────────────────────────────────────────────
  try {
    const origFetch = window.fetch
    if (typeof origFetch === 'function') {
      window.fetch = function patchedFetch(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        let id = ''
        const startedAt = Date.now()

        try {
          id = newId()
          let url = ''
          let method = 'GET'
          let body: string | undefined

          if (typeof input === 'string') {
            url = input
          } else if (input instanceof URL) {
            url = input.href
          } else if (input && typeof (input as Request).url === 'string') {
            url = (input as Request).url
            method = (input as Request).method || method
          }
          if (init?.method) method = init.method
          method = method.toUpperCase()
          if (typeof init?.body === 'string') body = init.body
          else if (init?.body instanceof URLSearchParams) body = init.body.toString()
          try { url = new URL(url, location.href).href } catch {}

          post('started', { id, url, method, startedAt, body })
        } catch {}

        // eslint-disable-next-line prefer-rest-params
        const promise = origFetch.apply(this, arguments as unknown as Parameters<typeof fetch>)

        return promise.then(
          (res: Response) => {
            try {
              const ct = res.headers.get('content-type') ?? ''
              if (ct.includes('text/event-stream') && res.body) {
                post('sse-start', { id })
                post('completed', { id, status: res.status, durationMs: Date.now() - startedAt })
                const [forCaller, forUs] = res.body.tee()
                void pumpSse(forUs, id, startedAt)
                return new Response(forCaller, {
                  status: res.status,
                  statusText: res.statusText,
                  headers: res.headers,
                })
              }
              post('completed', { id, status: res.status, durationMs: Date.now() - startedAt })
            } catch {
              try { post('completed', { id, status: res.status, durationMs: Date.now() - startedAt }) } catch {}
            }
            return res
          },
          (err: unknown) => {
            try { post('completed', { id, status: 0, durationMs: Date.now() - startedAt, failed: true }) } catch {}
            throw err
          }
        )
      } as typeof window.fetch
    }
  } catch {}

  // ── XHR wrapper ───────────────────────────────────────────────────────────
  try {
    const XHR = window.XMLHttpRequest
    if (typeof XHR === 'function') {
      const origOpen = XHR.prototype.open
      const origSend = XHR.prototype.send

      XHR.prototype.open = function patchedOpen(
        this: XMLHttpRequest & { __gqlInfo?: { method: string; url: string } },
        method: string,
        url: string | URL,
        ...rest: unknown[]
      ) {
        try {
          let resolvedUrl = String(url)
          try { resolvedUrl = new URL(resolvedUrl, location.href).href } catch {}
          this.__gqlInfo = { method: (method || 'GET').toUpperCase(), url: resolvedUrl }
        } catch {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return origOpen.apply(this, [method, url, ...rest] as any)
      } as typeof XHR.prototype.open

      XHR.prototype.send = function patchedSend(
        this: XMLHttpRequest & { __gqlInfo?: { method: string; url: string } },
        body?: Document | XMLHttpRequestBodyInit | null
      ) {
        try {
          const info = this.__gqlInfo
          if (info) {
            const id = newId()
            const startedAt = Date.now()
            const bodyText = typeof body === 'string' ? body : undefined

            post('started', { id, url: info.url, method: info.method, startedAt, body: bodyText })

            const onDone = () => {
              this.removeEventListener('loadend', onDone)
              post('completed', {
                id,
                status: this.status,
                durationMs: Date.now() - startedAt,
                failed: this.status === 0,
              })
            }
            this.addEventListener('loadend', onDone)
          }
        } catch {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return origSend.apply(this, arguments as any)
      } as typeof XHR.prototype.send
    }
  } catch {}

  // ── WebSocket wrapper ─────────────────────────────────────────────────────
  try {
    const OrigWS = window.WebSocket
    if (typeof OrigWS === 'function') {
      const capFrame = (data: unknown): string => {
        if (typeof data === 'string') {
          return data.length > 65536 ? data.slice(0, 65536) + '…[truncated]' : data
        }
        const size = data instanceof Blob ? data.size : (data as ArrayBuffer).byteLength ?? 0
        return `[Binary ${size} bytes]`
      }

      class PatchedWebSocket extends OrigWS {
        private readonly __id: string
        private readonly __t0: number

        constructor(url: string | URL, protocols?: string | string[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          super(url as string, protocols as any)
          this.__id = ''
          this.__t0 = 0
          try {
            this.__id = newId()
            this.__t0 = Date.now()
            const urlStr = typeof url === 'string' ? url : url.href
            const protocolList = typeof protocols === 'string' ? [protocols]
              : Array.isArray(protocols) ? protocols : []
            post('started', { id: this.__id, url: urlStr, method: 'WS', startedAt: this.__t0, transport: 'websocket', protocols: protocolList })

            super.addEventListener('open', () => {
              post('completed', { id: this.__id, status: 101, durationMs: Date.now() - this.__t0 })
            })
            super.addEventListener('message', (e: MessageEvent) => {
              post('frame', { id: this.__id, direction: 'receive', data: capFrame(e.data), timestamp: Date.now() })
            })
            super.addEventListener('close', () => {
              post('disconnected', { id: this.__id, durationMs: Date.now() - this.__t0 })
            })
            super.addEventListener('error', () => {
              post('disconnected', { id: this.__id, durationMs: Date.now() - this.__t0, failed: true })
            })
          } catch {}
        }

        send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
          try { post('frame', { id: this.__id, direction: 'send', data: capFrame(data), timestamp: Date.now() }) } catch {}
          super.send(data as string)
        }
      }

      window.WebSocket = PatchedWebSocket as unknown as typeof WebSocket
    }
  } catch {}

  // ── EventSource (SSE) wrapper ─────────────────────────────────────────────
  try {
    const OrigES = window.EventSource
    if (typeof OrigES === 'function') {
      // Captured before any Chrome DevTools wrapping — truly native listener registration.
      const nativeOn = EventTarget.prototype.addEventListener
      // Per-instance closure that tracks which custom event types we've registered.
      const esTracker = new WeakMap<object, (type: string) => void>()

      class PatchedEventSource extends OrigES {
        constructor(url: string | URL, init?: EventSourceInit) {
          super(url as string, init)
          try {
            // All state in constructor-scoped locals — no class fields or prototype methods
            // to avoid issues with Chrome DevTools Proxy wrapping and class field init order.
            const id = newId()
            const t0 = Date.now()
            const seenEvents = new Set<string>(['message'])
            const urlStr = typeof url === 'string' ? url : url.href

            post('started', { id, url: urlStr, method: 'GET', startedAt: t0, transport: 'sse' })

            nativeOn.call(this, 'open', () => {
              post('completed', { id, status: 200, durationMs: Date.now() - t0 })
            })
            nativeOn.call(this, 'error', () => {
              if (this.readyState === EventSource.CLOSED)
                post('disconnected', { id, durationMs: Date.now() - t0, failed: true })
            })
            nativeOn.call(this, 'message', (e: Event) => {
              if (e instanceof MessageEvent) {
                const data = typeof e.data === 'string' && e.data.length > 65536
                  ? e.data.slice(0, 65536) + '…[truncated]' : String(e.data)
                post('frame', { id, direction: 'receive', data, timestamp: Date.now() })
              }
            })

            const track = (type: string) => {
              if (seenEvents.has(type)) return
              seenEvents.add(type)
              nativeOn.call(this, type, (e: Event) => {
                if (e instanceof MessageEvent) {
                  const data = typeof e.data === 'string' && e.data.length > 65536
                    ? e.data.slice(0, 65536) + '…[truncated]' : String(e.data)
                  post('frame', { id, direction: 'receive', data, eventName: type, timestamp: Date.now() })
                }
              })
            }
            esTracker.set(this, track)
          } catch {}
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        addEventListener(type: string, listener: any, options?: any): void {
          try { esTracker.get(this)?.(type) } catch {}
          super.addEventListener(type, listener, options)
        }
      }

      window.EventSource = PatchedEventSource as unknown as typeof EventSource
    }
  } catch {}

})()

export {}
