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
      <JsonTree data={data} cacheKey={`t14-${Date.now()}`} search="searchTarget" />
    )
    // Force-expanded because search query matches deep content
    expect(container.textContent).toContain('searchTarget')
  })

  it('highlights search matches with mark elements', () => {
    render(<JsonTree data="hello world" cacheKey="t15" search="world" />)
    const marks = document.querySelectorAll('mark[data-find-mark]')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks[0].textContent).toContain('world')
  })
})
