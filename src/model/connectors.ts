import {
  add,
  boundsOfPoints,
  boxRect,
  clamp,
  distance,
  expandRect,
  fmt,
  mul,
  nearestSide,
  normalize,
  oppositeSide,
  rectCenter,
  rectsIntersect,
  rectWithSideAt,
  sideAnchor,
  sideNormal,
  sub,
} from './geometry'
import type { BoxItem, ConnectorEnd, ConnectorItem, Item, Items, Rect, Side, Vec } from './types'

export interface ResolvedEnd {
  point: Vec
  /** Outward normal of the attached side, or null for a free point. */
  normal: Vec | null
}

/** Where one end sits on its stored side, without regard to the other end. */
export function resolveEnd(end: ConnectorEnd, items: Items): ResolvedEnd | null {
  if (end.kind === 'point') return { point: { x: end.x, y: end.y }, normal: null }
  const item = items[end.itemId]
  if (!item || item.type === 'connector') return null
  return { point: sideAnchor(boxRect(item), end.side), normal: sideNormal(end.side) }
}

/** A resolved end plus the box of its item, which the line should stay out of. */
interface RoutedEnd extends ResolvedEnd {
  rect: Rect | null
}

/** What an end holds on to: one side of an item's box, or a free point. */
type Hold = { rect: Rect; side: Side } | { rect: null; point: Vec }

function holdOf(end: ConnectorEnd, items: Items): Hold | null {
  if (end.kind === 'point') return { rect: null, point: { x: end.x, y: end.y } }
  const item = items[end.itemId]
  if (!item || item.type === 'connector') return null
  return { rect: boxRect(item), side: end.side }
}

const holdBox = (hold: Hold): Rect =>
  hold.rect ? hold.rect : { x: hold.point.x, y: hold.point.y, w: 0, h: 0 }

/** True when `other` lies entirely past the edge of `r` opposite `side`. */
function isBehind(r: Rect, side: Side, other: Rect): boolean {
  switch (side) {
    case 'top':
      return other.y >= r.y + r.h
    case 'right':
      return other.x + other.w <= r.x
    case 'bottom':
      return other.y + other.h <= r.y
    case 'left':
      return other.x >= r.x + r.w
  }
}

/**
 * Where an end attaches. It keeps its side unless the other end lies entirely behind that side,
 * where the line would have to wrap around its own item; then it turns to face the other end.
 */
function routeEnd(hold: Hold, other: Hold): RoutedEnd {
  if (!hold.rect) return { point: hold.point, normal: null, rect: null }
  const box = holdBox(other)
  const side = isBehind(hold.rect, hold.side, box)
    ? nearestSide(hold.rect, rectCenter(box))
    : hold.side
  return { point: sideAnchor(hold.rect, side), normal: sideNormal(side), rect: hold.rect }
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
/** Extra length a detour pays per bend, so it prefers fewer turns over a slightly shorter path. */
const BEND_COST = 30

export function arrowLength(strokeWidth: number) {
  return 10 + strokeWidth * 2.5
}

export function connectorGeometry(c: ConnectorShape, items: Items): ConnectorGeometry | null {
  const holdA = holdOf(c.start, items)
  const holdB = holdOf(c.end, items)
  if (!holdA || !holdB) return null
  const a = routeEnd(holdA, holdB)
  const b = routeEnd(holdB, holdA)
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

function curved(a: RoutedEnd, b: RoutedEnd, trimStart: number, trimEnd: number): ConnectorGeometry {
  const k = Math.max(30, distance(a.point, b.point) * 0.4)
  const dirA = a.normal ?? normalize(sub(b.point, a.point))
  const dirB = b.normal ?? normalize(sub(a.point, b.point))
  const c1 = add(a.point, mul(dirA, k))
  const c2 = add(b.point, mul(dirB, k))
  const points: Vec[] = []
  for (let i = 0; i <= 16; i++) points.push(cubicAt(a.point, c1, c2, b.point, i / 16))
  // A curve that would cut through one of its own items follows the elbow route around them
  // instead, with every corner rounded as far as it goes so the line still reads as a curve.
  const boxes = obstacles(a, b)
  if (crossesAny(points, boxes)) {
    const route = elbowRoute(a, b)
    if (!crossesAny(route, boxes)) return polylineGeometry(route, trimStart, trimEnd, Infinity)
  }
  const startDir = normalize(sub(a.point, c1))
  const endDir = normalize(sub(b.point, c2))
  const s = sub(a.point, mul(startDir, trimStart))
  const e = sub(b.point, mul(endDir, trimEnd))
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

function elbow(a: RoutedEnd, b: RoutedEnd, trimStart: number, trimEnd: number) {
  return polylineGeometry(elbowRoute(a, b), trimStart, trimEnd, ELBOW_RADIUS)
}

/** The direct elbow route, or the best detour around the connected items when it cuts one. */
function elbowRoute(a: RoutedEnd, b: RoutedEnd): Vec[] {
  const route = directElbow(a, b)
  const boxes = obstacles(a, b)
  if (!crossesAny(route, boxes)) return route
  return detour(a, b, boxes) ?? route
}

function directElbow(a: RoutedEnd, b: RoutedEnd): Vec[] {
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
  return simplify([p0, p1, ...mid, p2, p3])
}

/**
 * Cheapest orthogonal route from `a` to `b` that stays out of `boxes`. It leaves and enters
 * through the usual stubs and tries up to three turns between them, along lines beside and
 * between the boxes. Null when no such route is clear.
 */
function detour(a: RoutedEnd, b: RoutedEnd, boxes: Rect[]): Vec[] | null {
  const na = a.normal ?? axisToward(a.point, b.point)
  const nb = b.normal ?? axisToward(b.point, a.point)
  const p1 = add(a.point, mul(na, ELBOW_GAP))
  const p2 = add(b.point, mul(nb, ELBOW_GAP))
  const xs = [p1.x, p2.x, (p1.x + p2.x) / 2]
  const ys = [p1.y, p2.y, (p1.y + p2.y) / 2]
  for (const r of boxes) {
    xs.push(r.x - ELBOW_GAP, r.x + r.w + ELBOW_GAP)
    ys.push(r.y - ELBOW_GAP, r.y + r.h + ELBOW_GAP)
    for (const s of boxes) {
      // The middle of the gap between two boxes, when there is one.
      if (s.x > r.x + r.w) xs.push((r.x + r.w + s.x) / 2)
      if (s.y > r.y + r.h) ys.push((r.y + r.h + s.y) / 2)
    }
  }
  const mids: Vec[][] = []
  for (const x of xs) {
    mids.push([
      { x, y: p1.y },
      { x, y: p2.y },
    ])
  }
  for (const y of ys) {
    mids.push([
      { x: p1.x, y },
      { x: p2.x, y },
    ])
  }
  for (const x of xs) {
    for (const y of ys) {
      mids.push([
        { x: p1.x, y },
        { x, y },
        { x, y: p2.y },
      ])
      mids.push([
        { x, y: p1.y },
        { x, y },
        { x: p2.x, y },
      ])
    }
  }
  let best: Vec[] | null = null
  let bestCost = Infinity
  for (const mid of mids) {
    const route = simplify([a.point, p1, ...mid, p2, b.point])
    if (crossesAny(route, boxes)) continue
    const cost = pathLength(route) + (route.length - 2) * BEND_COST
    if (cost < bestCost) {
      best = route
      bestCost = cost
    }
  }
  return best
}

/** Geometry for a line along `points`, corners rounded up to `radius` (Infinity: fully). */
function polylineGeometry(
  points: Vec[],
  trimStart: number,
  trimEnd: number,
  radius: number,
): ConnectorGeometry {
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
    d: roundedPath(trimmed, radius),
    points,
    start: points[0],
    end: points[points.length - 1],
    startDir,
    endDir,
  }
}

const obstacles = (a: RoutedEnd, b: RoutedEnd): Rect[] =>
  [a.rect, b.rect].filter((r): r is Rect => r !== null)

function pathLength(points: Vec[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i])
  return total
}

/** True when any segment of the polyline passes through the inside of one of `boxes`. */
function crossesAny(points: Vec[], boxes: Rect[]): boolean {
  for (let i = 1; i < points.length; i++) {
    for (const r of boxes) if (segmentCrosses(points[i - 1], points[i], r)) return true
  }
  return false
}

/**
 * True when segment p-q passes through the inside of `r`. Touching or running along an edge does
 * not count, so the box shrinks by one unit before the Liang-Barsky clip.
 */
function segmentCrosses(p: Vec, q: Vec, r: Rect): boolean {
  const x1 = r.x + 1
  const y1 = r.y + 1
  const x2 = r.x + r.w - 1
  const y2 = r.y + r.h - 1
  if (x1 >= x2 || y1 >= y2) return false
  const dx = q.x - p.x
  const dy = q.y - p.y
  let t0 = 0
  let t1 = 1
  const clips: [number, number][] = [
    [-dx, p.x - x1],
    [dx, x2 - p.x],
    [-dy, p.y - y1],
    [dy, y2 - p.y],
  ]
  for (const [pk, qk] of clips) {
    if (pk === 0) {
      if (qk < 0) return false
      continue
    }
    const t = qk / pk
    if (pk < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 >= t1) return false
  }
  return true
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

/** `items` without the connectors whose attached item is missing. */
export function withoutDanglingConnectors(items: Items): Items {
  let out: Items | null = null
  for (const it of Object.values(items)) {
    if (it.type !== 'connector') continue
    const dangling =
      (it.start.kind === 'item' && !items[it.start.itemId]) ||
      (it.end.kind === 'item' && !items[it.end.itemId])
    if (!dangling) continue
    out ??= { ...items }
    delete out[it.id]
  }
  return out ?? items
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

export interface CopyPlacement {
  /** Box of the new copy. */
  rect: Rect
  /** Side of the copy the connector attaches to, facing back at the source. */
  side: Side
}

/** Items a new copy must not land on. Frames hold items and strokes are ink, so neither counts. */
const blocksCopy = (it: Item): it is BoxItem =>
  it.type === 'sticky' || it.type === 'shape' || it.type === 'text' || it.type === 'image'

/**
 * Where a click on the `side` connection dot of `source` puts a linked copy: beside that side, a
 * gap of half the source's size away (60 to 200). When something already sits there, the copy
 * fans out sideways (after, then before), then moves further out.
 */
export function linkedCopyPlacement(source: BoxItem, side: Side, items: Items): CopyPlacement {
  const n = sideNormal(side)
  const horizontal = n.x !== 0
  const along = horizontal ? source.w : source.h
  const across = horizontal ? source.h : source.w
  const gap = clamp(along / 2, 60, 200)
  const back = oppositeSide(side)
  const blockers = Object.values(items).filter(blocksCopy).map(boxRect)
  const at = (ring: number, fan: number): Rect => {
    const out = along + gap + ring * (along + gap)
    const sideways = fan * (across + gap)
    return {
      x: source.x + n.x * out + (horizontal ? 0 : sideways),
      y: source.y + n.y * out + (horizontal ? sideways : 0),
      w: source.w,
      h: source.h,
    }
  }
  for (let ring = 0; ring < 3; ring++) {
    for (const fan of [0, 1, -1, 2, -2]) {
      const rect = at(ring, fan)
      const zone = expandRect(rect, gap / 2)
      if (!blockers.some((b) => rectsIntersect(zone, b))) return { rect, side: back }
    }
  }
  return { rect: at(0, 0), side: back }
}

/**
 * Where a line pulled from `from` and released at `at` puts a copy of `source`: the copy's side
 * that faces back along the line has its midpoint on `at`. Null when the copy would overlap the
 * source.
 */
export function droppedCopyPlacement(source: BoxItem, from: Vec, at: Vec): CopyPlacement | null {
  const dx = (at.x - from.x) / Math.max(source.w, 1)
  const dy = (at.y - from.y) / Math.max(source.h, 1)
  const side: Side =
    Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'left' : 'right') : dy > 0 ? 'top' : 'bottom'
  const rect = rectWithSideAt(at, side, source.w, source.h)
  return rectsIntersect(rect, boxRect(source)) ? null : { rect, side }
}
