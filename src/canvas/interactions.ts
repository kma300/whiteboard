import { itemBounds } from '../model/connectors'
import { createShape, createSticky, createText } from '../model/factories'
import {
  boxRect,
  clamp,
  distance,
  rectContainsRect,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  screenToWorld,
  unionRects,
  zoomAt,
} from '../model/geometry'
import type { Handle } from '../model/geometry'
import { DEFAULT_SHAPE_SIZE } from '../model/palette'
import { isBox } from '../model/types'
import type { BoxItem, Rect, Vec } from '../model/types'
import * as B from '../store/boardStore'
import type { Patch } from '../store/history'

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
  /** Called at most once per animation frame with the latest pointer. */
  move(p: Pointer): void
  up(p: Pointer): void
  cancel(): void
}

const DRAG_THRESHOLD = 3
const DOUBLE_CLICK_MS = 400
const MIN_ITEM_SIZE = 8

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

function isTypingTarget(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
  )
}

/** Wires pointer, wheel, and space-to-pan handling onto the canvas element. Returns a cleanup. */
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

  function createShapeGesture(start: Pointer): Gesture {
    const s = state()
    const base = createShape(
      { x: start.world.x, y: start.world.y, w: MIN_ITEM_SIZE, h: MIN_ITEM_SIZE },
      s.toolOptions.shape,
      B.nextZ(),
    )
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
        const cur = state().items[base.id]
        if (!dragged && cur) {
          const size = DEFAULT_SHAPE_SIZE
          B.change({
            [base.id]: {
              ...base,
              x: start.world.x - size / 2,
              y: start.world.y - size / 2,
              w: size,
              h: size,
            },
          })
        }
        B.refreshFrames([base.id])
        B.commitTx()
        B.setTool('select')
        B.select([base.id])
      },
      cancel() {
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

  function selectGesture(target: Element, p: Pointer): Gesture | null {
    const s = state()
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle')
    if (handle && handle in HANDLE_CURSOR) return resizeGesture(handle as Handle, p)

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
      return state().selection.includes(item.id) ? moveGesture(p) : null
    }

    lastClick = { time: 0, x: 0, y: 0, id: '' }
    if (!p.shift) B.clearSelection()
    return marqueeGesture(p, item?.type === 'frame' ? item.id : null)
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
        return createShapeGesture(p)
      default:
        return null
    }
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
    B.setInteracting(true)
    updateCursor()
  }

  function onPointerMove(e: PointerEvent) {
    if (!gesture || e.pointerId !== pointerId) return
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

  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerCancel)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('mousedown', onMouseDown)
  el.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('resize', onResize)
  updateCursor()

  return () => {
    if (frame) cancelAnimationFrame(frame)
    unsubscribe()
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('pointercancel', onPointerCancel)
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('mousedown', onMouseDown)
    el.removeEventListener('contextmenu', onContextMenu)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('resize', onResize)
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
