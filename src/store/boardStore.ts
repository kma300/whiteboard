import { create } from 'zustand'
import { cloneItems, collectForCopy } from '../model/clone'
import { connectorsAttachedTo, itemBounds, withoutDanglingConnectors } from '../model/connectors'
import {
  boxRect,
  fitCamera,
  rectCenter,
  rectContains,
  screenToWorld,
  unionRects,
  zoomAt,
} from '../model/geometry'
import { newId } from '../model/ids'
import { HIGHLIGHTER_COLORS, PEN_COLORS, PEN_SIZES, STICKY_COLORS } from '../model/palette'
import { BOARD_VERSION, isBox, isTextual } from '../model/types'
import type {
  BoardDoc,
  Camera,
  ConnectorEnd,
  ConnectorStyle,
  FrameItem,
  Item,
  Items,
  Rect,
  ShapeKind,
  Tool,
  Vec,
} from '../model/types'
import { buildEntry, HISTORY_LIMIT } from './history'
import type { HistoryEntry, Patch } from './history'

export interface ToolOptions {
  stickyFill: string
  shape: ShapeKind
  penColor: string
  penSize: number
  highlighterColor: string
  connectorStyle: ConnectorStyle
}

export interface DraftStroke {
  points: [number, number, number][]
  color: string
  size: number
  opacity: number
  simulatePressure: boolean
}

export interface DraftConnector {
  start: ConnectorEnd
  end: ConnectorEnd
  style: ConnectorStyle
  targetId: string | null
}

export interface BoardState {
  boardId: string | null
  name: string
  createdAt: number
  updatedAt: number
  items: Items
  /** Ids in paint order: frames first, then everything else by z. */
  order: string[]
  camera: Camera
  /** Increments on every document change; autosave watches it. */
  revision: number
  viewport: { w: number; h: number }
  tool: Tool
  toolOptions: ToolOptions
  selection: string[]
  editingId: string | null
  hoverId: string | null
  /** True while a pointer gesture is in progress; overlays hide themselves. */
  interacting: boolean
  marquee: Rect | null
  draftStroke: DraftStroke | null
  draftConnector: DraftConnector | null
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
}

const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 }

const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  stickyFill: STICKY_COLORS[0].value,
  shape: 'rect',
  penColor: PEN_COLORS[0],
  penSize: PEN_SIZES[1],
  highlighterColor: HIGHLIGHTER_COLORS[0],
  connectorStyle: 'curved',
}

function boardDefaults(): Omit<BoardState, 'viewport' | 'toolOptions'> {
  return {
    boardId: null,
    name: '',
    createdAt: 0,
    updatedAt: 0,
    items: {},
    order: [],
    camera: DEFAULT_CAMERA,
    revision: 0,
    tool: 'select',
    selection: [],
    editingId: null,
    hoverId: null,
    interacting: false,
    marquee: null,
    draftStroke: null,
    draftConnector: null,
    undoStack: [],
    redoStack: [],
  }
}

export const useBoard = create<BoardState>()(() => ({
  ...boardDefaults(),
  viewport: { w: 1280, h: 800 },
  toolOptions: DEFAULT_TOOL_OPTIONS,
}))

const get = () => useBoard.getState()
const set = (partial: Partial<BoardState>) => useBoard.setState(partial)

export function computeOrder(items: Items): string[] {
  return Object.values(items)
    .sort((a, b) => {
      const fa = a.type === 'frame' ? 0 : 1
      const fb = b.type === 'frame' ? 0 : 1
      return fa - fb || a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    })
    .map((it) => it.id)
}

export function nextZ(items: Items = get().items): number {
  let max = 0
  for (const it of Object.values(items)) max = Math.max(max, it.z)
  return max + 1
}

// ---------------------------------------------------------------------------------------------
// Transactions and history
// ---------------------------------------------------------------------------------------------

interface Tx {
  before: Patch
  selectionBefore: string[]
}

let tx: Tx | null = null

export function beginTx(): void {
  if (!tx) tx = { before: {}, selectionBefore: get().selection }
}

export function isInTx(): boolean {
  return tx !== null
}

export function commitTx(): void {
  if (!tx) return
  const t = tx
  tx = null
  const s = get()
  const entry = buildEntry(t.before, s.items, t.selectionBefore, s.selection)
  if (!entry) return
  set({ undoStack: [...s.undoStack, entry].slice(-HISTORY_LIMIT), redoStack: [] })
}

export function cancelTx(): void {
  if (!tx) return
  const t = tx
  tx = null
  applyRaw(t.before)
  set({ selection: existing(t.selectionBefore) })
}

function applyRaw(patch: Patch): void {
  const s = get()
  const items: Items = { ...s.items }
  let orderDirty = false
  for (const id of Object.keys(patch)) {
    const next = patch[id]
    const prev = items[id]
    if (next === null) {
      if (prev) {
        delete items[id]
        orderDirty = true
      }
    } else {
      if (!prev || prev.z !== next.z || prev.type !== next.type) orderDirty = true
      items[id] = next
    }
  }
  set({ items, order: orderDirty ? computeOrder(items) : s.order, revision: s.revision + 1 })
}

/** Applies a document change. Outside a transaction it becomes its own undo step. */
export function change(patch: Patch): void {
  const auto = !tx
  const t = tx ?? (tx = { before: {}, selectionBefore: get().selection })
  const items = get().items
  for (const id of Object.keys(patch)) {
    if (!(id in t.before)) t.before[id] = items[id] ?? null
  }
  applyRaw(patch)
  if (auto) commitTx()
}

/** Updates derived fields, such as measured text height, without creating an undo step. */
export function changeSilently(patch: Patch): void {
  applyRaw(patch)
}

function existing(ids: string[]): string[] {
  const items = get().items
  return ids.filter((id) => items[id])
}

export function undo(): void {
  commitTx()
  const s = get()
  const entry = s.undoStack[s.undoStack.length - 1]
  if (!entry) return
  applyRaw(entry.before)
  set({
    undoStack: s.undoStack.slice(0, -1),
    redoStack: [...s.redoStack, entry],
    selection: existing(entry.selectionBefore),
    editingId: null,
  })
}

export function redo(): void {
  commitTx()
  const s = get()
  const entry = s.redoStack[s.redoStack.length - 1]
  if (!entry) return
  applyRaw(entry.after)
  set({
    redoStack: s.redoStack.slice(0, -1),
    undoStack: [...s.undoStack, entry],
    selection: existing(entry.selectionAfter),
    editingId: null,
  })
}

// ---------------------------------------------------------------------------------------------
// Board lifecycle
// ---------------------------------------------------------------------------------------------

export function loadBoard(doc: BoardDoc): void {
  tx = null
  // Boards saved before emptied text boxes took their connectors along can hold orphans.
  const items = withoutDanglingConnectors(doc.items)
  set({
    ...boardDefaults(),
    boardId: doc.id,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    items,
    order: computeOrder(items),
    camera: doc.camera,
  })
}

export function unloadBoard(): void {
  tx = null
  set(boardDefaults())
}

export function toDoc(): BoardDoc | null {
  const s = get()
  if (!s.boardId) return null
  return {
    version: BOARD_VERSION,
    id: s.boardId,
    name: s.name,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    items: s.items,
    camera: s.camera,
  }
}

export function renameBoard(name: string): void {
  const s = get()
  set({ name, revision: s.revision + 1 })
}

// ---------------------------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------------------------

export function setCamera(camera: Camera): void {
  set({ camera })
}

export function setViewport(w: number, h: number): void {
  set({ viewport: { w, h } })
}

export function viewportCenterWorld(): Vec {
  const s = get()
  return screenToWorld({ x: s.viewport.w / 2, y: s.viewport.h / 2 }, s.camera)
}

export function zoomBy(factor: number, screen?: Vec): void {
  const s = get()
  const p = screen ?? { x: s.viewport.w / 2, y: s.viewport.h / 2 }
  setCamera(zoomAt(s.camera, p, s.camera.zoom * factor))
}

export function zoomTo(zoom: number): void {
  const s = get()
  setCamera(zoomAt(s.camera, { x: s.viewport.w / 2, y: s.viewport.h / 2 }, zoom))
}

export function contentBounds(ids?: string[]): Rect | null {
  const items = get().items
  const list = ids ? ids.map((id) => items[id]).filter(Boolean) : Object.values(items)
  const rects: Rect[] = []
  for (const it of list) {
    const r = itemBounds(it, items)
    if (r) rects.push(r)
  }
  return unionRects(rects)
}

export function zoomToFit(): void {
  const s = get()
  const b = contentBounds()
  if (!b) {
    setCamera({ zoom: 1, x: s.viewport.w / 2, y: s.viewport.h / 2 })
    return
  }
  setCamera(fitCamera(b, s.viewport, 80, 1))
}

export function zoomToSelection(): void {
  const s = get()
  const b = contentBounds(s.selection)
  if (b) setCamera(fitCamera(b, s.viewport, 120, 2))
}

// ---------------------------------------------------------------------------------------------
// Tools and transient UI state
// ---------------------------------------------------------------------------------------------

export function setTool(tool: Tool): void {
  stopEditing()
  set({ tool, hoverId: null, ...(tool === 'select' ? {} : { selection: [] }) })
}

export function setToolOptions(partial: Partial<ToolOptions>): void {
  set({ toolOptions: { ...get().toolOptions, ...partial } })
}

export function setHover(hoverId: string | null): void {
  if (get().hoverId !== hoverId) set({ hoverId })
}

export function setInteracting(interacting: boolean): void {
  if (get().interacting !== interacting) set({ interacting })
}

export function setMarquee(marquee: Rect | null): void {
  set({ marquee })
}

export function setDraftStroke(draftStroke: DraftStroke | null): void {
  set({ draftStroke })
}

export function setDraftConnector(draftConnector: DraftConnector | null): void {
  set({ draftConnector })
}

// ---------------------------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------------------------

/** Adds every member of any group touched by `ids`. */
export function expandGroups(ids: string[], items: Items): string[] {
  const out = new Set(ids.filter((id) => items[id]))
  const groups = new Set<string>()
  for (const id of out) {
    const g = items[id]?.groupId
    if (g) groups.add(g)
  }
  if (groups.size) {
    for (const it of Object.values(items)) {
      if (it.groupId && groups.has(it.groupId)) out.add(it.id)
    }
  }
  return [...out]
}

export function select(ids: string[]): void {
  set({ selection: expandGroups(ids, get().items) })
}

export function toggleSelection(ids: string[]): void {
  const s = get()
  const group = expandGroups(ids, s.items)
  const current = new Set(s.selection)
  const allSelected = group.every((id) => current.has(id))
  for (const id of group) {
    if (allSelected) current.delete(id)
    else current.add(id)
  }
  set({ selection: [...current] })
}

export function clearSelection(): void {
  if (get().selection.length) set({ selection: [] })
}

export function selectAll(): void {
  stopEditing()
  set({ selection: Object.keys(get().items), tool: 'select' })
}

// ---------------------------------------------------------------------------------------------
// Text editing
// ---------------------------------------------------------------------------------------------

/** Starts editing. Shares any open transaction so "create and type" is one undo step. */
export function startEditing(id: string): void {
  const item = get().items[id]
  if (!item || item.locked || !(isTextual(item) || item.type === 'frame')) return
  beginTx()
  set({ editingId: id, selection: [id], tool: 'select' })
}

export function stopEditing(): void {
  const s = get()
  const id = s.editingId
  if (!id) return
  const item = s.items[id]
  if (item?.type === 'text' && item.text.trim() === '') deleteItems([id])
  set({ editingId: null, selection: existing(get().selection) })
  commitTx()
}

export function setItemText(id: string, text: string): void {
  const item = get().items[id]
  if (!item) return
  if (isTextual(item)) change({ [id]: { ...item, text } })
  else if (item.type === 'frame') change({ [id]: { ...item, title: text } })
}

// ---------------------------------------------------------------------------------------------
// Item operations
// ---------------------------------------------------------------------------------------------

export function addItems(newItems: Item[], selectThem = true): void {
  const patch: Patch = {}
  for (const it of newItems) patch[it.id] = it
  change(patch)
  if (selectThem) set({ selection: newItems.map((it) => it.id) })
}

export function updateItems(ids: string[], fn: (item: Item) => Item | null): void {
  const items = get().items
  const patch: Patch = {}
  for (const id of ids) {
    const it = items[id]
    if (!it) continue
    const next = fn(it)
    if (next !== it) patch[id] = next
  }
  if (Object.keys(patch).length) change(patch)
}

export function updateSelection(fn: (item: Item) => Item | null): void {
  updateItems(get().selection, fn)
}

export function deleteItems(ids: string[]): void {
  const s = get()
  const doomed = new Set(ids.filter((id) => s.items[id] && !s.items[id].locked))
  if (!doomed.size) return
  for (const id of connectorsAttachedTo(doomed, s.items)) doomed.add(id)
  const patch: Patch = {}
  for (const id of doomed) patch[id] = null
  for (const it of Object.values(s.items)) {
    if (isBox(it) && it.frameId && doomed.has(it.frameId) && !doomed.has(it.id)) {
      patch[it.id] = { ...it, frameId: undefined }
    }
  }
  change(patch)
  set({ selection: s.selection.filter((id) => !doomed.has(id)), editingId: null })
}

export function deleteSelection(): void {
  deleteItems(get().selection)
}

/** Ids that move together with `ids`: the unlocked items plus children of moved frames. */
export function movingSet(ids: string[], items: Items): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    const it = items[id]
    if (it && !it.locked) out.add(id)
  }
  const frames = new Set([...out].filter((id) => items[id]?.type === 'frame'))
  if (frames.size) {
    for (const it of Object.values(items)) {
      if (isBox(it) && it.frameId && frames.has(it.frameId) && !it.locked) out.add(it.id)
    }
  }
  return [...out]
}

export function translateItem(item: Item, dx: number, dy: number): Item {
  if (item.type === 'connector') {
    const move = (end: ConnectorEnd): ConnectorEnd =>
      end.kind === 'point' ? { kind: 'point', x: end.x + dx, y: end.y + dy } : end
    return { ...item, start: move(item.start), end: move(item.end) }
  }
  return { ...item, x: item.x + dx, y: item.y + dy }
}

export function nudgeSelection(dx: number, dy: number): void {
  const s = get()
  const patch: Patch = {}
  for (const id of movingSet(s.selection, s.items)) patch[id] = translateItem(s.items[id], dx, dy)
  if (Object.keys(patch).length) change(patch)
}

/** Places copies of `source` so their bounds are centered on `center`, or offset from the originals. */
export function pasteItems(source: Item[], center: Vec | null): string[] {
  if (!source.length) return []
  const temp: Items = {}
  for (const it of source) temp[it.id] = it
  const rects: Rect[] = []
  for (const it of source) {
    const r = itemBounds(it, temp)
    if (r) rects.push(r)
  }
  const b = unionRects(rects)
  const offset =
    center && b
      ? { x: center.x - (b.x + b.w / 2), y: center.y - (b.y + b.h / 2) }
      : { x: 24, y: 24 }
  return placeClones(source, offset)
}

/**
 * Copies of the selection shifted by `offset`, selected afterwards. Joins an open transaction,
 * so Alt-drag (duplicate, then move) stays a single undo step.
 */
export function duplicateSelection(offset: Vec = { x: 24, y: 24 }): string[] {
  const s = get()
  return placeClones(collectForCopy(s.selection, s.items), offset)
}

function placeClones(source: Item[], offset: Vec): string[] {
  if (!source.length) return []
  const clones = cloneItems(source, offset, nextZ())
  const own = !tx
  beginTx()
  addItems(clones)
  refreshFrames(clones.map((c) => c.id))
  if (own) commitTx()
  return clones.map((c) => c.id)
}

export function bringToFront(): void {
  const s = get()
  let z = nextZ(s.items)
  const ids = s.selection
    .map((id) => s.items[id])
    .filter((it) => it && !it.locked)
    .sort((a, b) => a.z - b.z)
    .map((it) => it.id)
  updateItems(ids, (it) => ({ ...it, z: z++ }))
}

export function sendToBack(): void {
  const s = get()
  let z = Math.min(0, ...Object.values(s.items).map((it) => it.z)) - 1
  const ids = s.selection
    .map((id) => s.items[id])
    .filter((it) => it && !it.locked)
    .sort((a, b) => b.z - a.z)
    .map((it) => it.id)
  updateItems(ids, (it) => ({ ...it, z: z-- }))
}

export function toggleLock(): void {
  const s = get()
  const selected = s.selection.map((id) => s.items[id]).filter(Boolean)
  const lock = selected.some((it) => !it.locked)
  updateItems(s.selection, (it) => ({ ...it, locked: lock ? true : undefined }))
}

export function groupSelection(): void {
  const s = get()
  if (s.selection.length < 2) return
  const groupId = newId()
  updateItems(s.selection, (it) => ({ ...it, groupId }))
}

export function ungroupSelection(): void {
  updateSelection((it) => (it.groupId ? { ...it, groupId: undefined } : it))
}

// ---------------------------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------------------------

/** Topmost frame containing `p`. */
export function frameAt(p: Vec, items: Items): FrameItem | null {
  let best: FrameItem | null = null
  for (const it of Object.values(items)) {
    if (it.type === 'frame' && rectContains(boxRect(it), p) && (!best || it.z > best.z)) best = it
  }
  return best
}

/** Recomputes which frame each of `ids` (or every item) sits in, by the item's center. */
export function refreshFrames(ids?: string[]): void {
  const items = get().items
  const patch: Patch = {}
  for (const id of ids ?? Object.keys(items)) {
    const it = items[id]
    if (!it || !isBox(it) || it.type === 'frame') continue
    const frameId = frameAt(rectCenter(boxRect(it)), items)?.id
    if (frameId !== it.frameId) patch[id] = { ...it, frameId }
  }
  if (Object.keys(patch).length) change(patch)
}
