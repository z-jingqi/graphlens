import { describe, it, expect } from 'vitest'
import { buildGroups } from './DetailPanel'
import type { CapturedFrame } from '../lib/types'

function frame(overrides?: Partial<CapturedFrame>): CapturedFrame {
  return {
    direction: 'receive',
    timestamp: Date.now(),
    data: '{}',
    ...overrides,
  }
}

describe('buildGroups', () => {
  it('returns an empty array for empty frames', () => {
    expect(buildGroups([])).toEqual([])
  })

  // ── correlationId-based groups (graphql-ws subscriptions) ─────────────────

  it('groups frames with the same correlationId into one group', () => {
    const frames = [
      frame({ correlationId: 'abc', messageType: 'subscribe' }),
      frame({ correlationId: 'abc', messageType: 'next' }),
      frame({ correlationId: 'abc', messageType: 'complete' }),
    ]
    const groups = buildGroups(frames)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('abc')
    expect(groups[0].subLabel).toBe('#abc')
    expect(groups[0].frames).toHaveLength(3)
  })

  it('different correlationIds create separate groups', () => {
    const frames = [
      frame({ correlationId: '1' }),
      frame({ correlationId: '2' }),
    ]
    const groups = buildGroups(frames)
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.key)).toEqual(['1', '2'])
  })

  it('defaults group label to "Subscription" when no operationName on first frame', () => {
    const frames = [frame({ correlationId: 'x', classification: undefined })]
    const groups = buildGroups(frames)
    expect(groups[0].label).toBe('Subscription')
  })

  it('uses operationName from classification when available', () => {
    const frames = [
      frame({
        correlationId: 'x',
        classification: { type: 'graphql', operationName: 'OnUserUpdated' },
      }),
    ]
    const groups = buildGroups(frames)
    expect(groups[0].label).toBe('OnUserUpdated')
  })

  it('upgrades label from "Subscription" to operationName when a later frame reveals it', () => {
    const frames = [
      // First frame has no operationName
      frame({ correlationId: 'x', classification: undefined }),
      // Second frame has it
      frame({
        correlationId: 'x',
        classification: { type: 'graphql', operationName: 'OnUserUpdated' },
      }),
    ]
    const groups = buildGroups(frames)
    expect(groups[0].label).toBe('OnUserUpdated')
  })

  // ── eventName-based groups (SSE events) ───────────────────────────────────

  it('groups SSE frames by eventName', () => {
    const frames = [
      frame({ eventName: 'next' }),
      frame({ eventName: 'next' }),
      frame({ eventName: 'complete' }),
    ]
    const groups = buildGroups(frames)
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.key)).toEqual(['next', 'complete'])
    expect(groups[0].frames).toHaveLength(2)
  })

  it('uses eventName as label for SSE groups', () => {
    const frames = [frame({ eventName: 'data' })]
    const groups = buildGroups(frames)
    expect(groups[0].label).toBe('data')
    expect(groups[0].subLabel).toBeUndefined()
  })

  // ── fallback __other__ group ───────────────────────────────────────────────

  it('puts frames with neither correlationId nor eventName into __other__ group', () => {
    const frames = [frame(), frame()]
    const groups = buildGroups(frames)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('__other__')
    expect(groups[0].label).toBe('Other')
  })

  // ── insertion order preserved ─────────────────────────────────────────────

  it('preserves the order of first-seen keys', () => {
    const frames = [
      frame({ correlationId: 'b' }),
      frame({ correlationId: 'a' }),
      frame({ correlationId: 'c' }),
    ]
    const groups = buildGroups(frames)
    expect(groups.map(g => g.key)).toEqual(['b', 'a', 'c'])
  })

  it('preserves original frame indices', () => {
    const frames = [
      frame({ correlationId: 'x', data: 'first' }),
      frame({ correlationId: 'y', data: 'second' }),
      frame({ correlationId: 'x', data: 'third' }),
    ]
    const groups = buildGroups(frames)
    const xGroup = groups.find(g => g.key === 'x')!
    expect(xGroup.frames[0].index).toBe(0)
    expect(xGroup.frames[1].index).toBe(2)
  })

  // ── mixed groups ──────────────────────────────────────────────────────────

  it('handles a mix of correlationId, eventName, and unkeyed frames', () => {
    const frames = [
      frame({ correlationId: 'sub1' }),
      frame({ eventName: 'message' }),
      frame(), // __other__
    ]
    const groups = buildGroups(frames)
    expect(groups).toHaveLength(3)
    expect(groups[0].key).toBe('sub1')
    expect(groups[1].key).toBe('message')
    expect(groups[2].key).toBe('__other__')
  })
})
