/**
 * GraphLens mock GraphQL server — used for manual smoke-testing and Playwright E2E.
 *
 * Endpoints:
 *   POST /graphql            single op | batch | persisted query | errors endpoint
 *   GET  /graphql            GET query | GET APQ
 *   POST /graphql/stream     graphql-sse (proper GraphQL-over-SSE via graphql-sse library)
 *   GET  /graphql/events     EventSource SSE (plain, negative test)
 *   WS   /graphql/ws         graphql-ws (graphql-transport-ws subprotocol)
 *   WS   /plain/ws           plain echo WebSocket (negative test — no graphql)
 *   GET  /plain/sse          plain text SSE (negative test — no graphql)
 *
 * Run: node test-app/server.mjs
 */

import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { buildSchema, execute, subscribe as graphqlSubscribe, parse as parseGql } from 'graphql'
import { createHandler as createSseHandler } from 'graphql-sse/lib/use/http'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/use/ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 3099

// ── GraphQL schema ────────────────────────────────────────────────────────────

const schema = buildSchema(`
  type Query {
    hello: String
    user(id: ID!): User
    error: String
  }
  type User {
    id: ID!
    name: String!
  }
  type Mutation {
    createUser(name: String!): User
    updateUser(id: ID!, name: String!): User
  }
  type Subscription {
    countdown(from: Int): Int
  }
`)

// Flat rootValue used by graphql-js execute/subscribe directly
const rootValue = {
  hello: () => 'Hello, World!',
  user: ({ id }) => ({ id, name: `User ${id}` }),
  error: () => { throw new Error('Intentional error') },
  createUser: ({ name }) => ({ id: String(Math.random()).slice(2, 8), name }),
  updateUser: ({ id, name }) => ({ id, name }),
  // Subscription field: returns AsyncIterable directly (graphql-js rootValue style)
  countdown: async function* ({ from = 3 }) {
    for (let i = from; i >= 0; i--) {
      await new Promise(r => setTimeout(r, 150))
      yield { countdown: i }
    }
  },
}

// ── graphql-sse handler (proper GraphQL-over-SSE) ─────────────────────────────

const sseHandler = createSseHandler({
  schema,
  execute,
  subscribe: graphqlSubscribe,
  onSubscribe: (_req, params) => ({
    schema,
    document: parseGql(params.query ?? ''),
    operationName: params.operationName,
    variableValues: params.variables,
    rootValue,
  }),
})

// ── GraphQL execution helpers ─────────────────────────────────────────────────

async function handleGraphQLOp(op) {
  const { query, operationName, variables } = op
  try {
    // Persisted query (no query field — just return mock data for demo)
    if (!query && op.extensions?.persistedQuery) {
      return { data: { hello: `persisted:${operationName}` } }
    }
    const document = parseGql(query)
    const result = await execute({
      schema,
      document,
      rootValue,
      contextValue: {},
      variableValues: variables,
      operationName,
    })
    return result
  } catch (err) {
    return { errors: [{ message: String(err.message) }] }
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  // ── Serve index.html ──────────────────────────────────────────────────────
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(html); return
  }

  // ── POST /graphql — single, batch, persisted, error ───────────────────────
  if (req.method === 'POST' && url.pathname === '/graphql') {
    let body = ''
    for await (const chunk of req) body += chunk
    try {
      const payload = JSON.parse(body)
      let result
      if (Array.isArray(payload)) {
        result = await Promise.all(payload.map(handleGraphQLOp))
      } else {
        result = await handleGraphQLOp(payload)
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(result)); return
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ errors: [{ message: 'Bad request' }] })); return
    }
  }

  // ── POST /graphql/error — always returns errors[] ─────────────────────────
  if (req.method === 'POST' && url.pathname === '/graphql/error') {
    let body = ''
    for await (const chunk of req) body += chunk
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: null, errors: [{ message: 'Intentional server error', locations: [{ line: 1, column: 1 }] }] })); return
  }

  // ── GET /graphql — query params or APQ ───────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/graphql') {
    const query = url.searchParams.get('query')
    const operationName = url.searchParams.get('operationName') ?? undefined
    const variablesRaw = url.searchParams.get('variables')
    const extensionsRaw = url.searchParams.get('extensions')
    let variables
    try { if (variablesRaw) variables = JSON.parse(variablesRaw) } catch {}
    let extensions
    try { if (extensionsRaw) extensions = JSON.parse(extensionsRaw) } catch {}

    const result = await handleGraphQLOp({ query: query ?? undefined, operationName, variables, extensions })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(result)); return
  }

  // ── /graphql/stream — proper GraphQL-over-SSE via graphql-sse ───────────
  // Client POSTs {"query":"subscription {...}"} with Accept: text/event-stream.
  // GraphLens sees the POST body → creates the row → sse-start flips transport.
  if (url.pathname === '/graphql/stream') {
    try {
      await sseHandler(req, res)
    } catch (err) {
      console.error('graphql-sse error:', err)
      if (!res.headersSent) res.writeHead(500).end()
    }
    return
  }

  // ── GET /graphql/events — EventSource SSE (GraphQL events) ───────────────
  if (req.method === 'GET' && url.pathname === '/graphql/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    let i = 0
    const iv = setInterval(() => {
      if (i < 3) {
        res.write(`data: {"data":{"hello":"message ${i}"}}\n\n`)
        i++
      } else {
        clearInterval(iv)
        res.end()
      }
    }, 150)
    req.on('close', () => clearInterval(iv))
    return
  }

  // ── GET /plain/sse — plain (non-GraphQL) SSE, negative test ──────────────
  if (req.method === 'GET' && url.pathname === '/plain/sse') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    let i = 0
    const iv = setInterval(() => {
      if (i < 3) {
        res.write(`data: plain event ${i}\n\n`)
        i++
      } else {
        clearInterval(iv)
        res.end()
      }
    }, 150)
    req.on('close', () => clearInterval(iv))
    return
  }

  // ── Static files from dist/ (for E2E panel tests) ────────────────────────
  if (req.method === 'GET') {
    const distDir = path.join(__dirname, '../dist')
    const filePath = path.join(distDir, url.pathname)
    // Ensure path stays inside dist/
    if (filePath.startsWith(distDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath)
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' }
      res.writeHead(200, { 'content-type': mime[ext] ?? 'application/octet-stream' })
      fs.createReadStream(filePath).pipe(res)
      return
    }
  }

  res.writeHead(404); res.end('Not found')
})

// ── WebSocket servers ─────────────────────────────────────────────────────────

// graphql-ws server (graphql-transport-ws subprotocol)
const gqlWsServer = new WebSocketServer({ noServer: true })
useServer(
  {
    schema,
    execute,
    subscribe: graphqlSubscribe,
    onSubscribe: (_ctx, msg) => ({
      schema,
      document: parseGql(msg.payload.query ?? ''),
      operationName: msg.payload.operationName,
      variableValues: msg.payload.variables,
      rootValue,
    }),
  },
  gqlWsServer
)

// Plain echo WS server (negative test — sends non-graphql JSON)
const plainWsServer = new WebSocketServer({ noServer: true })
plainWsServer.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connected', message: 'plain echo server' }))
  ws.on('message', data => ws.send(data)) // echo
})

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/graphql/ws') {
    gqlWsServer.handleUpgrade(req, socket, head, ws => {
      gqlWsServer.emit('connection', ws, req)
    })
  } else if (url.pathname === '/plain/ws') {
    plainWsServer.handleUpgrade(req, socket, head, ws => {
      plainWsServer.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

httpServer.listen(PORT, () => {
  console.log(`\nGraphLens test server running at http://localhost:${PORT}`)
  console.log('  POST /graphql          HTTP query/mutation/batch/persisted')
  console.log('  GET  /graphql          HTTP GET query/APQ')
  console.log('  GET  /graphql/stream   fetch-SSE')
  console.log('  GET  /graphql/events   EventSource SSE')
  console.log('  WS   /graphql/ws       graphql-ws subscriptions')
  console.log('  WS   /plain/ws         plain (non-GraphQL) WebSocket')
  console.log('  GET  /plain/sse        plain (non-GraphQL) SSE')
  console.log('\nOpen http://localhost:3099 in Chrome with GraphLens loaded.\n')
})
