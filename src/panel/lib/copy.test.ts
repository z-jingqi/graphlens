import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildCurl, buildFetchSnippet, copyToClipboard } from './copy'
import type { CapturedRequest, HarEntry } from './types'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeReqWithHar(overrides?: {
  method?: string
  url?: string
  headers?: { name: string; value: string }[]
  body?: string
}): CapturedRequest {
  const {
    method = 'POST',
    url = 'https://api.example.com/graphql',
    headers = [
      { name: 'content-type', value: 'application/json' },
      { name: 'authorization', value: 'Bearer token' },
    ],
    body,
  } = overrides ?? {}

  const har: HarEntry = {
    request: {
      method,
      url,
      headers,
      postData: body ? { mimeType: 'application/json', text: body } : undefined,
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: [],
      content: { mimeType: 'application/json', size: 42 },
    },
    startedDateTime: new Date(1000).toISOString(),
    time: 50,
    getContent: cb => cb('', ''),
  }

  return {
    id: 'r1',
    state: 'finished',
    url,
    method,
    startedAt: 1000,
    classification: { type: 'graphql' },
    har,
    hasErrors: false,
    timestamp: 1000,
    duration: 50,
    status: 200,
  }
}

function reqWithoutHar(): CapturedRequest {
  return {
    id: 'r2',
    state: 'pending',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    startedAt: 1000,
    classification: { type: 'graphql' },
    hasErrors: false,
    timestamp: 1000,
    duration: 0,
    status: 0,
  }
}

// ── buildCurl ─────────────────────────────────────────────────────────────────

describe('buildCurl', () => {
  it('returns empty string when no har', () => {
    expect(buildCurl(reqWithoutHar())).toBe('')
  })

  it('includes method and URL', () => {
    const result = buildCurl(makeReqWithHar({ method: 'POST', url: 'https://api.example.com/graphql' }))
    expect(result).toContain("curl -X POST 'https://api.example.com/graphql'")
  })

  it('includes allowed headers as -H flags', () => {
    const result = buildCurl(makeReqWithHar({
      headers: [{ name: 'authorization', value: 'Bearer token' }],
    }))
    expect(result).toContain("-H 'authorization: Bearer token'")
  })

  it('skips hop-by-hop and pseudo headers', () => {
    const result = buildCurl(makeReqWithHar({
      headers: [
        { name: 'host', value: 'api.example.com' },
        { name: 'content-length', value: '42' },
        { name: ':method', value: 'POST' },
        { name: ':path', value: '/graphql' },
        { name: ':authority', value: 'api.example.com' },
        { name: ':scheme', value: 'https' },
        { name: 'content-type', value: 'application/json' },
      ],
    }))
    expect(result).not.toContain('-H \'host:')
    expect(result).not.toContain('content-length')
    expect(result).not.toContain(':method')
    expect(result).toContain("content-type")
  })

  it('escapes single quotes in header values', () => {
    const result = buildCurl(makeReqWithHar({
      headers: [{ name: 'x-header', value: "it's value" }],
    }))
    expect(result).toContain("it\\'s value")
  })

  it('escapes backslashes in header values', () => {
    const result = buildCurl(makeReqWithHar({
      headers: [{ name: 'x-header', value: 'path\\to\\file' }],
    }))
    expect(result).toContain('path\\\\to\\\\file')
  })

  it('appends --data with body when postData present', () => {
    const result = buildCurl(makeReqWithHar({ body: '{"query":"{ user { id } }"}' }))
    expect(result).toContain("--data '")
    expect(result).toContain('{"query":"{ user { id } }"}')
  })

  it('omits --data when no postData', () => {
    const result = buildCurl(makeReqWithHar({ body: undefined }))
    expect(result).not.toContain('--data')
  })

  it('escapes single quotes in body', () => {
    const result = buildCurl(makeReqWithHar({ body: "it's a body" }))
    expect(result).toContain("it\\'s a body")
  })
})

// ── buildFetchSnippet ─────────────────────────────────────────────────────────

describe('buildFetchSnippet', () => {
  it('returns empty string when no har', () => {
    expect(buildFetchSnippet(reqWithoutHar())).toBe('')
  })

  it('starts with await fetch(url)', () => {
    const result = buildFetchSnippet(makeReqWithHar({ url: 'https://api.example.com/graphql' }))
    expect(result).toContain('await fetch("https://api.example.com/graphql"')
  })

  it('includes method in options', () => {
    const result = buildFetchSnippet(makeReqWithHar({ method: 'POST' }))
    expect(result).toContain('"method": "POST"')
  })

  it('includes credentials: include', () => {
    const result = buildFetchSnippet(makeReqWithHar())
    expect(result).toContain('"credentials": "include"')
  })

  it('skips hop-by-hop and pseudo headers', () => {
    const result = buildFetchSnippet(makeReqWithHar({
      headers: [
        { name: 'host', value: 'api.example.com' },
        { name: 'content-type', value: 'application/json' },
      ],
    }))
    expect(result).not.toContain('host')
    expect(result).toContain('content-type')
  })

  it('includes body when postData is present', () => {
    // opts.body is JSON.stringify'd as part of the options object, so the
    // body string will appear escaped inside a JSON string value.
    const result = buildFetchSnippet(makeReqWithHar({ body: '{"query":"getUser"}' }))
    expect(result).toContain('"body"')
    // The word 'getUser' survives JSON double-escaping and appears in the output
    expect(result).toContain('getUser')
  })

  it('omits body when no postData', () => {
    const result = buildFetchSnippet(makeReqWithHar({ body: undefined }))
    expect(result).not.toContain('"body"')
  })
})

// ── copyToClipboard ───────────────────────────────────────────────────────────

describe('copyToClipboard', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.stubGlobal('navigator', { clipboard: { writeText } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('calls navigator.clipboard.writeText with the given text', async () => {
    await copyToClipboard('hello world')
    expect(writeText).toHaveBeenCalledWith('hello world')
  })
})
