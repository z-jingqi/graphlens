import { describe, it, expect } from 'vitest'
import {
  isGraphqlWsProtocol,
  classifyBody,
  classifyUrl,
  classify,
  classifyAll,
  classifyFrame,
  parseGraphqlWsMeta,
} from './detect'

// ── isGraphqlWsProtocol ───────────────────────────────────────────────────────

describe('isGraphqlWsProtocol', () => {
  it('returns false for undefined', () => {
    expect(isGraphqlWsProtocol(undefined)).toBe(false)
  })

  it('returns false for empty array', () => {
    expect(isGraphqlWsProtocol([])).toBe(false)
  })

  it('returns true for graphql-transport-ws', () => {
    expect(isGraphqlWsProtocol(['graphql-transport-ws'])).toBe(true)
  })

  it('returns true for graphql-ws', () => {
    expect(isGraphqlWsProtocol(['graphql-ws'])).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isGraphqlWsProtocol(['GRAPHQL-TRANSPORT-WS'])).toBe(true)
    expect(isGraphqlWsProtocol(['GraphQL-WS'])).toBe(true)
  })

  it('returns true when a graphql protocol is mixed in', () => {
    expect(isGraphqlWsProtocol(['vnd.example', 'graphql-ws'])).toBe(true)
  })

  it('returns false for unrelated protocols', () => {
    expect(isGraphqlWsProtocol(['chat', 'echo'])).toBe(false)
  })
})

// ── classifyBody ─────────────────────────────────────────────────────────────

describe('classifyBody', () => {
  it('classifies a plain query', () => {
    const result = classifyBody('{"query":"{ user { id } }"}')
    expect(result?.type).toBe('graphql')
    expect(result?.operationType).toBe('query')
  })

  it('extracts operationName from query string when not provided', () => {
    const result = classifyBody('{"query":"query GetUser { user { id } }"}')
    expect(result?.operationName).toBe('GetUser')
  })

  it('uses explicit operationName over extracted', () => {
    const result = classifyBody(
      '{"query":"query InternalName { user { id } }","operationName":"PublicName"}'
    )
    expect(result?.operationName).toBe('PublicName')
  })

  it('detects mutation operation type', () => {
    const result = classifyBody('{"query":"mutation CreateUser { createUser { id } }"}')
    expect(result?.operationType).toBe('mutation')
  })

  it('detects subscription operation type', () => {
    const result = classifyBody('{"query":"subscription OnUser { userUpdated { id } }"}')
    expect(result?.operationType).toBe('subscription')
  })

  it('defaults operationType to query when no keyword', () => {
    const result = classifyBody('{"query":"{ user { id } }"}')
    expect(result?.operationType).toBe('query')
  })

  it('handles batched array — uses first element only', () => {
    const result = classifyBody(
      '[{"query":"query First { a }"},{"query":"query Second { b }"}]'
    )
    expect(result?.operationName).toBe('First')
  })

  it('classifies persisted query (operationName + extensions.persistedQuery, no query)', () => {
    const result = classifyBody(
      '{"operationName":"GetUser","variables":{"id":"1"},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"abc"}}}'
    )
    expect(result?.type).toBe('graphql')
    expect(result?.operationName).toBe('GetUser')
  })

  it('guesses mutation from name prefix for persisted query', () => {
    const result = classifyBody(
      '{"operationName":"createUser","extensions":{"persistedQuery":{"version":1,"sha256Hash":"abc"}}}'
    )
    expect(result?.operationType).toBe('mutation')
  })

  it('guesses subscription from "subscribe" prefix for persisted query', () => {
    const result = classifyBody(
      '{"operationName":"subscribeToUpdates","extensions":{"persistedQuery":{"version":1,"sha256Hash":"abc"}}}'
    )
    expect(result?.operationType).toBe('subscription')
  })

  it('guesses subscription from on[A-Z] prefix', () => {
    const result = classifyBody(
      '{"operationName":"onUserUpdated","extensions":{"persistedQuery":{"version":1,"sha256Hash":"abc"}}}'
    )
    expect(result?.operationType).toBe('subscription')
  })

  it('returns null for undefined', () => {
    expect(classifyBody(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(classifyBody('')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(classifyBody('not-json')).toBeNull()
  })

  it('returns null for JSON without query field or persistedQuery extension', () => {
    expect(classifyBody('{"operationName":"Foo"}')).toBeNull()
  })

  it('preserves variables', () => {
    const result = classifyBody('{"query":"query GetUser($id: ID!) { user(id: $id) { id } }","variables":{"id":"1"}}')
    expect(result?.variables).toEqual({ id: '1' })
  })
})

// ── classifyUrl ──────────────────────────────────────────────────────────────

describe('classifyUrl', () => {
  it('classifies a GET URL with ?query=', () => {
    const result = classifyUrl('https://api.example.com/graphql?query={ user { id } }')
    expect(result?.type).toBe('graphql')
    expect(result?.operationType).toBe('query')
  })

  it('extracts operationName and variables from URL params', () => {
    const result = classifyUrl(
      'https://api.example.com/graphql?query=query GetUser($id: ID!){ user(id: $id){ id } }&operationName=GetUser&variables={"id":"1"}'
    )
    expect(result?.operationName).toBe('GetUser')
    expect(result?.variables).toEqual({ id: '1' })
  })

  it('tolerates bad variables JSON — still classifies', () => {
    const result = classifyUrl(
      'https://api.example.com/graphql?query={ user { id } }&variables=not-json'
    )
    expect(result?.type).toBe('graphql')
    expect(result?.variables).toBeUndefined()
  })

  it('classifies GET APQ with operationName + extensions.persistedQuery', () => {
    const ext = encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: 'abc' } }))
    const result = classifyUrl(
      `https://api.example.com/graphql?operationName=GetUser&extensions=${ext}`
    )
    expect(result?.type).toBe('graphql')
    expect(result?.operationName).toBe('GetUser')
  })

  it('returns null for URL without query or extensions', () => {
    expect(classifyUrl('https://api.example.com/graphql')).toBeNull()
  })

  it('returns null for a URL that causes new URL() to throw', () => {
    expect(classifyUrl('not-a-url')).toBeNull()
  })

  it('returns null when extensions has no persistedQuery', () => {
    const ext = encodeURIComponent(JSON.stringify({ otherExtension: {} }))
    expect(classifyUrl(
      `https://api.example.com/graphql?operationName=GetUser&extensions=${ext}`
    )).toBeNull()
  })
})

// ── classify ─────────────────────────────────────────────────────────────────

describe('classify', () => {
  it('body wins over URL when both present', () => {
    const result = classify(
      'https://api.example.com/graphql?query={ other }',
      '{"query":"{ user { id } }"}'
    )
    expect(result?.operationType).toBe('query')
  })

  it('falls back to URL when body is null/undefined', () => {
    const result = classify(
      'https://api.example.com/graphql?query=query GetUser { user { id } }'
    )
    expect(result?.operationName).toBe('GetUser')
  })

  it('returns null when neither body nor URL carries GraphQL', () => {
    expect(classify('https://api.example.com/rest', '{"key":"value"}')).toBeNull()
  })
})

// ── classifyAll ──────────────────────────────────────────────────────────────

describe('classifyAll', () => {
  it('returns single classification for non-array body', () => {
    const result = classifyAll('{"query":"{ user { id } }"}')
    expect(result).toHaveLength(1)
    expect(result[0].operationType).toBe('query')
  })

  it('returns a classification per operation in a batch', () => {
    const body = JSON.stringify([
      { query: 'query GetUser { user { id } }' },
      { query: 'mutation CreateUser { createUser { id } }' },
      { query: 'subscription OnUser { userUpdated { id } }' },
    ])
    const result = classifyAll(body)
    expect(result).toHaveLength(3)
    expect(result[0].operationType).toBe('query')
    expect(result[1].operationType).toBe('mutation')
    expect(result[2].operationType).toBe('subscription')
  })

  it('skips invalid elements in a batch', () => {
    const body = JSON.stringify([
      { query: 'query GetUser { user { id } }' },
      { notAQuery: true },
      { query: 'mutation CreateUser { createUser { id } }' },
    ])
    const result = classifyAll(body)
    expect(result).toHaveLength(2)
  })

  it('returns empty array for undefined', () => {
    expect(classifyAll(undefined)).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(classifyAll('not-json')).toEqual([])
  })

  it('returns empty array for body with no graphql ops', () => {
    expect(classifyAll('{"key":"value"}')).toEqual([])
  })
})

// ── classifyFrame ─────────────────────────────────────────────────────────────

describe('classifyFrame', () => {
  it('classifies a standard JSON body frame', () => {
    const result = classifyFrame('{"query":"{ user { id } }"}')
    expect(result?.type).toBe('graphql')
    expect(result?.operationType).toBe('query')
  })

  it('classifies a modern graphql-ws subscribe envelope', () => {
    const data = JSON.stringify({
      type: 'subscribe',
      id: '1',
      payload: { query: 'subscription OnUser { userUpdated { id } }', variables: {} },
    })
    const result = classifyFrame(data)
    expect(result?.type).toBe('graphql')
    expect(result?.operationType).toBe('subscription')
    expect(result?.variables).toEqual({})
  })

  it('classifies a legacy subscriptions-transport-ws start envelope', () => {
    const data = JSON.stringify({
      type: 'start',
      id: '2',
      payload: { query: 'query GetUser { user { id } }' },
    })
    const result = classifyFrame(data)
    expect(result?.type).toBe('graphql')
    expect(result?.operationType).toBe('query')
  })

  it('extracts operationName from subscribe payload', () => {
    const data = JSON.stringify({
      type: 'subscribe',
      id: '1',
      payload: {
        query: 'subscription OnUser { userUpdated { id } }',
        operationName: 'OnUser',
      },
    })
    const result = classifyFrame(data)
    expect(result?.operationName).toBe('OnUser')
  })

  it('returns null when subscribe payload has no query', () => {
    const data = JSON.stringify({
      type: 'subscribe',
      id: '1',
      payload: { variables: {} },
    })
    expect(classifyFrame(data)).toBeNull()
  })

  it('returns null for a graphql-ws next envelope (not subscribe/start)', () => {
    const data = JSON.stringify({
      type: 'next',
      id: '1',
      payload: { data: { userUpdated: { id: '1' } } },
    })
    expect(classifyFrame(data)).toBeNull()
  })

  it('returns null for non-JSON string', () => {
    expect(classifyFrame('not-json')).toBeNull()
  })

  it('standard body wins over graphql-ws envelope check', () => {
    // A body that has both query AND type:subscribe should use classifyBody path
    const data = JSON.stringify({ query: '{ user { id } }', type: 'subscribe' })
    const result = classifyFrame(data)
    expect(result?.type).toBe('graphql')
    expect(result?.operationType).toBe('query')
  })
})

// ── parseGraphqlWsMeta ────────────────────────────────────────────────────────

describe('parseGraphqlWsMeta', () => {
  it('extracts both id and type', () => {
    const result = parseGraphqlWsMeta('{"type":"subscribe","id":"1"}')
    expect(result).toEqual({ type: 'subscribe', id: '1' })
  })

  it('returns undefined for non-string id', () => {
    const result = parseGraphqlWsMeta('{"type":"next","id":42}')
    expect(result.id).toBeUndefined()
    expect(result.type).toBe('next')
  })

  it('returns undefined for non-string type', () => {
    const result = parseGraphqlWsMeta('{"type":1}')
    expect(result.type).toBeUndefined()
  })

  it('returns empty object for non-JSON string', () => {
    expect(parseGraphqlWsMeta('not-json')).toEqual({})
  })

  it('returns empty object for JSON null (not an object)', () => {
    expect(parseGraphqlWsMeta('null')).toEqual({})
  })

  it('returns undefined fields (not {}) for JSON array', () => {
    // Arrays pass typeof === 'object' check, but have no id/type string props
    const result = parseGraphqlWsMeta('[1,2,3]')
    expect(result.id).toBeUndefined()
    expect(result.type).toBeUndefined()
  })
})
