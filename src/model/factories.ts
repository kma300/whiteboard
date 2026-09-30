import { rectCenter } from './geometry'
import { newId } from './ids'
import { DEFAULT_FRAME, STICKY_SIZE } from './palette'
import type {
  ConnectorEnd,
  ConnectorItem,
  ConnectorStyle,
  FrameItem,
  ImageItem,
  Rect,
  ShapeItem,
  ShapeKind,
  StickyItem,
  StrokeItem,
  TextItem,
  TextualItem,
  Vec,
} from './types'

export function createSticky(center: Vec, fill: string, z: number): StickyItem {
  return {
    id: newId(),
    type: 'sticky',
    x: center.x - STICKY_SIZE / 2,
    y: center.y - STICKY_SIZE / 2,
    w: STICKY_SIZE,
    h: STICKY_SIZE,
    z,
    text: '',
    fill,
    align: 'center',
  }
}

export function createText(topLeft: Vec, z: number): TextItem {
  return {
    id: newId(),
    type: 'text',
    x: topLeft.x,
    y: topLeft.y,
    w: 280,
    h: 40,
    z,
    text: '',
    fontSize: 24,
    color: '#1F1F1F',
    align: 'left',
  }
}

export function createShape(rect: Rect, shape: ShapeKind, z: number): ShapeItem {
  return {
    id: newId(),
    type: 'shape',
    ...rect,
    z,
    shape,
    fill: '#FFFFFF',
    stroke: '#1F1F1F',
    strokeWidth: 2,
    text: '',
    fontSize: 20,
    color: '#1F1F1F',
    align: 'center',
  }
}

export function createFrame(rect: Rect, title: string, z: number): FrameItem {
  return {
    id: newId(),
    type: 'frame',
    x: rect.x,
    y: rect.y,
    w: rect.w || DEFAULT_FRAME.w,
    h: rect.h || DEFAULT_FRAME.h,
    z,
    title,
    fill: '#FFFFFF',
  }
}

export function createImage(rect: Rect, src: string, z: number): ImageItem {
  return { id: newId(), type: 'image', ...rect, z, src }
}

export interface StrokeStyle {
  color: string
  size: number
  opacity: number
  simulatePressure: boolean
}

/** Builds a stroke from absolute world points, storing them relative to the stroke's box. */
export function createStroke(
  worldPoints: [number, number, number][],
  style: StrokeStyle,
  z: number,
): StrokeItem {
  const pad = style.size / 2
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of worldPoints) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const x = minX - pad
  const y = minY - pad
  return {
    id: newId(),
    type: 'stroke',
    x,
    y,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
    z,
    points: worldPoints.map(([px, py, p]) => [px - x, py - y, p]),
    ...style,
  }
}

/** An empty item of the same kind and look as `source`, filling `rect`. */
export function createLike(source: TextualItem, rect: Rect, z: number): TextualItem {
  const { align, bold } = source
  switch (source.type) {
    case 'sticky':
      return {
        ...createSticky(rectCenter(rect), source.fill, z),
        ...rect,
        fontSize: source.fontSize,
        align,
        bold,
      }
    case 'text': {
      const { fontSize, color } = source
      return { ...createText(rect, z), w: rect.w, h: rect.h, fontSize, color, align, bold }
    }
    case 'shape': {
      const { fill, stroke, strokeWidth, fontSize, color } = source
      const shape = createShape(rect, source.shape, z)
      return { ...shape, fill, stroke, strokeWidth, fontSize, color, align, bold }
    }
  }
}

export function createConnector(
  start: ConnectorEnd,
  end: ConnectorEnd,
  style: ConnectorStyle,
  z: number,
): ConnectorItem {
  return {
    id: newId(),
    type: 'connector',
    z,
    start,
    end,
    style,
    stroke: '#1F1F1F',
    strokeWidth: 2,
    startArrow: 'none',
    endArrow: 'arrow',
  }
}
