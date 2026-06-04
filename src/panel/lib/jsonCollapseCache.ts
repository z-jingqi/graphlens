const cache = new Map<string, Map<string, boolean>>()
const MAX_ENTRIES = 200

export function getCollapsed(cacheKey: string, path: string, depth: number): boolean {
  const entry = cache.get(cacheKey)
  if (!entry || !entry.has(path)) return depth > 2
  return entry.get(path)!
}

export function setCollapsed(cacheKey: string, path: string, value: boolean): void {
  if (!cache.has(cacheKey)) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!)
    cache.set(cacheKey, new Map())
  }
  cache.get(cacheKey)!.set(path, value)
}
