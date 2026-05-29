export function makeSnippet(
  text: string,
  start: number,
  end: number,
  ctx = 30
): { pre: string; match: string; post: string } {
  const preStart = Math.max(0, start - ctx)
  const postEnd = Math.min(text.length, end + ctx)
  const pre = (preStart > 0 ? '…' : '') + text.slice(preStart, start)
  const post = text.slice(end, postEnd) + (postEnd < text.length ? '…' : '')
  return { pre, match: text.slice(start, end), post }
}
