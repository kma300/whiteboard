import {
  add,
  boundsOfPoints,
  boxRect,
  distance,
  fmt,
  mul,
  normalize,
  sideAnchor,
  sideNormal,
  sub,
} from './geometry'
import type { ConnectorEnd, ConnectorItem, Item, Items, Rect, Vec } from './types'

export interface ResolvedEnd {
  point: Vec
  /** Outward normal of the attached side, or null for a free point. */
  normal: Vec | null
}

export function resolveEnd(end: ConnectorEnd, items: Items): ResolvedEnd | null {
  if (end.kind === 'point') return { point: { x: end.x, y: end.y }, normal: null }
  const item = items[end.itemId]
  if (!item || item.type === 'connector') return null
  return { point: sideAnchor(boxRect(item), end.side), normal: sideNormal(end.side) }
}

export interface ConnectorGeometry {
  /** SVG path of the line, trimmed where arrowheads sit. */
  d: string
  /** Polyline approximation used for bounds and hit tests. */
  points: Vec[]
  start: Vec
  end: Vec
  /** Unit vectors pointing out of the line at each end, used to orient arrowheads. */
  startDir: Vec
  endDir: Vec
}

type ConnectorShape = Pick<ConnectorItem, 'start' | 'end' | 'style'> &
  Partial<Pick<ConnectorItem, 'startArrow' | 'endArrow' | 'strokeWidth'>>

const ELBOW_GAP = 24
const ELBOW_RADIUS = 10

export function arrowLength(strokeWidth: number) {
  return 10 + strokeWidth * 2.5
}

export function connectorGeometry(c: ConnectorShape, items: Items): ConnectorGeometry | null {
  const a = resolveEnd(c.start, items)
  const b = resolveEnd(c.end, items)
  if (!a || !b) return null
  const arrow = arrowLength(c.strokeWidth ?? 2) * 0.7
  const trimStart = c.startArrow === 'arrow' ? arrow : 0
  const trimEnd = c.endArrow === 'arrow' ? arrow : 0
  switch (c.style) {
    case 'straight':
      return straight(a, b, trimStart, trimEnd)
    case 'curved':
      return curved(a, b, trimStart, trimEnd)
    case 'elbow':
      return elbow(a, b, trimStart, trimEnd)
  }
}

function straight(a: ResolvedEnd, b: ResolvedEnd, trimStart: number, trimEnd: number) {
  const dir = normalize(sub(b.point, a.point))
  const len = distance(a.point, b.point)
  const s = add(a.point, mul(dir, Math.min(trimStart, len / 2)))
  const e = sub(b.point, mul(dir, Math.min(trimEnd, len / 2)))
  return {
    d: `M ${fmt(s)} L ${fmt(e)}`,
    points: [a.point, b.point],
    start: a.point,
    end: b.point,
    startDir: mul(dir, -1),
    endDir: dir,
  }
}

function cubicAt(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

function curved(a: ResolvedEnd, b: ResolvedEnd, trimStart: number, trimEnd: number) {
  const k = Math.max(30, distance(a.point, b.point) * 0.4)
  const dirA = a.normal ?? normalize(sub(b.point, a.point))
  const dirB = b.normal ?? normalize(sub(a.point, b.point))
  const c1 = add(a.point, mul(dirA, k))
  const c2 = add(b.point, mul(dirB, k))
  const startDir = normalize(sub(a.point, c1))
  const endDir = normalize(sub(b.point, c2))
  const s = sub(a.point, mul(startDir, trimStart))
  const e = sub(b.point, mul(endDir, trimEnd))
  const points: Vec[] = []
  for (let i = 0; i <= 16; i++) points.push(cubicAt(a.point, c1, c2, b.point, i / 16))
  return {
    d: `M ${fmt(s)} C ${fmt(c1)} ${fmt(c2)} ${fmt(e)}`,
    points,
    start: a.point,
    end: b.point,
    startDir,
    endDir,
  }
}

function axisToward(from: Vec, to: Vec): Vec {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 }
  return { x: 0, y: dy >= 0 ? 1 : -1 }
}

/** Drops repeated points and middle points that sit on a straight run. */
function simplify(points: Vec[]): Vec[] {
  const out: Vec[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && distance(last, p) < 0.01) continue
    if (out.length >= 2) {
      const prev = out[out.length - 2]
      const collinear =
        (Math.abs(prev.x - last.x) < 0.01 && Math.abs(last.x - p.x) < 0.01) ||
        (Math.abs(prev.y - last.y) < 0.01 && Math.abs(last.y - p.y) < 0.01)
      if (collinear) out.pop()
    }
    out.push(p)
  }
  return out
}

function roundedPath(points: Vec[], radius: number): string {
  let d = `M ${fmt(points[0])}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const next = points[i + 1]
    const r = Math.min(radius, distance(prev, cur) / 2, distance(cur, next) / 2)
    const p1 = sub(cur, mul(normalize(sub(cur, prev)), r))
    const p2 = add(cur, mul(normalize(sub(next, cur)), r))
    d += ` L ${fmt(p1)} Q ${fmt(cur)} ${fmt(p2)}`
  }
  return `${d} L ${fmt(points[points.length - 1])}`
}

function elbow(a: ResolvedEnd, b: ResolvedEnd, trimStart: number, trimEnd: number) {
  const p0 = a.point
  const p3 = b.point
  const na = a.normal ?? axisToward(p0, p3)
  const nb = b.normal ?? axisToward(p3, p0)
  const p1 = add(p0, mul(na, ELBOW_GAP))
  const p2 = add(p3, mul(nb, ELBOW_GAP))
  const horizA = na.x !== 0
  const horizB = nb.x !== 0
  let mid: Vec[]
  if (horizA && horizB) {
    const mx = (p1.x + p2.x) / 2
    mid = [
      { x: mx, y: p1.y },
      { x: mx, y: p2.y },
    ]
  } else if (!horizA && !horizB) {
    const my = (p1.y + p2.y) / 2
    mid = [
      { x: p1.x, y: my },
      { x: p2.x, y: my },
    ]
  } else if (horizA) {
    mid = [{ x: p2.x, y: p1.y }]
  } else {
    mid = [{ x: p1.x, y: p2.y }]
  }
  const points = simplify([p0, p1, ...mid, p2, p3])
  const startDir = normalize(sub(points[0], points[1]))
  const endDir = normalize(sub(points[points.length - 1], points[points.length - 2]))
  const trimmed = points.map((p) => ({ ...p }))
  const firstLen = distance(points[0], points[1])
  const lastLen = distance(points[points.length - 1], points[points.length - 2])
  trimmed[0] = sub(points[0], mul(startDir, Math.min(trimStart, firstLen / 2)))
  trimmed[trimmed.length - 1] = sub(
    points[points.length - 1],
    mul(endDir, Math.min(trimEnd, lastLen / 2)),
  )
  return {
    d: roundedPath(trimmed, ELBOW_RADIUS),
    points,
    start: p0,
    end: p3,
    startDir,
    endDir,
  }
}

/** Filled triangle whose tip sits at `tip`, pointing along `dir`. */
export function arrowHeadPath(tip: Vec, dir: Vec, strokeWidth: number): string {
  const len = arrowLength(strokeWidth)
  const half = len * 0.45
  const base = sub(tip, mul(dir, len))
  const perp = { x: -dir.y, y: dir.x }
  return `M ${fmt(tip)} L ${fmt(add(base, mul(perp, half)))} L ${fmt(sub(base, mul(perp, half)))} Z`
}

export function itemBounds(item: Item, items: Items): Rect | null {
  if (item.type !== 'connector') return boxRect(item)
  const g = connectorGeometry(item, items)
  return g ? boundsOfPoints(g.points) : null
}

/** Connectors that have an end attached to any of `ids`. */
export function connectorsAttachedTo(ids: Set<string>, items: Items): string[] {
  const out: string[] = []
  for (const item of Object.values(items)) {
    if (item.type !== 'connector') continue
    const s = item.start.kind === 'item' && ids.has(item.start.itemId)
    const e = item.end.kind === 'item' && ids.has(item.end.itemId)
    if (s || e) out.push(item.id)
  }
  return out
}
