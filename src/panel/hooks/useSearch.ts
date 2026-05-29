import { useState, useEffect, useMemo } from 'react'
import type { CapturedRequest } from '../lib/types'
import { searchRequests } from '../search/engine'
import type { SearchResult } from '../search/types'

export function useSearch(requests: CapturedRequest[]): {
  input: string
  setInput: (v: string) => void
  query: string
  results: SearchResult[]
} {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 150)
    return () => clearTimeout(id)
  }, [input])

  const results = useMemo<SearchResult[]>(() => {
    if (!query) return []
    return searchRequests(requests, query)
  }, [requests, query])

  return { input, setInput, query, results }
}
