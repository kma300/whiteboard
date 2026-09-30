import { clamp, expandRect } from '../model/geometry'
import type { Rect } from '../model/types'

export const FLOATING_EDGE = 8
export const TOOLBAR_LEFT = 68
const TOOLBAR_TOP = 64
const TOOLBAR_BOTTOM = 60
const SELECTION_GAP = 32

type Size = { w: number; h: number }
export type FloatingPlacement = 'above' | 'below'

function overlap(a: Rect, b: Rect): number {
  return (
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  )
}

/** Keep the measured toolbar clear of the selection and the other canvas controls. */
export function toolbarPosition(
  selection: Rect,
  size: Size,
  viewport: Size,
  obstacles: Rect[] = [],
): { x: number; y: number; placement: FloatingPlacement } {
  const x = clamp(
    selection.x + selection.w / 2 - size.w / 2,
    TOOLBAR_LEFT,
    Math.max(TOOLBAR_LEFT, viewport.w - FLOATING_EDGE - size.w),
  )
  const maxTop = Math.max(TOOLBAR_TOP, viewport.h - TOOLBAR_BOTTOM - size.h)
  const above = selection.y - SELECTION_GAP - size.h
  const below = selection.y + selection.h + SELECTION_GAP
  const candidates = [
    above,
    below,
    ...obstacles.flatMap((r) => [r.y - FLOATING_EDGE - size.h, r.y + r.h + FLOATING_EDGE]),
    TOOLBAR_TOP,
    maxTop,
  ]
  const clearSelection = expandRect(selection, SELECTION_GAP)
  let y = TOOLBAR_TOP
  let best = Infinity
  for (const candidate of candidates) {
    const top = clamp(candidate, TOOLBAR_TOP, maxTop)
    const rect = { x, y: top, ...size }
    const score =
      obstacles.reduce((total, r) => total + overlap(rect, expandRect(r, FLOATING_EDGE)), 0) *
        10000 +
      overlap(rect, clearSelection) * 1000 +
      Math.abs(top - above)
    if (score < best) {
      best = score
      y = top
    }
  }
  return { x, y, placement: y + size.h <= selection.y ? 'above' : 'below' }
}

/** Open a menu away from its selection, flipping it when the window edge is too close. */
export function popoverPosition(
  anchor: Rect,
  size: Size,
  viewport: Size,
  preferred: FloatingPlacement,
): { x: number; y: number } {
  const x = clamp(
    anchor.x + anchor.w / 2 - size.w / 2,
    FLOATING_EDGE,
    Math.max(FLOATING_EDGE, viewport.w - FLOATING_EDGE - size.w),
  )
  const above = anchor.y - FLOATING_EDGE - size.h
  const below = anchor.y + anchor.h + FLOATING_EDGE
  const fitsAbove = above >= FLOATING_EDGE
  const fitsBelow = below + size.h <= viewport.h - FLOATING_EDGE
  const top =
    preferred === 'above'
      ? fitsAbove || !fitsBelow
        ? above
        : below
      : fitsBelow || !fitsAbove
        ? below
        : above
  return {
    x,
    y: clamp(top, FLOATING_EDGE, Math.max(FLOATING_EDGE, viewport.h - FLOATING_EDGE - size.h)),
  }
}
