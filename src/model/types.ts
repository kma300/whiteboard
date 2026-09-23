export type Vec = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export type Side = 'top' | 'right' | 'bottom' | 'left'
export type TextAlign = 'left' | 'center' | 'right'
export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'star'
export type ConnectorStyle = 'straight' | 'elbow' | 'curved'
export type ArrowHead = 'none' | 'arrow'

interface BoxBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  z: number
  locked?: boolean
  groupId?: string
  /** Frame that contains this item. Moving the frame moves the item with it. */
  frameId?: string
}

export interface StickyItem extends BoxBase {
  type: 'sticky'
  text: string
  fill: string
  align: TextAlign
  bold?: boolean
}

export interface TextItem extends BoxBase {
  type: 'text'
  text: string
  fontSize: number
  color: string
  align: TextAlign
  bold?: boolean
}

export interface ShapeItem extends BoxBase {
  type: 'shape'
  shape: ShapeKind
  fill: string
  stroke: string
  strokeWidth: number
  text: string
  fontSize: number
  color: string
  align: TextAlign
  bold?: boolean
}

export interface FrameItem extends BoxBase {
  type: 'frame'
  title: string
  fill: string
}

export interface ImageItem extends BoxBase {
  type: 'image'
  src: string
}

/** Pen or highlighter stroke. `points` are [x, y, pressure] relative to the item's x/y. */
export interface StrokeItem extends BoxBase {
  type: 'stroke'
  points: [number, number, number][]
  color: string
  size: number
  opacity: number
  simulatePressure: boolean
}

export type ConnectorEnd =
  { kind: 'item'; itemId: string; side: Side } | { kind: 'point'; x: number; y: number }

export interface ConnectorItem {
  id: string
  type: 'connector'
  z: number
  start: ConnectorEnd
  end: ConnectorEnd
  style: ConnectorStyle
  stroke: string
  strokeWidth: number
  startArrow: ArrowHead
  endArrow: ArrowHead
  locked?: boolean
  groupId?: string
}

export type BoxItem = StickyItem | TextItem | ShapeItem | FrameItem | ImageItem | StrokeItem
export type Item = BoxItem | ConnectorItem
export type ItemType = Item['type']
export type TextualItem = StickyItem | TextItem | ShapeItem
export type Items = Record<string, Item>

/** Screen position of a world point is `world * zoom + (x, y)`. */
export interface Camera {
  x: number
  y: number
  zoom: number
}

export const BOARD_VERSION = 1

export interface BoardDoc {
  version: typeof BOARD_VERSION
  id: string
  name: string
  createdAt: number
  updatedAt: number
  items: Items
  camera: Camera
}

export interface BoardMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  itemCount: number
  /** Schematic SVG markup of the board, shown on the dashboard. */
  thumbnail: string
}

export type Tool =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'text'
  | 'shape'
  | 'connector'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'frame'

export function isBox(item: Item): item is BoxItem {
  return item.type !== 'connector'
}

export function isTextual(item: Item): item is TextualItem {
  return item.type === 'sticky' || item.type === 'text' || item.type === 'shape'
}
