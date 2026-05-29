import Prism from 'prismjs'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-graphql'
import { parse, print } from 'graphql'
import { useMemo } from 'react'

interface Props {
  code: string
  language: 'graphql' | 'json'
}

function tryPrint(src: string): string {
  try { return print(parse(src)) } catch { return src }
}

export function HighlightedCode({ code, language }: Props) {
  const html = useMemo(() => {
    const src = language === 'graphql' ? tryPrint(code) : code
    return Prism.highlight(src, Prism.languages[language] ?? Prism.languages.plain, language)
  }, [code, language])
  return (
    <pre className="font-mono text-xs leading-relaxed whitespace-pre m-0">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
