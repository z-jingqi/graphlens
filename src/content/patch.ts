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
  const origFetch = window.fetch
  if (typeof origFetch === 'function') {
    window.fetch = function patchedFetch(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      const id = newId()
      const startedAt = Date.now()

      let url = ''
      let method = 'GET'
      let body: string | undefined

      try {
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
        try { url = new URL(url, location.href).href } catch {}
      } catch {}

      post('started', { id, url, method, startedAt, body })

      // eslint-disable-next-line prefer-rest-params
      const promise = origFetch.apply(this, arguments as unknown as Parameters<typeof fetch>)
      return promise.then(
        (res: Response) => {
          const ct = res.headers.get('content-type') ?? ''
          if (ct.includes('text/event-stream') && res.body) {
            // Mark as SSE before 'completed' so the panel can flip transport → 'sse'
            // and the 'completed' handler will then treat status 200 as a handshake.
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
          return res
        },
        (err: unknown) => {
          post('completed', { id, status: 0, durationMs: Date.now() - startedAt, failed: true })
          throw err
        }
      )
    } as typeof window.fetch
  }

  // ── XHR wrapper ───────────────────────────────────────────────────────────
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
      let resolvedUrl = String(url)
      try { resolvedUrl = new URL(resolvedUrl, location.href).href } catch {}
      this.__gqlInfo = { method: (method || 'GET').toUpperCase(), url: resolvedUrl }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return origOpen.apply(this, [method, url, ...rest] as any)
    } as typeof XHR.prototype.open

    XHR.prototype.send = function patchedSend(
      this: XMLHttpRequest & { __gqlInfo?: { method: string; url: string } },
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return origSend.apply(this, arguments as any)
    } as typeof XHR.prototype.send
  }

  // ── WebSocket wrapper ─────────────────────────────────────────────────────
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
        this.__id = newId()
        this.__t0 = Date.now()
        const urlStr = typeof url === 'string' ? url : url.href
        post('started', { id: this.__id, url: urlStr, method: 'WS', startedAt: this.__t0, transport: 'websocket' })

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
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        post('frame', { id: this.__id, direction: 'send', data: capFrame(data), timestamp: Date.now() })
        super.send(data as string)
      }
    }

    window.WebSocket = PatchedWebSocket as unknown as typeof WebSocket
  }

  // ── EventSource (SSE) wrapper ─────────────────────────────────────────────
  const OrigES = window.EventSource
  if (typeof OrigES === 'function') {
    class PatchedEventSource extends OrigES {
      private readonly __id: string
      private readonly __t0: number
      private readonly __seenEvents: Set<string>

      constructor(url: string | URL, init?: EventSourceInit) {
        super(url as string, init)
        this.__id = newId()
        this.__t0 = Date.now()
        this.__seenEvents = new Set()
        const urlStr = typeof url === 'string' ? url : url.href
        post('started', { id: this.__id, url: urlStr, method: 'GET', startedAt: this.__t0, transport: 'sse' })

        super.addEventListener('open', () => {
          post('completed', { id: this.__id, status: 200, durationMs: Date.now() - this.__t0 })
        })
        super.addEventListener('error', () => {
          if (this.readyState === EventSource.CLOSED) {
            post('disconnected', { id: this.__id, durationMs: Date.now() - this.__t0, failed: true })
          }
        })
        this.__trackEvent('message')
      }

      private __trackEvent(type: string): void {
        if (this.__seenEvents.has(type)) return
        this.__seenEvents.add(type)
        super.addEventListener(type, (e: Event) => {
          if (e instanceof MessageEvent) {
            const data = typeof e.data === 'string' && e.data.length > 65536
              ? e.data.slice(0, 65536) + '…[truncated]'
              : String(e.data)
            post('frame', { id: this.__id, direction: 'receive', data, eventName: type === 'message' ? undefined : type, timestamp: Date.now() })
          }
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addEventListener(type: string, listener: any, options?: any): void {
        this.__trackEvent(type)
        super.addEventListener(type, listener, options)
      }
    }

    window.EventSource = PatchedEventSource as unknown as typeof EventSource
  }

})()

export {}
