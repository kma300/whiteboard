import { describe, expect, it } from 'vitest'
import {
  distToSegment,
  fitCamera,
  nearestSide,
  rectFromPoints,
  rectsIntersect,
  screenToWorld,
  unionRects,
  worldToScreen,
  zoomAt,
} from './geometry'

describe('camera math', () => {
  const cam = { x: 120, y: -40, zoom: 1.5 }

  it('round-trips screen and world coordinates', () => {
    const p = { x: 333, y: 77 }
    const back = worldToScreen(screenToWorld(p, cam), cam)
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  it('keeps the world point under the cursor fixed while zooming', () => {
    const cursor = { x: 500, y: 300 }
    const before = screenToWorld(cursor, cam)
    const next = zoomAt(cam, cursor, 2.75)
    const after = screenToWorld(cursor, next)
    expect(next.zoom).toBe(2.75)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps zoom to the supported range', () => {
    expect(zoomAt(cam, { x: 0, y: 0 }, 100).zoom).toBe(4)
    expect(zoomAt(cam, { x: 0, y: 0 }, 0.001).zoom).toBe(0.1)
  })

  it('fits bounds inside the viewport without zooming past the cap', () => {
    const fit = fitCamera({ x: 0, y: 0, w: 100, h: 100 }, { w: 1000, h: 800 }, 80, 1)
    expect(fit.zoom).toBe(1)
    const center = screenToWorld({ x: 500, y: 400 }, fit)
    expect(center.x).toBeCloseTo(50)
    expect(center.y).toBeCloseTo(50)
  })
})

describe('rects', () => {
  it('normalizes rects drawn in any direction', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 10, h: 15 })
  })

  it('detects intersection and union', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    expect(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(rectsIntersect(a, { x: 11, y: 0, w: 5, h: 5 })).toBe(false)
    expect(unionRects([a, { x: 20, y: -5, w: 5, h: 5 }])).toEqual({ x: 0, y: -5, w: 25, h: 15 })
    expect(unionRects([])).toBeNull()
  })

  it('picks the side facing a point', () => {
    const r = { x: 0, y: 0, w: 200, h: 100 }
    expect(nearestSide(r, { x: 250, y: 50 })).toBe('right')
    expect(nearestSide(r, { x: 100, y: -30 })).toBe('top')
    expect(nearestSide(r, { x: -10, y: 60 })).toBe('left')
    expect(nearestSide(r, { x: 90, y: 140 })).toBe('bottom')
  })

  it('measures distance to a segment', () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
    expect(distToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
  })
})
