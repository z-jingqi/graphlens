export interface HarHeader {
  name: string
  value: string
}

export interface HarPostData {
  mimeType: string
  text: string
}

export interface HarEntry {
  request: {
    method: string
    url: string
    headers: HarHeader[]
    postData?: HarPostData
  }
  response: {
    status: number
    statusText: string
    headers: HarHeader[]
    content: { mimeType: string; size: number }
  }
  startedDateTime: string
  time: number
  /** Chrome-DevTools extension to the HAR spec — populated for live captures. */
  _resourceType?: string
  getContent(callback: (content: string, encoding: string) => void): void
}

export type RequestType = 'graphql' | 'websocket' | 'sse'
export type GqlOperationType = 'query' | 'mutation' | 'subscription'
export type RequestState = 'pending' | 'open' | 'finished' | 'closed' | 'error'
export type Transport = 'websocket' | 'sse'

export interface Classification {
  type: RequestType
  operationName?: string
  operationType?: GqlOperationType
  query?: string
  variables?: unknown
}

export interface CapturedFrame {
  direction: 'send' | 'receive'
  timestamp: number
  data: string
  eventName?: string
  classification?: Classification
  /** graphql-ws protocol id — correlates subscribe/next/complete messages. */
  correlationId?: string
  /** graphql-ws message type: 'subscribe' | 'next' | 'complete' | 'error' | etc. */
  messageType?: string
}

export interface CapturedRequest {
  id: string
  state: RequestState
  url: string
  method: string
  startedAt: number          // ms epoch when request fired (from patch) or HAR.startedDateTime
  classification: Classification
  transport?: Transport
  har?: HarEntry             // populated when HAR.onRequestFinished arrives
  requestBody?: string         // request body from patch (pending display; HAR postData takes precedence)
  responseBody?: string
  responseJson?: unknown
  hasErrors: boolean
  timestamp: number
  duration: number           // for pending: 0 until completed/HAR; then ms
  status: number             // 0 while pending
  frames?: CapturedFrame[]   // WS frames and SSE events (capped at 1000)
  /** All operations from a batched request (only set when batch length > 1). */
  operations?: Classification[]
}

export interface FilterState {
  search: string
  invertSearch: boolean
  opTypes: Set<GqlOperationType>
  requestTypes: Set<RequestType>
}
