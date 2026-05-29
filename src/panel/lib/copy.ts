import type { CapturedRequest } from './types'

export function buildCurl(req: CapturedRequest): string {
  const { har } = req
  if (!har) return ''
  const skip = new Set(['host', 'content-length', ':method', ':path', ':authority', ':scheme'])
  const headers = har.request.headers
    .filter(h => !skip.has(h.name.toLowerCase()))
    .map(h => `  -H '${h.name}: ${h.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
    .join(' \\\n')

  const body = har.request.postData?.text
  const bodyStr = body
    ? ` \\\n  --data '${body.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
    : ''

  return `curl -X ${har.request.method} '${har.request.url}' \\\n${headers}${bodyStr}`
}

export function buildFetchSnippet(req: CapturedRequest): string {
  const { har } = req
  if (!har) return ''
  const skip = new Set(['host', 'content-length', ':method', ':path', ':authority', ':scheme'])
  const headers: Record<string, string> = {}
  har.request.headers
    .filter(h => !skip.has(h.name.toLowerCase()))
    .forEach(h => { headers[h.name] = h.value })

  const body = har.request.postData?.text
  const opts: Record<string, unknown> = {
    method: har.request.method,
    headers,
    credentials: 'include',
  }
  if (body) opts.body = body

  return `await fetch(${JSON.stringify(har.request.url)}, ${JSON.stringify(opts, null, 2)})`
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
