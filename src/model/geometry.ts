import type { BoxItem, Camera, Rect, Side, Vec } from './types'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s })
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

export function normalize(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y)
  return len === 0 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len }
}

export function screenToWorld(p: Vec, cam: Camera): Vec {
  return { x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom }
}

export function worldToScreen(p: Vec, cam: Camera): Vec {
  return { x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y }
}

export function toScreenRect(r: Rect, cam: Camera): Rect {
  const p = worldToScreen(r, cam)
  return { x: p.x, y: p.y, w: r.w * cam.zoom, h: r.h * cam.zoom }
}

export const clampZoom = (zoom: number) => clamp(zoom, MIN_ZOOM, MAX_ZOOM)

/** Zoom so the world point under `screen` stays under `screen`. */
export function zoomAt(cam: Camera, screen: Vec, zoom: number): Camera {
  const z = clampZoom(zoom)
  const world = screenToWorld(screen, cam)
  return { zoom: z, x: screen.x - world.x * z, y: screen.y - world.y * z }
}

export function rectFromPoints(a: Vec, b: Vec): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

export function rectContains(r: Rect, p: Vec): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w)
    y2 = Math.max(y2, r.y + r.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function boundsOfPoints(points: Vec[]): Rect | null {
  if (points.length === 0) return null
  return unionRects(points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))
}

export const expandRect = (r: Rect, d: number): Rect => ({
  x: r.x - d,
  y: r.y - d,
  w: r.w + d * 2,
  h: r.h + d * 2,
})

export const rectCenter = (r: Rect): Vec => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return distance(p, a)
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1)
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

export function sideAnchor(r: Rect, side: Side): Vec {
  switch (side) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y }
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 }
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h }
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 }
  }
}

export function sideNormal(side: Side): Vec {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 }
    case 'right':
      return { x: 1, y: 0 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
  }
}

/** Side of `r` that faces `p`, judged relative to the rect's proportions. */
export function nearestSide(r: Rect, p: Vec): Side {
  const c = rectCenter(r)
  const dx = (p.x - c.x) / Math.max(r.w / 2, 1)
  const dy = (p.y - c.y) / Math.max(r.h / 2, 1)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'bottom' : 'top'
}

export const boxRect = (item: BoxItem): Rect => ({ x: item.x, y: item.y, w: item.w, h: item.h })

/** Camera that fits `bounds` inside a viewport, never zooming in past `maxZoom`. */
export function fitCamera(
  bounds: Rect,
  viewport: { w: number; h: number },
  padding = 80,
  maxZoom = 1,
): Camera {
  const availW = Math.max(viewport.w - padding * 2, 1)
  const availH = Math.max(viewport.h - padding * 2, 1)
  const zoom = clampZoom(
    Math.min(maxZoom, availW / Math.max(bounds.w, 1), availH / Math.max(bounds.h, 1)),
  )
  const c = rectCenter(bounds)
  return { zoom, x: viewport.w / 2 - c.x * zoom, y: viewport.h / 2 - c.y * zoom }
}

export const fmt = (v: Vec) => `${Math.round(v.x * 100) / 100} ${Math.round(v.y * 100) / 100}`

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/**
 * New rect after dragging `handle` of `r` by (dx, dy). With `keepAspect` the opposite corner
 * (or opposite side's midpoint) stays fixed and the proportions hold.
 */
export function resizeRect(
  r: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  keepAspect: boolean,
  min: number,
): Rect {
  let x1 = r.x
  let y1 = r.y
  let x2 = r.x + r.w
  let y2 = r.y + r.h
  if (handle.includes('w')) x1 = Math.min(x1 + dx, x2 - min)
  if (handle.includes('e')) x2 = Math.max(x2 + dx, x1 + min)
  if (handle.includes('n')) y1 = Math.min(y1 + dy, y2 - min)
  if (handle.includes('s')) y2 = Math.max(y2 + dy, y1 + min)
  let w = x2 - x1
  let h = y2 - y1
  if (!keepAspect || r.w <= 0 || r.h <= 0) return { x: x1, y: y1, w, h }
  if (handle.length === 2) {
    const scale = Math.max(w / r.w, h / r.h)
    w = r.w * scale
    h = r.h * scale
  } else if (handle === 'e' || handle === 'w') {
    h = (w / r.w) * r.h
  } else {
    w = (h / r.h) * r.w
  }
  const x = handle.includes('w') ? r.x + r.w - w : handle.includes('e') ? r.x : r.x + (r.w - w) / 2
  const y = handle.includes('n') ? r.y + r.h - h : handle.includes('s') ? r.y : r.y + (r.h - h) / 2
  return { x, y, w, h }
}
