import getStroke from 'perfect-freehand'
import type { ShapeKind } from './types'

const n = (v: number) => Math.round(v * 100) / 100

function starPoints(): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  // Normalize so the star fills its box exactly.
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(...xs) - minX
  const h = Math.max(...ys) - minY
  return pts.map(([x, y]) => [(x - minX) / w, (y - minY) / h])
}

const STAR = starPoints()

/** SVG path outline for a shape kind filling the box (x, y, w, h), inset by `inset` on every side. */
export function shapePath(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  inset = 0,
): string {
  const x1 = x + inset
  const y1 = y + inset
  const iw = Math.max(w - inset * 2, 0)
  const ih = Math.max(h - inset * 2, 0)
  const x2 = x1 + iw
  const y2 = y1 + ih
  const cx = x1 + iw / 2
  const cy = y1 + ih / 2
  switch (kind) {
    case 'rect':
      return `M ${n(x1)} ${n(y1)} H ${n(x2)} V ${n(y2)} H ${n(x1)} Z`
    case 'roundRect': {
      const r = n(Math.min(24, Math.min(iw, ih) * 0.2))
      return (
        `M ${n(x1 + r)} ${n(y1)} H ${n(x2 - r)} A ${r} ${r} 0 0 1 ${n(x2)} ${n(y1 + r)} ` +
        `V ${n(y2 - r)} A ${r} ${r} 0 0 1 ${n(x2 - r)} ${n(y2)} H ${n(x1 + r)} ` +
        `A ${r} ${r} 0 0 1 ${n(x1)} ${n(y2 - r)} V ${n(y1 + r)} A ${r} ${r} 0 0 1 ${n(x1 + r)} ${n(y1)} Z`
      )
    }
    case 'ellipse': {
      const rx = n(iw / 2)
      const ry = n(ih / 2)
      return `M ${n(x1)} ${n(cy)} A ${rx} ${ry} 0 1 0 ${n(x2)} ${n(cy)} A ${rx} ${ry} 0 1 0 ${n(x1)} ${n(cy)} Z`
    }
    case 'triangle':
      return `M ${n(cx)} ${n(y1)} L ${n(x2)} ${n(y2)} L ${n(x1)} ${n(y2)} Z`
    case 'diamond':
      return `M ${n(cx)} ${n(y1)} L ${n(x2)} ${n(cy)} L ${n(cx)} ${n(y2)} L ${n(x1)} ${n(cy)} Z`
    case 'star':
      return (
        STAR.map(([px, py], i) => `${i ? 'L' : 'M'} ${n(x1 + px * iw)} ${n(y1 + py * ih)}`).join(
          ' ',
        ) + ' Z'
      )
  }
}

const average = (a: number, b: number) => (a + b) / 2

/** Filled outline path for a freehand stroke (the helper from the perfect-freehand README). */
export function strokePath(
  points: [number, number, number][],
  size: number,
  simulatePressure: boolean,
  highlighter: boolean,
): string {
  const outline = getStroke(points, {
    size,
    thinning: highlighter ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure,
    last: true,
  })
  const len = outline.length
  if (len < 4) return ''
  let a = outline[0]
  let b = outline[1]
  const c = outline[2]
  let d = `M${n(a[0])},${n(a[1])} Q${n(b[0])},${n(b[1])} ${n(average(b[0], c[0]))},${n(average(b[1], c[1]))} T`
  for (let i = 2; i < len - 1; i++) {
    a = outline[i]
    b = outline[i + 1]
    d += `${n(average(a[0], b[0]))},${n(average(a[1], b[1]))} `
  }
  return `${d}Z`
}
