// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FilterBar } from './FilterBar'
import { DEFAULT_FILTER } from '../lib/filter'
import { DEFAULT_SETTINGS } from '../lib/settings'
import type { FilterState } from '../lib/types'

function renderBar(overrides?: Partial<Parameters<typeof FilterBar>[0]>) {
  const props = {
    filter: DEFAULT_FILTER,
    onChange: vi.fn(),
    onClear: vi.fn(),
    recording: true,
    onRecordingChange: vi.fn(),
    settings: DEFAULT_SETTINGS,
    onSettingsChange: vi.fn(),
    searchOpen: false,
    onSearchOpenChange: vi.fn(),
    ...overrides,
  }
  const utils = render(<FilterBar {...props} />)
  return { ...utils, props }
}

describe('FilterBar', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders without crashing', () => {
    renderBar()
    expect(screen.getByTitle(/Stop recording/)).toBeDefined()
    expect(screen.getByTitle(/Clear requests/)).toBeDefined()
  })

  // ── recording toggle ──────────────────────────────────────────────────────

  it('calls onRecordingChange(false) when recording is on and button is clicked', () => {
    const onRecordingChange = vi.fn()
    renderBar({ recording: true, onRecordingChange })
    fireEvent.click(screen.getByTitle('Stop recording'))
    expect(onRecordingChange).toHaveBeenCalledWith(false)
  })

  it('calls onRecordingChange(true) when recording is off', () => {
    const onRecordingChange = vi.fn()
    renderBar({ recording: false, onRecordingChange })
    fireEvent.click(screen.getByTitle('Start recording'))
    expect(onRecordingChange).toHaveBeenCalledWith(true)
  })

  // ── clear button ──────────────────────────────────────────────────────────

  it('calls onClear when Clear button is clicked', () => {
    const onClear = vi.fn()
    renderBar({ onClear })
    fireEvent.click(screen.getByTitle('Clear requests'))
    expect(onClear).toHaveBeenCalled()
  })

  // ── search toggle ─────────────────────────────────────────────────────────

  it('calls onSearchOpenChange(true) when search is closed', () => {
    const onSearchOpenChange = vi.fn()
    renderBar({ searchOpen: false, onSearchOpenChange })
    fireEvent.click(screen.getByTitle('Search all requests'))
    expect(onSearchOpenChange).toHaveBeenCalledWith(true)
  })

  it('calls onSearchOpenChange(false) when search is open', () => {
    const onSearchOpenChange = vi.fn()
    renderBar({ searchOpen: true, onSearchOpenChange })
    fireEvent.click(screen.getByTitle('Close search'))
    expect(onSearchOpenChange).toHaveBeenCalledWith(false)
  })

  // ── filter input debounce ─────────────────────────────────────────────────

  it('calls onChange after 150ms debounce on input change', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    renderBar({ onChange })

    fireEvent.change(screen.getByPlaceholderText('Filter'), {
      target: { value: 'GetUser' },
    })

    expect(onChange).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(150) })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'GetUser' })
    )
  })

  it('shows a clear-filter button when input has text', () => {
    renderBar({ filter: { ...DEFAULT_FILTER, search: 'test' } })
    expect(screen.getByTitle('Clear filter')).toBeDefined()
  })

  it('does not show clear-filter button when input is empty', () => {
    renderBar({ filter: DEFAULT_FILTER })
    expect(screen.queryByTitle('Clear filter')).toBeNull()
  })

  // ── invert checkbox ───────────────────────────────────────────────────────

  it('calls onChange with invertSearch toggled when Invert checkbox is clicked', () => {
    const onChange = vi.fn()
    renderBar({ filter: DEFAULT_FILTER, onChange })
    const checkbox = screen.getByRole('checkbox', { name: /Invert/i })
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ invertSearch: true })
    )
  })

  // ── preserve log checkbox ─────────────────────────────────────────────────

  it('calls onSettingsChange with toggled clearOnRefresh when Preserve log is clicked', () => {
    const onSettingsChange = vi.fn()
    renderBar({ settings: { ...DEFAULT_SETTINGS, clearOnRefresh: true }, onSettingsChange })
    const checkbox = screen.getByRole('checkbox', { name: /Preserve log/i })
    fireEvent.click(checkbox)
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ clearOnRefresh: false })
    )
  })

  // ── op-type pills ─────────────────────────────────────────────────────────

  it('clicking "All" clears opTypes', () => {
    const onChange = vi.fn()
    const filter: FilterState = { ...DEFAULT_FILTER, opTypes: new Set(['query']) }
    renderBar({ filter, onChange })
    fireEvent.click(screen.getByText('All'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      opTypes: expect.objectContaining({ size: 0 }),
    }))
  })

  it('clicking "Query" sets opTypes to {query}', () => {
    const onChange = vi.fn()
    renderBar({ onChange })
    fireEvent.click(screen.getByText('Query'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      opTypes: expect.objectContaining({ size: 1 }),
    }))
    const called = onChange.mock.calls[0][0] as FilterState
    expect(called.opTypes.has('query')).toBe(true)
  })

  it('clicking "Mutation" sets opTypes to {mutation}', () => {
    const onChange = vi.fn()
    renderBar({ onChange })
    fireEvent.click(screen.getByText('Mutation'))
    const called = onChange.mock.calls[0][0] as FilterState
    expect(called.opTypes.has('mutation')).toBe(true)
  })
})
