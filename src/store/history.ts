import type { Item, Items } from '../model/types'

/** Item id to its new value, or null to delete it. */
export type Patch = Record<string, Item | null>

export interface HistoryEntry {
  before: Patch
  after: Patch
  selectionBefore: string[]
  selectionAfter: string[]
}

export const HISTORY_LIMIT = 200

/** Structural equality for plain JSON-like values. Keys holding `undefined` count as absent. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => valuesEqual(v, b[i]))
  }
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined)
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined)
  if (ka.length !== kb.length) return false
  return ka.every((k) => valuesEqual(ra[k], rb[k]))
}

/** Turns the recorded "before" values into an undo entry, dropping ids that ended unchanged. */
export function buildEntry(
  before: Patch,
  items: Items,
  selectionBefore: string[],
  selectionAfter: string[],
): HistoryEntry | null {
  const b: Patch = {}
  const a: Patch = {}
  let changed = false
  for (const id of Object.keys(before)) {
    const prev = before[id]
    const next = items[id] ?? null
    if (!valuesEqual(prev, next)) {
      b[id] = prev
      a[id] = next
      changed = true
    }
  }
  return changed ? { before: b, after: a, selectionBefore, selectionAfter } : null
}
