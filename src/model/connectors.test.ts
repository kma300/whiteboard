import { describe, expect, it } from 'vitest'
import {
  connectorGeometry,
  connectorsAttachedTo,
  droppedCopyPlacement,
  itemBounds,
  linkedCopyPlacement,
  resolveEnd,
} from './connectors'
import { createConnector, createFrame, createShape } from './factories'
import type { ConnectorStyle, Items, Rect, Side, Vec } from './types'

const a = createShape({ x: 0, y: 0, w: 100, h: 100 }, 'rect', 1)
const b = createShape({ x: 400, y: 300, w: 100, h: 100 }, 'rect', 2)
const items: Items = { [a.id]: a, [b.id]: b }

function link(style: 'straight' | 'elbow' | 'curved', endArrow: 'none' | 'arrow' = 'none') {
  return {
    ...createConnector(
      { kind: 'item', itemId: a.id, side: 'right' },
      { kind: 'item', itemId: b.id, side: 'left' },
      style,
      3,
    ),
    endArrow,
  }
}

describe('connector geometry', () => {
  it('anchors to the middle of the attached side', () => {
    expect(resolveEnd({ kind: 'item', itemId: a.id, side: 'right' }, items)).toEqual({
      point: { x: 100, y: 50 },
      normal: { x: 1, y: 0 },
    })
    expect(resolveEnd({ kind: 'item', itemId: 'missing', side: 'top' }, items)).toBeNull()
  })

  it.each(['straight', 'elbow', 'curved'] as const)('%s lines run anchor to anchor', (style) => {
    const g = connectorGeometry(link(style), items)
    expect(g).not.toBeNull()
    expect(g?.start).toEqual({ x: 100, y: 50 })
    expect(g?.end).toEqual({ x: 400, y: 350 })
    expect(g?.points[0]).toEqual({ x: 100, y: 50 })
    expect(g?.points[g.points.length - 1]).toEqual({ x: 400, y: 350 })
  })

  it('routes elbow lines with only horizontal and vertical segments', () => {
    const g = connectorGeometry(link('elbow'), items)
    const pts = g?.points ?? []
    for (let i = 1; i < pts.length; i++) {
      const horizontal = Math.abs(pts[i].y - pts[i - 1].y) < 1e-9
      const vertical = Math.abs(pts[i].x - pts[i - 1].x) < 1e-9
      expect(horizontal || vertical).toBe(true)
    }
  })

  it('shortens the line under an arrowhead but keeps the tip on the anchor', () => {
    const plain = connectorGeometry(link('straight'), items)
    const arrowed = connectorGeometry(link('straight', 'arrow'), items)
    expect(arrowed?.end).toEqual(plain?.end)
    expect(arrowed?.d).not.toEqual(plain?.d)
    expect(arrowed?.endDir.x).toBeGreaterThan(0)
  })

  it('bounds a connector by its path and finds connectors on items', () => {
    const c = link('curved')
    const all: Items = { ...items, [c.id]: c }
    const r = itemBounds(c, all)
    expect(r?.x).toBeCloseTo(100)
    expect((r?.x ?? 0) + (r?.w ?? 0)).toBeCloseTo(400)
    expect(connectorsAttachedTo(new Set([b.id]), all)).toEqual([c.id])
  })
})

/** True when the polyline dips inside `r`, sampled finely so the check is independent of routing. */
function entersBox(points: Vec[], r: Rect): boolean {
  const inside = (p: Vec) =>
    p.x > r.x + 1.5 && p.x < r.x + r.w - 1.5 && p.y > r.y + 1.5 && p.y < r.y + r.h - 1.5
  for (let i = 1; i < points.length; i++) {
    const [p, q] = [points[i - 1], points[i]]
    for (let t = 0; t <= 1; t += 1 / 64) {
      if (inside({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })) return true
    }
  }
  return false
}

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

function pair(bRect: Rect, sideA: Side, sideB: Side, style: ConnectorStyle) {
  const s = createShape({ x: 0, y: 0, w: 160, h: 160 }, 'rect', 1)
  const t = createShape(bRect, 'rect', 2)
  const c = createConnector(
    { kind: 'item', itemId: s.id, side: sideA },
    { kind: 'item', itemId: t.id, side: sideB },
    style,
    3,
  )
  const all: Items = { [s.id]: s, [t.id]: t, [c.id]: c }
  return { s, t, g: connectorGeometry(c, all) }
}

describe('connector routing around the items it connects', () => {
  it('turns an end to face an item that sits entirely behind its side', () => {
    const { g } = pair({ x: -400, y: 0, w: 160, h: 160 }, 'right', 'left', 'straight')
    expect(g?.start).toEqual({ x: 0, y: 80 })
    expect(g?.end).toEqual({ x: -240, y: 80 })
  })

  it('keeps its sides when the other item is only partly behind them', () => {
    // Same-side loops are deliberate: top to top over a neighbor, right to right beside a column.
    const over = pair({ x: 400, y: 0, w: 160, h: 160 }, 'top', 'top', 'elbow').g
    expect(over?.start).toEqual({ x: 80, y: 0 })
    expect(over?.end).toEqual({ x: 480, y: 0 })
    const beside = pair({ x: 0, y: 400, w: 160, h: 160 }, 'right', 'right', 'elbow').g
    expect(beside?.start).toEqual({ x: 160, y: 80 })
    expect(beside?.end).toEqual({ x: 160, y: 480 })
  })

  // Layouts where the old routers drew straight through one or both items.
  const layouts: [string, Rect, Side, Side][] = [
    ['target behind, facing away', { x: -400, y: 0, w: 160, h: 160 }, 'right', 'left'],
    ['target below-left, same sides', { x: -400, y: 300, w: 160, h: 160 }, 'right', 'right'],
    ['target above, facing away', { x: 0, y: -400, w: 160, h: 160 }, 'bottom', 'top'],
    ['target overlapping below', { x: 100, y: 250, w: 160, h: 160 }, 'right', 'left'],
  ]

  it.each(layouts)('%s: elbow and curved lines stay out of both items', (_, b, sa, sb) => {
    for (const style of ['elbow', 'curved'] as const) {
      const { s, t, g } = pair(b, sa, sb, style)
      expect(g).not.toBeNull()
      expect(entersBox(g?.points ?? [], s), `${style} enters the source`).toBe(false)
      expect(entersBox(g?.points ?? [], t), `${style} enters the target`).toBe(false)
    }
  })

  it('never cuts through either item for any pair of sides around a separated neighbor', () => {
    const offsets = [-360, -180, 0, 180, 360]
    const failures: string[] = []
    for (const x of offsets) {
      for (const y of offsets) {
        if (x === 0 && y === 0) continue
        for (const sa of SIDES) {
          for (const sb of SIDES) {
            for (const style of ['elbow', 'curved'] as const) {
              const { s, t, g } = pair({ x, y, w: 160, h: 160 }, sa, sb, style)
              const pts = g?.points ?? []
              if (entersBox(pts, s) || entersBox(pts, t))
                failures.push(`${style} ${sa}->${sb} @${x},${y}`)
            }
          }
        }
      }
    }
    expect(failures).toEqual([])
  })
})

describe('where a connection dot puts a linked copy', () => {
  const src = createShape({ x: 0, y: 0, w: 160, h: 100 }, 'rect', 1)

  // The gap is half the source's size along that axis, at least 60: 80 across, 60 down.
  it.each([
    ['right', { x: 240, y: 0 }, 'left'],
    ['left', { x: -240, y: 0 }, 'right'],
    ['bottom', { x: 0, y: 160 }, 'top'],
    ['top', { x: 0, y: -160 }, 'bottom'],
  ] as const)('beside the %s side, attached on the side facing back', (side, at, back) => {
    const p = linkedCopyPlacement(src, side, { [src.id]: src })
    expect(p.rect).toEqual({ ...at, w: 160, h: 100 })
    expect(p.side).toBe(back)
  })

  it('fans out below, then above, instead of stacking on an earlier copy', () => {
    const items: Items = { [src.id]: src }
    const spots: [number, number][] = []
    for (let i = 0; i < 3; i++) {
      const { rect } = linkedCopyPlacement(src, 'right', items)
      const copy = createShape(rect, 'rect', 2 + i)
      items[copy.id] = copy
      spots.push([rect.x, rect.y])
    }
    expect(spots).toEqual([
      [240, 0],
      [240, 180],
      [240, -180],
    ])
  })

  it('does not count a frame around the source as taking up the spot', () => {
    const frame = createFrame({ x: -100, y: -100, w: 1000, h: 600 }, 'F', 0)
    const p = linkedCopyPlacement(src, 'right', { [src.id]: src, [frame.id]: frame })
    expect(p.rect.x).toBe(240)
  })

  it('puts a dropped copy with its facing side on the release point', () => {
    const p = droppedCopyPlacement(src, { x: 160, y: 50 }, { x: 400, y: 80 })
    expect(p).toEqual({ rect: { x: 400, y: 30, w: 160, h: 100 }, side: 'left' })
  })

  it('refuses a dropped copy that would overlap the source', () => {
    expect(droppedCopyPlacement(src, { x: 160, y: 50 }, { x: 170, y: 60 })).toBeNull()
  })
})
