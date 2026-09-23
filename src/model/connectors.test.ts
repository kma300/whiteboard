import { describe, expect, it } from 'vitest'
import { connectorGeometry, connectorsAttachedTo, itemBounds, resolveEnd } from './connectors'
import { createConnector, createShape } from './factories'
import type { Items } from './types'

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
