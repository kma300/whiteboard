import { itemBounds } from '../model/connectors'
import {
  createConnector,
  createFrame,
  createShape,
  createSticky,
  createStroke,
  createText,
} from '../model/factories'
import {
  boxRect,
  clamp,
  distance,
  distToSegment,
  expandRect,
  nearestSide,
  rectCenter,
  rectContains,
  rectContainsRect,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  screenToWorld,
  unionRects,
  zoomAt,
} from '../model/geometry'
import type { Handle } from '../model/geometry'
import { DEFAULT_FRAME, DEFAULT_SHAPE_SIZE, HIGHLIGHTER_SIZE } from '../model/palette'
import { isBox } from '../model/types'
import type { BoxItem, ConnectorEnd, Item, Rect, Side, StrokeItem, Vec } from '../model/types'
import * as B from '../store/boardStore'
import { isTypingTarget } from '../store/commands'
import type { Patch } from '../store/history'
import { insertImages } from './images'

interface Pointer {
  screen: Vec
  world: Vec
  shift: boolean
  alt: boolean
  pressure: number
  pointerType: string
}

interface Gesture {
  cursor?: string
  /** Called for every raw pointer sample, including coalesced ones (pen strokes). */
  sample?(p: Pointer): void
  /** Called at most once per animation frame with the latest pointer. */
  move(p: Pointer): void
  up(p: Pointer): void
  cancel(): void
}

const DRAG_THRESHOLD = 3
const DOUBLE_CLICK_MS = 400
const MIN_ITEM_SIZE = 8
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

const state = () => B.useBoard.getState()

/** Items a connector can attach to. */
export function canConnect(item: Item | null | undefined): item is BoxItem {
  return (
    !!item &&
    (item.type === 'sticky' ||
      item.type === 'shape' ||
      item.type === 'text' ||
      item.type === 'image')
  )
}

/** Wires pointer, wheel, drop, and space-to-pan handling onto the canvas element. Returns a cleanup. */
export function createInteractions(el: HTMLElement): () => void {
  let gesture: Gesture | null = null
  let pointerId: number | null = null
  let latestScreen: Vec | null = null
  let latestEvent: PointerEvent | null = null
  let frame = 0
  let spaceDown = false
  let rect = el.getBoundingClientRect()
  let lastClick = { time: 0, x: 0, y: 0, id: '' }

  const screenOf = (e: MouseEvent): Vec => ({ x: e.clientX - rect.left, y: e.clientY - rect.top })

  function pointerFrom(e: MouseEvent, screen = screenOf(e)): Pointer {
    const pe = e as PointerEvent
    return {
      screen,
      world: screenToWorld(screen, state().camera),
      shift: e.shiftKey,
      alt: e.altKey,
      pressure: pe.pressure || 0.5,
      pointerType: pe.pointerType || 'mouse',
    }
  }

  function updateCursor() {
    const s = state()
    let cursor = 'default'
    if (gesture?.cursor) cursor = gesture.cursor
    else if (spaceDown || s.tool === 'hand') cursor = 'grab'
    else if (s.tool !== 'select') cursor = 'crosshair'
    el.style.cursor = cursor
  }

  function flush() {
    frame = 0
    if (gesture && latestScreen && latestEvent) gesture.move(pointerFrom(latestEvent, latestScreen))
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(flush)
  }

  function endGesture() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    gesture = null
    pointerId = null
    latestEvent = null
    latestScreen = null
    B.setInteracting(false)
    updateCursor()
  }

  function isDoubleClick(p: Pointer, id: string): boolean {
    const now = performance.now()
    const hit =
      lastClick.id === id &&
      now - lastClick.time < DOUBLE_CLICK_MS &&
      distance(p.screen, lastClick) < 6
    lastClick = hit ? { time: 0, x: 0, y: 0, id: '' } : { time: now, ...p.screen, id }
    return hit
  }

  /** Topmost item under the pointer that a connector can attach to, skipping `exclude`. */
  function connectTargetAt(p: Pointer, exclude: string | null): BoxItem | null {
    const s = state()
    const hits = document.elementsFromPoint(p.screen.x + rect.left, p.screen.y + rect.top)
    for (const node of hits) {
      const id = node.closest('[data-item-id]')?.getAttribute('data-item-id')
      const item = id ? s.items[id] : undefined
      if (id !== exclude && canConnect(item)) return item
    }
    return null
  }

  // -------------------------------------------------------------------------------------------
  // Gestures
  // -------------------------------------------------------------------------------------------

  function panGesture(start: Pointer): Gesture {
    const cam0 = state().camera
    return {
      cursor: 'grabbing',
      move(p) {
        B.setCamera({
          ...cam0,
          x: cam0.x + p.screen.x - start.screen.x,
          y: cam0.y + p.screen.y - start.screen.y,
        })
      },
      up() {},
      cancel() {
        B.setCamera(cam0)
      },
    }
  }

  function moveGesture(start: Pointer): Gesture | null {
    const s = state()
    const ids = B.movingSet(s.selection, s.items)
    if (!ids.length) return null
    const snapshot = new Map(ids.map((id) => [id, s.items[id]]))
    let moved = false
    B.beginTx()
    return {
      move(p) {
        if (!moved && distance(p.screen, start.screen) < DRAG_THRESHOLD) return
        moved = true
        const dx = p.world.x - start.world.x
        const dy = p.world.y - start.world.y
        const patch: Patch = {}
        for (const [id, it] of snapshot) patch[id] = B.translateItem(it, dx, dy)
        B.change(patch)
      },
      up() {
        if (moved) B.refreshFrames([...snapshot.keys()])
        B.commitTx()
      },
      cancel() {
        B.cancelTx()
      },
    }
  }

  function resizeGesture(handle: Handle, start: Pointer): Gesture | null {
    const s = state()
    const targets = s.selection
      .map((id) => s.items[id])
      .filter((it): it is BoxItem => Boolean(it) && isBox(it) && !it.locked)
    const sb = unionRects(targets.map(boxRect))
    if (!sb) return null
    const single = targets.length === 1 ? targets[0] : null
    const corner = handle.length === 2
    const keepAspect =
      targets.length > 1 ||
      single?.type === 'sticky' ||
      single?.type === 'image' ||
      (single?.type === 'text' && corner)
    const hasFrame = targets.some((it) => it.type === 'frame')
    B.beginTx()
    return {
      cursor: HANDLE_CURSOR[handle],
      move(p) {
        const nb = resizeRect(
          sb,
          handle,
          p.world.x - start.world.x,
          p.world.y - start.world.y,
          keepAspect || p.shift,
          MIN_ITEM_SIZE,
        )
        const sx = nb.w / Math.max(sb.w, 1e-6)
        const sy = nb.h / Math.max(sb.h, 1e-6)
        const patch: Patch = {}
        for (const it of targets) patch[it.id] = scaleItem(it, sb, nb, sx, sy)
        B.change(patch)
      },
      up() {
        if (hasFrame) B.refreshFrames()
        B.commitTx()
      },
      cancel() {
        B.cancelTx()
      },
    }
  }

  function marqueeGesture(start: Pointer, frameCandidate: string | null): Gesture {
    const base = start.shift ? state().selection : []
    let dragged = false
    return {
      move(p) {
        if (!dragged && distance(p.screen, start.screen) < DRAG_THRESHOLD) return
        dragged = true
        const r = rectFromPoints(start.world, p.world)
        B.setMarquee(r)
        const s = state()
        const hits: string[] = []
        for (const it of Object.values(s.items)) {
          const b = itemBounds(it, s.items)
          if (!b) continue
          const inside = it.type === 'frame' ? rectContainsRect(r, b) : rectsIntersect(r, b)
          if (inside) hits.push(it.id)
        }
        B.select([...base, ...hits])
      },
      up() {
        B.setMarquee(null)
        if (!dragged && frameCandidate) B.select([frameCandidate])
      },
      cancel() {
        B.setMarquee(null)
      },
    }
  }

  function createBoxGesture(kind: 'shape' | 'frame', start: Pointer): Gesture {
    const s = state()
    const initial = { x: start.world.x, y: start.world.y, w: MIN_ITEM_SIZE, h: MIN_ITEM_SIZE }
    const frames = Object.values(s.items).filter((it) => it.type === 'frame').length
    const base =
      kind === 'shape'
        ? createShape(initial, s.toolOptions.shape, B.nextZ())
        : createFrame(initial, `Frame ${frames + 1}`, B.nextZ())
    let dragged = false
    B.beginTx()
    B.addItems([base])
    return {
      cursor: 'crosshair',
      move(p) {
        if (!dragged && distance(p.screen, start.screen) < DRAG_THRESHOLD + 1) return
        dragged = true
        B.change({ [base.id]: { ...base, ...dragRect(start.world, p.world, p.shift) } })
      },
      up() {
        if (!dragged) {
          const w = kind === 'shape' ? DEFAULT_SHAPE_SIZE : DEFAULT_FRAME.w
          const h = kind === 'shape' ? DEFAULT_SHAPE_SIZE : DEFAULT_FRAME.h
          B.change({
            [base.id]: { ...base, x: start.world.x - w / 2, y: start.world.y - h / 2, w, h },
          })
        }
        if (kind === 'frame') B.refreshFrames()
        else B.refreshFrames([base.id])
        B.commitTx()
        B.setTool('select')
        B.select([base.id])
      },
      cancel() {
        B.cancelTx()
      },
    }
  }

  function drawGesture(start: Pointer, highlighter: boolean): Gesture {
    const opts = state().toolOptions
    const style = highlighter
      ? {
          color: opts.highlighterColor,
          size: HIGHLIGHTER_SIZE,
          opacity: 0.45,
          simulatePressure: false,
        }
      : {
          color: opts.penColor,
          size: opts.penSize,
          opacity: 1,
          simulatePressure: start.pointerType !== 'pen',
        }
    const points: [number, number, number][] = [[start.world.x, start.world.y, start.pressure]]
    B.setDraftStroke({ points: [...points], ...style })
    return {
      cursor: 'crosshair',
      sample(p) {
        points.push([p.world.x, p.world.y, p.pressure])
      },
      move() {
        B.setDraftStroke({ points: [...points], ...style })
      },
      up() {
        B.setDraftStroke(null)
        if (points.length === 1)
          points.push([start.world.x + 0.5, start.world.y + 0.5, start.pressure])
        const item = createStroke(points, style, B.nextZ())
        B.beginTx()
        B.addItems([item], false)
        B.refreshFrames([item.id])
        B.commitTx()
      },
      cancel() {
        B.setDraftStroke(null)
      },
    }
  }

  function eraseGesture(start: Pointer): Gesture {
    let last = start.world
    const eraseAt = (p: Pointer) => {
      const s = state()
      const reach = 8 / s.camera.zoom
      const path = rectFromPoints(last, p.world)
      const hits: string[] = []
      for (const it of Object.values(s.items)) {
        if (it.type !== 'stroke' || it.locked) continue
        const r = expandRect(boxRect(it), reach + it.size)
        if (!rectsIntersect(r, path)) continue
        if (strokeTouches(it, last, p.world, reach + it.size / 2)) hits.push(it.id)
      }
      last = p.world
      if (hits.length) B.deleteItems(hits)
    }
    B.beginTx()
    eraseAt(start)
    return {
      cursor: 'crosshair',
      move: eraseAt,
      up() {
        B.commitTx()
      },
      cancel() {
        B.cancelTx()
      },
    }
  }

  /**
   * Draws a connector from `from`. Dropping it on an item attaches it. Dropping a line pulled from
   * a sticky or shape onto empty canvas creates a matching item there, like Miro does.
   */
  function connectGesture(start: Pointer, from: ConnectorEnd, sourceId: string | null): Gesture {
    const style = state().toolOptions.connectorStyle
    let dragged = false
    const endFor = (p: Pointer) => {
      const target = connectTargetAt(p, sourceId)
      const end: ConnectorEnd = target
        ? { kind: 'item', itemId: target.id, side: nearestSide(boxRect(target), p.world) }
        : { kind: 'point', x: p.world.x, y: p.world.y }
      return { end, targetId: target?.id ?? null }
    }
    return {
      cursor: 'crosshair',
      move(p) {
        if (!dragged && distance(p.screen, start.screen) < DRAG_THRESHOLD) return
        dragged = true
        B.setDraftConnector({ start: from, style, ...endFor(p) })
      },
      up(p) {
        B.setDraftConnector(null)
        if (!dragged) return
        let { end } = endFor(p)
        const s = state()
        const source = sourceId ? s.items[sourceId] : undefined
        B.beginTx()
        let spawned: BoxItem | null = null
        if (
          end.kind === 'point' &&
          source &&
          isBox(source) &&
          distance(p.screen, start.screen) > 40
        ) {
          spawned = spawnLike(source, p.world, B.nextZ())
          if (spawned) {
            B.addItems([spawned], false)
            B.refreshFrames([spawned.id])
            end = {
              kind: 'item',
              itemId: spawned.id,
              side: nearestSide(boxRect(spawned), rectCenter(boxRect(source))),
            }
          }
        }
        const connector = createConnector(from, end, style, B.nextZ())
        B.addItems([connector], false)
        B.setTool('select')
        if (spawned) {
          B.startEditing(spawned.id)
        } else {
          B.select([connector.id])
          B.commitTx()
        }
      },
      cancel() {
        B.setDraftConnector(null)
      },
    }
  }

  /** Drags one end of the selected connector to re-attach it or leave it free. */
  function connectorEndGesture(which: 'start' | 'end'): Gesture | null {
    const s = state()
    const connector = s.items[s.selection[0]]
    if (!connector || connector.type !== 'connector' || connector.locked) return null
    const other = which === 'start' ? connector.end : connector.start
    const exclude = other.kind === 'item' ? other.itemId : null
    B.beginTx()
    return {
      cursor: 'crosshair',
      move(p) {
        const target = connectTargetAt(p, exclude)
        const end: ConnectorEnd = target
          ? { kind: 'item', itemId: target.id, side: nearestSide(boxRect(target), p.world) }
          : { kind: 'point', x: p.world.x, y: p.world.y }
        B.setHover(target?.id ?? null)
        B.change({
          [connector.id]: which === 'start' ? { ...connector, start: end } : { ...connector, end },
        })
      },
      up() {
        B.setHover(null)
        B.commitTx()
      },
      cancel() {
        B.setHover(null)
        B.cancelTx()
      },
    }
  }

  function placeSticky(p: Pointer) {
    const s = state()
    const item = createSticky(p.world, s.toolOptions.stickyFill, B.nextZ())
    B.beginTx()
    B.addItems([item])
    B.refreshFrames([item.id])
    B.startEditing(item.id)
  }

  function placeText(p: Pointer) {
    const item = createText({ x: p.world.x, y: p.world.y - 18 }, B.nextZ())
    B.beginTx()
    B.addItems([item])
    B.refreshFrames([item.id])
    B.startEditing(item.id)
  }

  function anchorAt(target: Element): { itemId: string; side: Side } | null {
    const dot = target.closest('[data-anchor-side]')
    const itemId = dot?.getAttribute('data-anchor-item')
    const side = dot?.getAttribute('data-anchor-side') as Side | null | undefined
    return itemId && side && SIDES.includes(side) ? { itemId, side } : null
  }

  function selectGesture(target: Element, p: Pointer): Gesture | null {
    const s = state()
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle')
    if (handle === 'conn-start') return connectorEndGesture('start')
    if (handle === 'conn-end') return connectorEndGesture('end')
    if (handle && handle in HANDLE_CURSOR) return resizeGesture(handle as Handle, p)

    const anchor = anchorAt(target)
    if (anchor) return connectGesture(p, { kind: 'item', ...anchor }, anchor.itemId)

    const titleId = target.closest('[data-frame-title]')?.getAttribute('data-frame-title')
    if (titleId && s.items[titleId]) {
      if (isDoubleClick(p, titleId)) {
        B.startEditing(titleId)
        return null
      }
      if (p.shift) B.toggleSelection([titleId])
      else if (!s.selection.includes(titleId)) B.select([titleId])
      return state().selection.includes(titleId) ? moveGesture(p) : null
    }

    const id = target.closest('[data-item-id]')?.getAttribute('data-item-id') ?? null
    const item = id ? s.items[id] : undefined
    if (item && item.type !== 'frame') {
      if (isDoubleClick(p, item.id)) {
        B.startEditing(item.id)
        return null
      }
      if (p.shift) B.toggleSelection([item.id])
      else if (!s.selection.includes(item.id)) B.select([item.id])
      if (!state().selection.includes(item.id)) return null
      if (p.alt) {
        // Alt-drag moves a copy; the duplicate and the move share one undo step.
        B.beginTx()
        B.duplicateSelection({ x: 0, y: 0 })
      }
      const move = moveGesture(p)
      if (!move) B.commitTx()
      return move
    }

    lastClick = { time: 0, x: 0, y: 0, id: '' }
    if (!p.shift) B.clearSelection()
    return marqueeGesture(p, item?.type === 'frame' ? item.id : null)
  }

  function connectorToolGesture(target: Element, p: Pointer): Gesture {
    const anchor = anchorAt(target)
    if (anchor) return connectGesture(p, { kind: 'item', ...anchor }, anchor.itemId)
    const id = target.closest('[data-item-id]')?.getAttribute('data-item-id')
    const item = id ? state().items[id] : undefined
    if (canConnect(item)) {
      const from: ConnectorEnd = {
        kind: 'item',
        itemId: item.id,
        side: nearestSide(boxRect(item), p.world),
      }
      return connectGesture(p, from, null)
    }
    return connectGesture(p, { kind: 'point', x: p.world.x, y: p.world.y }, null)
  }

  function startGesture(e: PointerEvent, target: Element, p: Pointer): Gesture | null {
    const s = state()
    if (e.button === 1 || spaceDown || s.tool === 'hand') return panGesture(p)
    switch (s.tool) {
      case 'select':
        return selectGesture(target, p)
      case 'sticky':
        placeSticky(p)
        return null
      case 'text':
        placeText(p)
        return null
      case 'shape':
        return createBoxGesture('shape', p)
      case 'frame':
        return createBoxGesture('frame', p)
      case 'pen':
        return drawGesture(p, false)
      case 'highlighter':
        return drawGesture(p, true)
      case 'eraser':
        return eraseGesture(p)
      case 'connector':
        return connectorToolGesture(target, p)
    }
  }

  // -------------------------------------------------------------------------------------------
  // Hover (drives the connection dots)
  // -------------------------------------------------------------------------------------------

  function updateHover(e: PointerEvent) {
    const s = state()
    if (s.interacting || s.editingId || (s.tool !== 'select' && s.tool !== 'connector')) {
      B.setHover(null)
      return
    }
    const target = e.target as Element
    if (target.closest('[data-anchor-side]')) return
    const id = target.closest('[data-item-id]')?.getAttribute('data-item-id')
    const item = id ? s.items[id] : undefined
    if (canConnect(item)) {
      B.setHover(item.id)
      return
    }
    const hovered = s.hoverId ? s.items[s.hoverId] : undefined
    if (hovered && isBox(hovered)) {
      const zone = expandRect(boxRect(hovered), 28 / s.camera.zoom)
      if (rectContains(zone, screenToWorld(screenOf(e), s.camera))) return
    }
    B.setHover(null)
  }

  // -------------------------------------------------------------------------------------------
  // DOM events
  // -------------------------------------------------------------------------------------------

  function onPointerDown(e: PointerEvent) {
    if (e.button === 2 || gesture) return
    const target = e.target as Element
    const s = state()
    if (s.editingId) {
      if (target.closest('textarea, input')) return
      B.stopEditing()
    }
    if (isTypingTarget(document.activeElement)) (document.activeElement as HTMLElement).blur()
    rect = el.getBoundingClientRect()
    const p = pointerFrom(e)
    const next = startGesture(e, target, p)
    e.preventDefault()
    if (!next) return
    gesture = next
    pointerId = e.pointerId
    latestEvent = e
    latestScreen = p.screen
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // The pointer can already be gone (synthetic or cancelled events); the gesture still works.
    }
    B.setHover(null)
    B.setInteracting(true)
    updateCursor()
  }

  function onPointerMove(e: PointerEvent) {
    if (!gesture) {
      updateHover(e)
      return
    }
    if (e.pointerId !== pointerId) return
    if (gesture.sample) {
      const samples = e.getCoalescedEvents?.() ?? []
      for (const ce of samples.length ? samples : [e]) gesture.sample(pointerFrom(ce))
    }
    latestEvent = e
    latestScreen = screenOf(e)
    schedule()
  }

  function onPointerUp(e: PointerEvent) {
    if (!gesture || e.pointerId !== pointerId) return
    const g = gesture
    const p = pointerFrom(e)
    g.move(p)
    endGesture()
    g.up(p)
  }

  function onPointerCancel(e: PointerEvent) {
    if (!gesture || e.pointerId !== pointerId) return
    const g = gesture
    endGesture()
    g.cancel()
  }

  function onPointerLeave() {
    if (!gesture) B.setHover(null)
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const s = state()
    rect = el.getBoundingClientRect()
    const screen = screenOf(e)
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? s.viewport.h : 1
    if (e.ctrlKey || e.metaKey) {
      const dy = clamp(e.deltaY * unit, -25, 25)
      B.setCamera(zoomAt(s.camera, screen, s.camera.zoom * Math.exp(-dy * 0.01)))
    } else {
      B.setCamera({
        ...s.camera,
        x: s.camera.x - e.deltaX * unit,
        y: s.camera.y - e.deltaY * unit,
      })
    }
    if (gesture) schedule()
  }

  function onDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  function onDrop(e: DragEvent) {
    const files = [...(e.dataTransfer?.files ?? [])]
    if (!files.length) return
    e.preventDefault()
    rect = el.getBoundingClientRect()
    void insertImages(files, screenToWorld(screenOf(e), state().camera))
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && gesture) {
      const g = gesture
      endGesture()
      g.cancel()
      e.preventDefault()
      return
    }
    if (e.code === 'Space' && !e.repeat && !isTypingTarget(e.target)) {
      spaceDown = true
      updateCursor()
      e.preventDefault()
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spaceDown = false
      updateCursor()
    }
  }

  // Keep focus where it is (for example a sticky's editor that just opened) and stop text selection.
  const onMouseDown = (e: MouseEvent) => {
    if (!(e.target as Element).closest('textarea, input')) e.preventDefault()
  }
  const onContextMenu = (e: Event) => e.preventDefault()
  const onResize = () => {
    rect = el.getBoundingClientRect()
  }
  const unsubscribe = B.useBoard.subscribe((s, prev) => {
    if (s.tool !== prev.tool) updateCursor()
  })

  const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [
    [el, 'pointerdown', onPointerDown as EventListener],
    [el, 'pointermove', onPointerMove as EventListener],
    [el, 'pointerup', onPointerUp as EventListener],
    [el, 'pointercancel', onPointerCancel as EventListener],
    [el, 'pointerleave', onPointerLeave],
    [el, 'wheel', onWheel as EventListener, { passive: false }],
    [el, 'mousedown', onMouseDown as EventListener],
    [el, 'contextmenu', onContextMenu],
    [el, 'dragover', onDragOver as EventListener],
    [el, 'drop', onDrop as EventListener],
    [window, 'keydown', onKeyDown as EventListener],
    [window, 'keyup', onKeyUp as EventListener],
    [window, 'resize', onResize],
  ]
  for (const [target, type, fn, options] of listeners) target.addEventListener(type, fn, options)
  updateCursor()

  return () => {
    if (frame) cancelAnimationFrame(frame)
    unsubscribe()
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn)
  }
}

/** Rect dragged from `a` to `b`; with `square` the shorter side grows to match. */
function dragRect(a: Vec, b: Vec, square: boolean): Rect {
  const r = rectFromPoints(a, b)
  if (!square) return r
  const side = Math.max(r.w, r.h)
  return {
    x: b.x < a.x ? a.x - side : a.x,
    y: b.y < a.y ? a.y - side : a.y,
    w: side,
    h: side,
  }
}

/** Maps an item from the selection box `sb` into the resized box `nb`. */
function scaleItem(it: BoxItem, sb: Rect, nb: Rect, sx: number, sy: number): BoxItem {
  const x = nb.x + (it.x - sb.x) * sx
  const y = nb.y + (it.y - sb.y) * sy
  const w = Math.max(1, it.w * sx)
  const h = Math.max(1, it.h * sy)
  switch (it.type) {
    case 'stroke':
      return {
        ...it,
        x,
        y,
        w,
        h,
        points: it.points.map(([px, py, pr]) => [px * sx, py * sy, pr]),
      }
    case 'text':
      return Math.abs(sx - sy) < 1e-6
        ? { ...it, x, y, w, h, fontSize: Math.max(4, Math.round(it.fontSize * sx * 10) / 10) }
        : { ...it, x, y, w }
    default:
      return { ...it, x, y, w, h }
  }
}

/** True when the eraser path from `a` to `b` passes within `reach` of the stroke. */
function strokeTouches(stroke: StrokeItem, a: Vec, b: Vec, reach: number): boolean {
  const pts = stroke.points.map(([x, y]) => ({ x: stroke.x + x, y: stroke.y + y }))
  const probes = [a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]
  if (pts.length === 1) return probes.some((q) => distance(q, pts[0]) <= reach)
  for (let i = 1; i < pts.length; i++) {
    for (const q of probes) if (distToSegment(q, pts[i - 1], pts[i]) <= reach) return true
  }
  return false
}

/** A new item like `source` (same kind and colors, empty text) centered on `at`. */
function spawnLike(source: Item, at: Vec, z: number): BoxItem | null {
  if (source.type === 'sticky') {
    return {
      ...createSticky(at, source.fill, z),
      w: source.w,
      h: source.h,
      x: at.x - source.w / 2,
      y: at.y - source.h / 2,
    }
  }
  if (source.type === 'shape') {
    const shape = createShape(
      { x: at.x - source.w / 2, y: at.y - source.h / 2, w: source.w, h: source.h },
      source.shape,
      z,
    )
    return {
      ...shape,
      fill: source.fill,
      stroke: source.stroke,
      strokeWidth: source.strokeWidth,
      color: source.color,
      fontSize: source.fontSize,
    }
  }
  return null
}
