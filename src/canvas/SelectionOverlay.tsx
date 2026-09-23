import { Lock } from 'lucide-react'
import {
  arrowHeadPath,
  connectorGeometry,
  itemBounds,
  linkedCopyPlacement,
} from '../model/connectors'
import {
  boxRect,
  fmt,
  mul,
  normalize,
  sideAnchor,
  sideNormal,
  sub,
  toScreenRect,
  unionRects,
  worldToScreen,
} from '../model/geometry'
import type { Handle } from '../model/geometry'
import { SELECTION_COLOR } from '../model/palette'
import { shapePath } from '../model/shapes'
import { isBox, isTextual } from '../model/types'
import type { BoxItem, Camera, Item, Items, Rect, Side, TextualItem } from '../model/types'
import { useBoard } from '../store/boardStore'
import { QUICK_ARROW_PX, canConnect } from './interactions'

const ALL: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CORNERS: Handle[] = ['nw', 'ne', 'se', 'sw']
const TEXT_HANDLES: Handle[] = ['nw', 'ne', 'e', 'se', 'sw', 'w']
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
const ANCHOR_GAP = 16

const CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

function handlePoint(r: Rect, h: Handle) {
  return {
    x: h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2,
    y: h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2,
  }
}

function handlesFor(selected: Item[]): Handle[] {
  const boxes = selected.filter(isBox)
  if (!boxes.length) return []
  if (selected.length > 1) return CORNERS
  const only = boxes[0]
  if (only.type === 'sticky' || only.type === 'image') return CORNERS
  if (only.type === 'text') return TEXT_HANDLES
  return ALL
}

const rectStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.w, height: r.h })

interface GhostProps {
  item: BoxItem
  side: Side
  items: Items
  camera: Camera
}

/** Faded preview of what a click on the hovered connection dot creates, where it will land. */
function DotGhost({ item, side, items, camera }: GhostProps) {
  const from = worldToScreen(sideAnchor(boxRect(item), side), camera)
  const copy = isTextual(item) ? { item, ...linkedCopyPlacement(item, side, items) } : null
  const n = sideNormal(side)
  const to = copy
    ? worldToScreen(sideAnchor(copy.rect, copy.side), camera)
    : { x: from.x + n.x * QUICK_ARROW_PX, y: from.y + n.y * QUICK_ARROW_PX }
  const dir = normalize(sub(to, from))
  return (
    <>
      {copy && (
        <GhostBody item={copy.item} r={toScreenRect(copy.rect, camera)} zoom={camera.zoom} />
      )}
      <svg
        aria-hidden
        width={1}
        height={1}
        className="wb-ghost absolute left-0 top-0 overflow-visible"
      >
        <path
          d={`M ${fmt(from)} L ${fmt(sub(to, mul(dir, 10)))}`}
          stroke={SELECTION_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <path d={arrowHeadPath(to, dir, 2)} fill={SELECTION_COLOR} />
      </svg>
    </>
  )
}

function GhostBody({ item, r, zoom }: { item: TextualItem; r: Rect; zoom: number }) {
  if (item.type === 'shape') {
    const strokeWidth = item.strokeWidth * zoom
    return (
      <svg
        aria-hidden
        width={r.w}
        height={r.h}
        className="wb-ghost absolute overflow-visible"
        style={{ left: r.x, top: r.y }}
      >
        <path
          d={shapePath(item.shape, 0, 0, r.w, r.h, strokeWidth / 2)}
          fill={item.fill === 'transparent' ? 'none' : item.fill}
          stroke={item.strokeWidth > 0 ? item.stroke : 'none'}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  // Stickies show their color; a text box has no body, so it shows a dashed outline.
  return (
    <div
      aria-hidden
      className="wb-ghost absolute rounded-[2px]"
      style={{
        ...rectStyle(r),
        background: item.type === 'sticky' ? item.fill : undefined,
        outline: item.type === 'text' ? `1.5px dashed ${SELECTION_COLOR}` : undefined,
      }}
    />
  )
}

export function SelectionOverlay() {
  const selection = useBoard((s) => s.selection)
  const items = useBoard((s) => s.items)
  const camera = useBoard((s) => s.camera)
  const interacting = useBoard((s) => s.interacting)
  const editingId = useBoard((s) => s.editingId)
  const marquee = useBoard((s) => s.marquee)
  const hoverId = useBoard((s) => s.hoverId)
  const hoverSide = useBoard((s) => s.hoverSide)
  const tool = useBoard((s) => s.tool)
  const snapTarget = useBoard((s) => s.draftConnector?.targetId ?? null)

  const selected = selection.map((id) => items[id]).filter(Boolean)
  const rects = selected
    .map((it) => itemBounds(it, items))
    .filter((r): r is Rect => r !== null)
    .map((r) => toScreenRect(r, camera))
  const box = unionRects(rects)
  const locked = selected.some((it) => it.locked)
  const single = selected.length === 1 ? selected[0] : null
  const onlyConnectors = selected.length > 0 && selected.every((it) => it.type === 'connector')
  const handles = !box || interacting || editingId || locked ? [] : handlesFor(selected)

  // Endpoint handles for a single selected connector.
  const ends =
    single?.type === 'connector' && !locked && !editingId ? connectorGeometry(single, items) : null

  // Connection dots on the hovered item, or on a single selected item.
  const dotsFor = hoverId ? items[hoverId] : single
  const showDots =
    !editingId &&
    (tool === 'select' || tool === 'connector') &&
    canConnect(dotsFor) &&
    !dotsFor.locked &&
    (!interacting || hoverId === dotsFor.id)
  const dotRect = showDots ? toScreenRect(boxRect(dotsFor), camera) : null
  // The hovered dot previews what a click on it creates.
  const ghost =
    dotRect && canConnect(dotsFor) && hoverId === dotsFor.id && hoverSide
      ? { item: dotsFor, side: hoverSide }
      : null

  const highlightId = snapTarget ?? (interacting ? hoverId : null)
  const highlight = highlightId && items[highlightId] ? itemBounds(items[highlightId], items) : null

  return (
    <div className="pointer-events-none absolute inset-0">
      {selected.length > 1 &&
        rects.map((r, i) => (
          <div
            key={i}
            className="absolute"
            style={{ ...rectStyle(r), outline: `1px solid ${SELECTION_COLOR}`, opacity: 0.55 }}
          />
        ))}
      {box && !onlyConnectors && (
        <div
          className="absolute"
          style={{
            left: box.x - 1,
            top: box.y - 1,
            width: box.w + 2,
            height: box.h + 2,
            border: `1.5px solid ${SELECTION_COLOR}`,
            borderRadius: 2,
          }}
        />
      )}
      {box &&
        handles.map((h) => {
          const p = handlePoint(box, h)
          return (
            <div
              key={h}
              data-handle={h}
              className="wb-handle pointer-events-auto absolute"
              style={{ left: p.x - 5, top: p.y - 5, cursor: CURSOR[h] }}
            />
          )
        })}
      {ends &&
        (['start', 'end'] as const).map((which) => {
          const p = worldToScreen(which === 'start' ? ends.start : ends.end, camera)
          return (
            <div
              key={which}
              data-handle={`conn-${which}`}
              className="wb-conn-handle pointer-events-auto absolute"
              style={{ left: p.x - 6, top: p.y - 6 }}
            />
          )
        })}
      {ghost && <DotGhost item={ghost.item} side={ghost.side} items={items} camera={camera} />}
      {dotRect &&
        dotsFor &&
        SIDES.map((side) => {
          const a = sideAnchor(dotRect, side)
          const n = sideNormal(side)
          return (
            <div
              key={side}
              data-anchor-item={dotsFor.id}
              data-anchor-side={side}
              title={
                isTextual(dotsFor)
                  ? 'Click for a linked copy, or drag to connect'
                  : 'Click for an arrow, or drag to connect'
              }
              className="wb-anchor pointer-events-auto absolute"
              style={{ left: a.x + n.x * ANCHOR_GAP - 7, top: a.y + n.y * ANCHOR_GAP - 7 }}
            />
          )
        })}
      {highlight && (
        <div
          className="absolute rounded-[3px]"
          style={{
            ...rectStyle(toScreenRect(highlight, camera)),
            outline: `2px solid ${SELECTION_COLOR}`,
            outlineOffset: 2,
          }}
        />
      )}
      {box && locked && (
        <div
          className="absolute flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] text-neutral-600 shadow"
          style={{ left: box.x + box.w - 56, top: box.y - 26 }}
        >
          <Lock size={11} /> Locked
        </div>
      )}
      {marquee && (
        <div
          className="absolute"
          style={{
            ...rectStyle(toScreenRect(marquee, camera)),
            background: 'rgb(59 108 255 / 0.08)',
            border: `1px solid ${SELECTION_COLOR}`,
          }}
        />
      )}
    </div>
  )
}
