// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { JsonTree } from './JsonTree'

// Silence the clipboard warning in happy-dom
beforeEach(() => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('JsonTree', () => {
  // ── primitives ─────────────────────────────────────────────────────────────

  it('renders a string value with surrounding quotes', () => {
    const { container } = render(<JsonTree data="hello" cacheKey="t1" />)
    expect(container.textContent).toContain('"hello"')
  })

  it('renders a number value', () => {
    render(<JsonTree data={42} cacheKey="t2" />)
    expect(screen.getByText('42')).toBeDefined()
  })

  it('renders boolean true', () => {
    render(<JsonTree data={true} cacheKey="t3" />)
    expect(screen.getByText('true')).toBeDefined()
  })

  it('renders boolean false', () => {
    render(<JsonTree data={false} cacheKey="t4" />)
    expect(screen.getByText('false')).toBeDefined()
  })

  it('renders null', () => {
    render(<JsonTree data={null} cacheKey="t5" />)
    expect(screen.getByText('null')).toBeDefined()
  })

  it('truncates strings longer than 100 chars', () => {
    const long = 'a'.repeat(150)
    const { container } = render(<JsonTree data={long} cacheKey="t6" />)
    // Displays only first 100 chars
    expect(container.textContent).toContain('a'.repeat(100))
    expect(container.textContent).toContain('150 chars')
  })

  // ── objects ────────────────────────────────────────────────────────────────

  it('renders object keys', () => {
    render(<JsonTree data={{ name: 'Alice', age: 30 }} cacheKey="t7" />)
    expect(screen.getByText(/name/)).toBeDefined()
    expect(screen.getByText(/age/)).toBeDefined()
  })

  it('renders a summary count for expanded objects', () => {
    const { container } = render(<JsonTree data={{ a: 1, b: 2 }} cacheKey="t8" />)
    expect(container.textContent).toContain('2 keys')
  })

  it('renders empty object without expand toggle', () => {
    const { container } = render(<JsonTree data={{}} cacheKey="t9" />)
    expect(container.textContent).toContain('{}')
  })

  // ── arrays ─────────────────────────────────────────────────────────────────

  it('renders array with item count', () => {
    const { container } = render(<JsonTree data={[1, 2, 3]} cacheKey="t10" />)
    expect(container.textContent).toContain('3 items')
  })

  it('renders empty array without expand toggle', () => {
    const { container } = render(<JsonTree data={[]} cacheKey="t11" />)
    expect(container.textContent).toContain('[]')
  })

  it('renders long arrays as collapsed index ranges', () => {
    const data = Array.from({ length: 60 }, (_, i) => `item-${i}`)
    const { container } = render(<JsonTree data={data} cacheKey={`t20-${Date.now()}`} />)

    expect(container.textContent).toContain('[0…49]')
    expect(container.textContent).toContain('[50…59]')
    expect(container.textContent).not.toContain('item-55')
  })

  it('expands a long-array range on click', () => {
    const data = Array.from({ length: 60 }, (_, i) => `item-${i}`)
    const { container } = render(<JsonTree data={data} cacheKey={`t21-${Date.now()}`} />)
    const range = screen.getByText('[50…59]').closest('[class*="cursor-pointer"]')

    expect(range).not.toBeNull()
    fireEvent.click(range!)

    expect(container.textContent).toContain('item-55')
    expect(container.textContent).not.toContain('item-10')
  })

  it('auto-expands the long-array range that contains a search match', () => {
    const data = Array.from({ length: 60 }, (_, i) => `item-${i}`)
    const { container } = render(
      <JsonTree
        data={data}
        cacheKey={`t22-${Date.now()}`}
        search="item-55"
        searchExpandToken={1}
      />
    )

    expect(container.textContent).toContain('item-55')
    expect(container.textContent).not.toContain('item-10')
  })

  // ── collapse/expand at depth ───────────────────────────────────────────────

  it('auto-collapses objects nested at depth > 2', () => {
    const data = { l1: { l2: { l3: { l4: 'deep' } } } }
    const { container } = render(<JsonTree data={data} cacheKey={`t12-${Date.now()}`} />)
    // l4 (depth 3) should be collapsed, so its value shouldn't be visible
    expect(container.textContent).not.toContain('"deep"')
  })

  it('toggles collapse on click', () => {
    // A simple object at depth 0 that starts expanded
    const { container } = render(
      <JsonTree data={{ x: 'visible-value' }} cacheKey={`t13-${Date.now()}`} />
    )
    expect(container.textContent).toContain('"visible-value"')

    // Click the header to collapse
    const rows = container.querySelectorAll('[class*="cursor-pointer"]')
    if (rows.length > 0) {
      fireEvent.click(rows[0])
      // After collapse, the value should not be visible
      expect(container.textContent).not.toContain('"visible-value"')
    }
  })

  // ── search / highlight ─────────────────────────────────────────────────────

  it('force-expands a collapsed subtree that contains a search match', () => {
    // depth 3 would normally collapse; with a search that matches, it expands
    const data = { l1: { l2: { l3: { l4: 'searchTarget' } } } }
    const { container } = render(
      <JsonTree
        data={data}
        cacheKey={`t14-${Date.now()}`}
        search="searchTarget"
        searchExpandToken={1}
      />
    )
    // Force-expanded because search query matches deep content
    expect(container.textContent).toContain('searchTarget')
  })

  it('allows manually collapsing an auto-expanded search match', () => {
    const data = { l1: { l2: { l3: { l4: 'searchTarget' } } } }
    const { container } = render(
      <JsonTree
        data={data}
        cacheKey={`t16-${Date.now()}`}
        search="searchTarget"
        searchExpandToken={1}
      />
    )
    expect(container.textContent).toContain('searchTarget')

    const rows = container.querySelectorAll('[class*="cursor-pointer"]')
    fireEvent.click(rows[0])

    expect(container.textContent).not.toContain('searchTarget')
  })

  it('keeps search match count stable when a matched subtree is collapsed', () => {
    const data = {
      first: { value: 'needle' },
      second: { value: 'needle' },
    }
    const { container } = render(
      <JsonTree
        data={data}
        cacheKey={`t23-${Date.now()}`}
        search="needle"
        searchExpandToken={1}
      />
    )
    expect(container.querySelectorAll('[data-find-mark]')).toHaveLength(2)

    const firstRow = screen.getByText('first').closest('[class*="cursor-pointer"]')
    expect(firstRow).not.toBeNull()
    fireEvent.click(firstRow!)

    expect(container.querySelectorAll('[data-find-mark]')).toHaveLength(2)
  })

  it('keeps long-array search match count stable when a matched range is collapsed', () => {
    const data = Array.from({ length: 60 }, (_, i) => i === 55 || i === 56 ? 'needle' : `item-${i}`)
    const { container } = render(
      <JsonTree
        data={data}
        cacheKey={`t24-${Date.now()}`}
        search="needle"
        searchExpandToken={1}
      />
    )
    expect(container.querySelectorAll('[data-find-mark]')).toHaveLength(2)

    const range = screen.getByText('[50…59]').closest('[class*="cursor-pointer"]')
    expect(range).not.toBeNull()
    fireEvent.click(range!)

    expect(container.textContent).not.toContain('needle')
    expect(container.querySelectorAll('[data-find-mark]')).toHaveLength(2)
  })

  it('re-expands a collapsed long-array range when the expand token changes', () => {
    const data = Array.from({ length: 60 }, (_, i) => i === 55 ? 'needle' : `item-${i}`)
    const cacheKey = `t25-${Date.now()}`
    const { container, rerender } = render(
      <JsonTree
        data={data}
        cacheKey={cacheKey}
        search="needle"
        searchExpandToken={1}
      />
    )
    expect(container.textContent).toContain('needle')

    const range = screen.getByText('[50…59]').closest('[class*="cursor-pointer"]')
    expect(range).not.toBeNull()
    fireEvent.click(range!)
    expect(container.textContent).not.toContain('needle')

    rerender(
      <JsonTree
        data={data}
        cacheKey={cacheKey}
        search="needle"
        searchExpandToken={2}
      />
    )

    expect(container.textContent).toContain('needle')
  })

  it('re-expands a manually collapsed search match when the expand token changes', () => {
    const data = { l1: { l2: { l3: { l4: 'searchTarget' } } } }
    const cacheKey = `t17-${Date.now()}`
    const { container, rerender } = render(
      <JsonTree
        data={data}
        cacheKey={cacheKey}
        search="searchTarget"
        searchExpandToken={1}
      />
    )

    const rows = container.querySelectorAll('[class*="cursor-pointer"]')
    fireEvent.click(rows[0])
    expect(container.textContent).not.toContain('searchTarget')

    rerender(
      <JsonTree
        data={data}
        cacheKey={cacheKey}
        search="searchTarget"
        searchExpandToken={2}
      />
    )

    expect(container.textContent).toContain('searchTarget')
  })

  it('does not persist search-driven expansion to the collapse cache', () => {
    const data = { l1: { l2: { l3: { l4: 'searchTarget' } } } }
    const cacheKey = `t18-${Date.now()}`
    const { container, unmount } = render(
      <JsonTree
        data={data}
        cacheKey={cacheKey}
        search="searchTarget"
        searchExpandToken={1}
      />
    )
    expect(container.textContent).toContain('searchTarget')

    unmount()
    const fresh = render(<JsonTree data={data} cacheKey={cacheKey} />)

    expect(fresh.container.textContent).not.toContain('searchTarget')
  })

  it('persists manual collapse to the collapse cache', () => {
    const data = { x: 'visible-value' }
    const cacheKey = `t19-${Date.now()}`
    const { container, unmount } = render(<JsonTree data={data} cacheKey={cacheKey} />)
    expect(container.textContent).toContain('visible-value')

    const rows = container.querySelectorAll('[class*="cursor-pointer"]')
    fireEvent.click(rows[0])
    expect(container.textContent).not.toContain('visible-value')

    unmount()
    const fresh = render(<JsonTree data={data} cacheKey={cacheKey} />)

    expect(fresh.container.textContent).not.toContain('visible-value')
  })

  it('highlights search matches with mark elements', () => {
    render(<JsonTree data="hello world" cacheKey="t15" search="world" />)
    const marks = document.querySelectorAll('mark[data-find-mark]')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks[0].textContent).toContain('world')
  })
})
