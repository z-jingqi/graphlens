import type { Classification, GqlOperationType } from './types'

// Known GraphQL-over-WebSocket subprotocol identifiers.
const GRAPHQL_WS_SUBPROTOCOLS = new Set(['graphql-transport-ws', 'graphql-ws'])

/**
 * Returns true when the connection negotiated a known GraphQL WebSocket
 * subprotocol (graphql-transport-ws / graphql-ws).  Used to gate whether a
 * WS connection is shown immediately without waiting for an operation frame.
 */
export function isGraphqlWsProtocol(protocols?: string[]): boolean {
  return !!protocols?.some(p => GRAPHQL_WS_SUBPROTOCOLS.has(p.toLowerCase()))
}

// Detect graphql-ws protocol frames (client→server "subscribe"/"start" messages).
// Returns null when the data is not a GraphQL operation.
export function classifyFrame(data: string): Classification | null {
  const standard = classifyBody(data)
  if (standard !== null) return standard

  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    // Modern graphql-ws: {type:'subscribe', id, payload:{query,...}}
    // Legacy subscriptions-transport-ws: {type:'start', id, payload:{query,...}}
    if (
      parsed &&
      (parsed.type === 'subscribe' || parsed.type === 'start') &&
      parsed.payload &&
      typeof (parsed.payload as Record<string, unknown>).query === 'string'
    ) {
      const payload = parsed.payload as Record<string, unknown>
      const query = payload.query as string
      return {
        type: 'graphql',
        operationName:
          typeof payload.operationName === 'string' ? payload.operationName : extractOpName(query),
        operationType: extractOpType(query),
        query,
        variables: payload.variables,
      }
    }
  } catch {}

  return null
}

/**
 * Extracts graphql-ws envelope metadata (correlation id + message type) from a
 * raw frame string.  Used to group subscription frames in the detail panel.
 */
export function parseGraphqlWsMeta(data: string): { id?: string; type?: string } {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      return {
        id: typeof parsed.id === 'string' ? parsed.id : undefined,
        type: typeof parsed.type === 'string' ? parsed.type : undefined,
      }
    }
  } catch {}
  return {}
}

function extractOpType(query: string): GqlOperationType {
  const m = query.trimStart().match(/^(query|mutation|subscription)/i)
  if (!m) return 'query'
  const t = m[1].toLowerCase()
  if (t === 'mutation') return 'mutation'
  if (t === 'subscription') return 'subscription'
  return 'query'
}

function extractOpName(query: string): string | undefined {
  const m = query.trimStart().match(/(?:query|mutation|subscription)\s+(\w+)/i)
  return m?.[1]
}

// Best-effort operation type from naming conventions when no query body is available.
function guessOpType(name: string): GqlOperationType {
  const lower = name.toLowerCase()
  if (/^(create|insert|add|update|upsert|delete|remove|set|toggle|send|upload|mutate)/.test(lower)) return 'mutation'
  if (/^(subscribe|on[A-Z])/.test(name)) return 'subscription'
  return 'query'
}

// Returns null when the body is not a GraphQL operation.
export function classifyBody(body: string | undefined): Classification | null {
  if (!body) return null

  try {
    const parsed: unknown = JSON.parse(body)
    const ops = Array.isArray(parsed) ? parsed : [parsed]
    const first = ops[0] as Record<string, unknown> | undefined
    if (!first) return null

    if (typeof first.query === 'string') {
      const query = first.query
      return {
        type: 'graphql',
        operationName:
          typeof first.operationName === 'string'
            ? first.operationName
            : extractOpName(query),
        operationType: extractOpType(query),
        query,
        variables: first.variables,
      }
    }

    // Persisted query: no `query` field, but operationName + extensions.persistedQuery present.
    const extensions = first.extensions as Record<string, unknown> | undefined
    if (
      typeof first.operationName === 'string' &&
      extensions?.persistedQuery
    ) {
      return {
        type: 'graphql',
        operationName: first.operationName,
        operationType: guessOpType(first.operationName),
        variables: first.variables,
      }
    }
  } catch {}

  return null
}

/**
 * Classifies a GraphQL request from URL query-params (HTTP GET pattern).
 * Returns null when the URL doesn't carry a GraphQL query.
 */
export function classifyUrl(url: string): Classification | null {
  try {
    const params = new URL(url).searchParams
    const query = params.get('query')
    if (query) {
      let variables: unknown
      try { variables = JSON.parse(params.get('variables') ?? '') } catch {}
      return {
        type: 'graphql',
        operationName: params.get('operationName') ?? extractOpName(query),
        operationType: extractOpType(query),
        query,
        variables,
      }
    }
    // Automatic Persisted Query via GET: operationName + extensions.persistedQuery
    const operationName = params.get('operationName')
    const extensionsRaw = params.get('extensions')
    if (operationName && extensionsRaw) {
      try {
        const ext = JSON.parse(extensionsRaw) as Record<string, unknown>
        if (ext.persistedQuery) {
          return {
            type: 'graphql',
            operationName,
            operationType: guessOpType(operationName),
          }
        }
      } catch {}
    }
  } catch {}
  return null
}

/**
 * Unified classifier: prefers POST body, falls back to URL params (GET).
 * Use this everywhere instead of calling classifyBody directly.
 */
export function classify(url: string, body?: string): Classification | null {
  return classifyBody(body) ?? classifyUrl(url)
}

/**
 * Returns a Classification for every operation in a batched request body.
 * Returns [] when the body is not parseable or not a GraphQL array.
 * classifyBody already handles the first element (for back-compat); this is
 * only needed when you want ALL operations from a batch.
 */
export function classifyAll(body: string | undefined): Classification[] {
  if (!body) return []
  try {
    const parsed: unknown = JSON.parse(body)
    const ops = Array.isArray(parsed) ? parsed : [parsed]
    return ops.flatMap(op => {
      const o = op as Record<string, unknown>
      if (typeof o?.query === 'string') {
        const query = o.query
        return [{
          type: 'graphql' as const,
          operationName: typeof o.operationName === 'string' ? o.operationName : extractOpName(query),
          operationType: extractOpType(query),
          query,
          variables: o.variables,
        }]
      }
      const ext = o?.extensions as Record<string, unknown> | undefined
      if (typeof o?.operationName === 'string' && ext?.persistedQuery) {
        return [{
          type: 'graphql' as const,
          operationName: o.operationName as string,
          operationType: guessOpType(o.operationName as string),
          variables: o.variables,
        }]
      }
      return []
    })
  } catch {}
  return []
}
