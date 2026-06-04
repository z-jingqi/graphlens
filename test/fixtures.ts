import type { CapturedRequest, CapturedFrame, HarEntry, Classification } from '../src/panel/lib/types'

// ── HAR factory ───────────────────────────────────────────────────────────────

export function makeHar(overrides?: Partial<HarEntry> & {
  url?: string
  method?: string
  body?: string
  status?: number
  startedMs?: number
}): HarEntry {
  const {
    url = 'https://api.example.com/graphql',
    method = 'POST',
    body = '{"query":"{ user { id } }"}',
    status = 200,
    startedMs = 1_000,
    ...rest
  } = overrides ?? {}

  return {
    request: {
      method,
      url,
      headers: [{ name: 'content-type', value: 'application/json' }],
      postData: body ? { mimeType: 'application/json', text: body } : undefined,
    },
    response: {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: [{ name: 'content-type', value: 'application/json' }],
      content: { mimeType: 'application/json', size: 42 },
    },
    startedDateTime: new Date(startedMs).toISOString(),
    time: 50,
    getContent: (cb) => cb('{"data":{"user":{"id":"1"}}}', ''),
    ...rest,
  }
}

// ── CapturedRequest factory ───────────────────────────────────────────────────

let _id = 0
export function makeRequest(overrides?: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: `req-${++_id}`,
    state: 'finished',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    startedAt: 1_000,
    classification: {
      type: 'graphql',
      operationType: 'query',
      operationName: 'GetUser',
      query: 'query GetUser { user { id name } }',
    },
    hasErrors: false,
    timestamp: 1_000,
    duration: 50,
    status: 200,
    ...overrides,
  }
}

// Reset the ID counter between test files (call in beforeEach if needed)
export function resetIdCounter() {
  _id = 0
}

// ── CapturedFrame factory ─────────────────────────────────────────────────────

export function makeFrame(overrides?: Partial<CapturedFrame>): CapturedFrame {
  return {
    direction: 'receive',
    timestamp: 2_000,
    data: '{"type":"next","id":"1","payload":{"data":{"user":{"id":"1"}}}}',
    ...overrides,
  }
}

// ── GraphQL classification shorthand ─────────────────────────────────────────

export function graphqlClassification(
  operationType: Classification['operationType'] = 'query',
  operationName?: string,
): Classification {
  return { type: 'graphql', operationType, operationName }
}
