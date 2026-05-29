export type SearchLocation =
  | { kind: 'operationName' }
  | { kind: 'url' }
  | { kind: 'query' }
  | { kind: 'variables' }
  | { kind: 'requestBody' }
  | { kind: 'responseBody' }
  | { kind: 'frame'; frameIndex: number; eventName?: string }

export interface SearchHit {
  location: SearchLocation
  snippet: { pre: string; match: string; post: string }
}

export interface SearchResult {
  requestId: string
  hits: SearchHit[]
}
