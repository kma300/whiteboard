import { withoutDanglingConnectors } from '../model/connectors'
import { BOARD_VERSION } from '../model/types'
import type {
  ArrowHead,
  BoardDoc,
  Camera,
  ConnectorEnd,
  ConnectorStyle,
  Item,
  Items,
  ShapeKind,
  Side,
  TextAlign,
} from '../model/types'

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const oneOf = <T extends string>(v: unknown, options: readonly T[]): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v)

const COLOR = /^(#[0-9a-fA-F]{3,8}|transparent|rgba?\(\s*[\d.]+%?(\s*,\s*[\d.]+%?){2,3}\s*\))$/
const color = (v: unknown, fallback: string) => (isStr(v) && COLOR.test(v) ? v : fallback)

const SHAPES: readonly ShapeKind[] = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'star']
const ALIGNS: readonly TextAlign[] = ['left', 'center', 'right']
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']
const STYLES: readonly ConnectorStyle[] = ['straight', 'elbow', 'curved']
const ARROWS: readonly ArrowHead[] = ['none', 'arrow']

function base(raw: Obj) {
  if (!isStr(raw.id) || !raw.id || !isNum(raw.z)) return null
  const common = {
    id: raw.id,
    z: raw.z,
    locked: raw.locked === true ? true : undefined,
    groupId: isStr(raw.groupId) ? raw.groupId : undefined,
  }
  return common
}

function box(raw: Obj) {
  const common = base(raw)
  if (!common || !isNum(raw.x) || !isNum(raw.y) || !isNum(raw.w) || !isNum(raw.h)) return null
  if (raw.w <= 0 || raw.h <= 0) return null
  return {
    ...common,
    x: raw.x,
    y: raw.y,
    w: raw.w,
    h: raw.h,
    frameId: isStr(raw.frameId) ? raw.frameId : undefined,
  }
}

function end(raw: unknown): ConnectorEnd | null {
  if (!isObj(raw)) return null
  if (raw.kind === 'point' && isNum(raw.x) && isNum(raw.y))
    return { kind: 'point', x: raw.x, y: raw.y }
  if (raw.kind === 'item' && isStr(raw.itemId) && oneOf(raw.side, SIDES)) {
    return { kind: 'item', itemId: raw.itemId, side: raw.side }
  }
  return null
}

/** Validates one item from untrusted JSON. Returns null when it cannot be used safely. */
export function sanitizeItem(raw: unknown): Item | null {
  if (!isObj(raw)) return null
  const text = isStr(raw.text) ? raw.text : ''
  const align = oneOf(raw.align, ALIGNS) ? raw.align : 'center'
  const bold = raw.bold === true ? true : undefined
  switch (raw.type) {
    case 'sticky': {
      const b = box(raw)
      const fontSize = isNum(raw.fontSize) && raw.fontSize > 0 ? raw.fontSize : undefined
      return (
        b && { ...b, type: 'sticky', text, fill: color(raw.fill, '#FFF3A3'), fontSize, align, bold }
      )
    }
    case 'text': {
      const b = box(raw)
      if (!b) return null
      const fontSize = isNum(raw.fontSize) && raw.fontSize > 0 ? raw.fontSize : 24
      return { ...b, type: 'text', text, fontSize, color: color(raw.color, '#1F1F1F'), align, bold }
    }
    case 'shape': {
      const b = box(raw)
      if (!b) return null
      return {
        ...b,
        type: 'shape',
        shape: oneOf(raw.shape, SHAPES) ? raw.shape : 'rect',
        fill: color(raw.fill, '#FFFFFF'),
        stroke: color(raw.stroke, '#1F1F1F'),
        strokeWidth: isNum(raw.strokeWidth) && raw.strokeWidth >= 0 ? raw.strokeWidth : 2,
        text,
        fontSize: isNum(raw.fontSize) && raw.fontSize > 0 ? raw.fontSize : 20,
        color: color(raw.color, '#1F1F1F'),
        align,
        bold,
      }
    }
    case 'frame': {
      const b = box(raw)
      return (
        b && {
          ...b,
          type: 'frame',
          title: isStr(raw.title) ? raw.title : '',
          fill: color(raw.fill, '#FFFFFF'),
        }
      )
    }
    case 'image': {
      const b = box(raw)
      // Only embedded images: a remote URL would make the app fetch from the network.
      if (!b || !isStr(raw.src) || !raw.src.startsWith('data:image/')) return null
      return { ...b, type: 'image', src: raw.src }
    }
    case 'stroke': {
      const b = box(raw)
      if (!b || !Array.isArray(raw.points)) return null
      const points: [number, number, number][] = []
      for (const p of raw.points) {
        if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) return null
        points.push([p[0], p[1], isNum(p[2]) ? p[2] : 0.5])
      }
      if (!points.length) return null
      return {
        ...b,
        type: 'stroke',
        points,
        color: color(raw.color, '#1F1F1F'),
        size: isNum(raw.size) && raw.size > 0 ? raw.size : 4,
        opacity: isNum(raw.opacity) ? Math.min(1, Math.max(0.05, raw.opacity)) : 1,
        simulatePressure: raw.simulatePressure !== false,
      }
    }
    case 'connector': {
      const common = base(raw)
      const start = end(raw.start)
      const finish = end(raw.end)
      if (!common || !start || !finish) return null
      return {
        ...common,
        type: 'connector',
        start,
        end: finish,
        style: oneOf(raw.style, STYLES) ? raw.style : 'curved',
        stroke: color(raw.stroke, '#1F1F1F'),
        strokeWidth: isNum(raw.strokeWidth) && raw.strokeWidth > 0 ? raw.strokeWidth : 2,
        startArrow: oneOf(raw.startArrow, ARROWS) ? raw.startArrow : 'none',
        endArrow: oneOf(raw.endArrow, ARROWS) ? raw.endArrow : 'arrow',
      }
    }
    default:
      return null
  }
}

/** Sanitizes a list of items and drops connectors whose attached items are missing. */
export function sanitizeItems(raw: unknown[]): Items {
  const items: Items = {}
  for (const r of raw) {
    const it = sanitizeItem(r)
    if (it) items[it.id] = it
  }
  return withoutDanglingConnectors(items)
}

function camera(raw: unknown): Camera {
  if (isObj(raw) && isNum(raw.x) && isNum(raw.y) && isNum(raw.zoom) && raw.zoom > 0) {
    return { x: raw.x, y: raw.y, zoom: raw.zoom }
  }
  return { x: 0, y: 0, zoom: 1 }
}

const FILE_KIND = 'whiteboard-board'

export function exportBoardJson(doc: BoardDoc): string {
  return JSON.stringify({ kind: FILE_KIND, ...doc }, null, 2)
}

/** Parses an exported board file. Throws an Error with a readable message when the file is unusable. */
export function parseBoardJson(text: string): Omit<BoardDoc, 'id' | 'createdAt' | 'updatedAt'> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  if (!isObj(raw) || raw.kind !== FILE_KIND || !isObj(raw.items)) {
    throw new Error('This file is not a Whiteboard board export.')
  }
  if (raw.version !== BOARD_VERSION) {
    throw new Error(`Unsupported board version: ${String(raw.version)}.`)
  }
  return {
    version: BOARD_VERSION,
    name: isStr(raw.name) && raw.name.trim() ? raw.name : 'Imported board',
    items: sanitizeItems(Object.values(raw.items)),
    camera: camera(raw.camera),
  }
}

const CLIPBOARD_KIND = 'whiteboard-items'

export function serializeClipboard(items: Item[]): string {
  return JSON.stringify({ kind: CLIPBOARD_KIND, items })
}

/** Items from clipboard text written by `serializeClipboard`, or null for any other text. */
export function parseClipboard(text: string): Item[] | null {
  if (!text.startsWith('{')) return null
  try {
    const raw: unknown = JSON.parse(text)
    if (!isObj(raw) || raw.kind !== CLIPBOARD_KIND || !Array.isArray(raw.items)) return null
    return Object.values(sanitizeItems(raw.items))
  } catch {
    return null
  }
}
