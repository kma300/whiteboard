import { connectorGeometry, itemBounds } from './connectors'
import { expandRect, unionRects } from './geometry'
import { shapePath } from './shapes'
import type { Item, Items, Rect } from './types'

/** One simplified mark for the minimap and board thumbnails. Text is left out on purpose. */
export interface SchematicMark {
  d: string
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

const r = (v: number) => Math.round(v * 10) / 10

function rectPath(x: number, y: number, w: number, h: number): string {
  return `M ${r(x)} ${r(y)} h ${r(w)} v ${r(h)} h ${r(-w)} Z`
}

function markFor(item: Item, items: Items): SchematicMark | null {
  switch (item.type) {
    case 'frame':
      return {
        d: rectPath(item.x, item.y, item.w, item.h),
        fill: item.fill === 'transparent' ? 'none' : item.fill,
        stroke: '#DADAD5',
        strokeWidth: 2,
        opacity: 1,
      }
    case 'sticky':
      return {
        d: rectPath(item.x, item.y, item.w, item.h),
        fill: item.fill,
        stroke: 'none',
        strokeWidth: 0,
        opacity: 1,
      }
    case 'shape':
      return {
        d: shapePath(item.shape, item.x, item.y, item.w, item.h),
        fill: item.fill === 'transparent' ? 'none' : item.fill,
        stroke: item.strokeWidth > 0 ? item.stroke : 'none',
        strokeWidth: Math.max(item.strokeWidth, 2),
        opacity: 1,
      }
    case 'text': {
      const lineH = Math.min(item.h, item.fontSize * 0.6)
      return {
        d: rectPath(item.x, item.y + (item.h - lineH) / 2, item.w * 0.8, lineH),
        fill: '#BDBDB8',
        stroke: 'none',
        strokeWidth: 0,
        opacity: 1,
      }
    }
    case 'image':
      return {
        d: rectPath(item.x, item.y, item.w, item.h),
        fill: '#C9D3E6',
        stroke: 'none',
        strokeWidth: 0,
        opacity: 1,
      }
    case 'stroke': {
      const step = Math.max(1, Math.ceil(item.points.length / 40))
      const pts = item.points.filter((_, i) => i % step === 0 || i === item.points.length - 1)
      const d = pts
        .map(([px, py], i) => `${i ? 'L' : 'M'} ${r(item.x + px)} ${r(item.y + py)}`)
        .join(' ')
      return {
        d,
        fill: 'none',
        stroke: item.color,
        strokeWidth: Math.max(item.size, 2),
        opacity: item.opacity,
      }
    }
    case 'connector': {
      const g = connectorGeometry(item, items)
      return g
        ? {
            d: g.d,
            fill: 'none',
            stroke: item.stroke,
            strokeWidth: Math.max(item.strokeWidth, 2),
            opacity: 1,
          }
        : null
    }
  }
}

/** Marks in paint order: frames first, then everything else by z. */
export function schematicMarks(items: Items): SchematicMark[] {
  const sorted = Object.values(items).sort((a, b) => {
    const fa = a.type === 'frame' ? 0 : 1
    const fb = b.type === 'frame' ? 0 : 1
    return fa - fb || a.z - b.z
  })
  const marks: SchematicMark[] = []
  for (const it of sorted) {
    const m = markFor(it, items)
    if (m) marks.push(m)
  }
  return marks
}

export function contentBoundsOf(items: Items): Rect | null {
  const rects: Rect[] = []
  for (const it of Object.values(items)) {
    const b = itemBounds(it, items)
    if (b) rects.push(b)
  }
  return unionRects(rects)
}

const escapeAttr = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Standalone SVG markup of the board, fitted to its content. Empty string for an empty board. */
export function schematicSvg(items: Items): string {
  const bounds = contentBoundsOf(items)
  if (!bounds) return ''
  const pad = Math.max(bounds.w, bounds.h) * 0.06 + 20
  const v = expandRect(bounds, pad)
  const paths = schematicMarks(items)
    .map(
      (m) =>
        `<path d="${escapeAttr(m.d)}" fill="${escapeAttr(m.fill)}" stroke="${escapeAttr(m.stroke)}" ` +
        `stroke-width="${m.strokeWidth}" opacity="${m.opacity}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(v.x)} ${r(v.y)} ${r(v.w)} ${r(v.h)}" ` +
    `preserveAspectRatio="xMidYMid meet">${paths}</svg>`
  )
}
