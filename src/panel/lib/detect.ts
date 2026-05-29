import type { Classification, GqlOperationType } from './types'

// Detect graphql-ws protocol frames (client→server "subscribe" messages).
// Returns null when the data is not a GraphQL operation.
export function classifyFrame(data: string): Classification | null {
  const standard = classifyBody(data)
  if (standard !== null) return standard

  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    if (
      parsed &&
      parsed.type === 'subscribe' &&
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
