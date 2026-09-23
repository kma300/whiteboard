import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ORDER,
  assignKey,
  normalizeKey,
  sanitizeShortcuts,
} from './shortcuts'

describe('custom shortcuts', () => {
  it('ships defaults with no duplicate keys', () => {
    const keys = SHORTCUT_ORDER.map((a) => DEFAULT_SHORTCUTS[a]).filter((k) => k !== null)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('moves a key that another action was using', () => {
    const { map, displaced } = assignKey(DEFAULT_SHORTCUTS, 'pen', 'n')
    expect(map.pen).toBe('n')
    expect(map.sticky).toBeNull()
    expect(displaced).toBe('sticky')
  })

  it('clears a shortcut with null', () => {
    const { map, displaced } = assignKey(DEFAULT_SHORTCUTS, 'rect', null)
    expect(map.rect).toBeNull()
    expect(displaced).toBeNull()
  })

  it('accepts single printable keys only', () => {
    expect(normalizeKey('K')).toBe('k')
    expect(normalizeKey('7')).toBe('7')
    expect(normalizeKey(' ')).toBeNull()
    expect(normalizeKey('Enter')).toBeNull()
  })

  it('recovers from bad stored data', () => {
    expect(sanitizeShortcuts('nope')).toEqual(DEFAULT_SHORTCUTS)
    const map = sanitizeShortcuts({ pen: 'K', frame: 'Enter', hand: null, bogus: 'x', text: 'k' })
    expect(map.hand).toBeNull()
    expect(map.frame).toBe('f')
    // Two actions claimed "k"; the later one keeps it and the earlier one loses it.
    expect([map.pen, map.text].filter((k) => k === 'k')).toHaveLength(1)
  })
})
