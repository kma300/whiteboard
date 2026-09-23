import { Lock } from 'lucide-react'
import { itemBounds } from '../model/connectors'
import { toScreenRect, unionRects } from '../model/geometry'
import type { Handle } from '../model/geometry'
import { SELECTION_COLOR } from '../model/palette'
import { isBox } from '../model/types'
import type { Item, Rect } from '../model/types'
import { useBoard } from '../store/boardStore'

const ALL: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CORNERS: Handle[] = ['nw', 'ne', 'se', 'sw']
const TEXT_HANDLES: Handle[] = ['nw', 'ne', 'e', 'se', 'sw', 'w']

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

export function SelectionOverlay() {
  const selection = useBoard((s) => s.selection)
  const items = useBoard((s) => s.items)
  const camera = useBoard((s) => s.camera)
  const interacting = useBoard((s) => s.interacting)
  const editingId = useBoard((s) => s.editingId)
  const marquee = useBoard((s) => s.marquee)

  const selected = selection.map((id) => items[id]).filter(Boolean)
  const rects = selected
    .map((it) => itemBounds(it, items))
    .filter((r): r is Rect => r !== null)
    .map((r) => toScreenRect(r, camera))
  const box = unionRects(rects)
  const locked = selected.some((it) => it.locked)
  const onlyConnectors = selected.length > 0 && selected.every((it) => it.type === 'connector')
  const handles = !box || interacting || editingId || locked ? [] : handlesFor(selected)

  return (
    <div className="pointer-events-none absolute inset-0">
      {selected.length > 1 &&
        rects.map((r, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              outline: `1px solid ${SELECTION_COLOR}`,
              opacity: 0.55,
            }}
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
            ...(({ x, y, w, h }) => ({ left: x, top: y, width: w, height: h }))(
              toScreenRect(marquee, camera),
            ),
            background: 'rgb(59 108 255 / 0.08)',
            border: `1px solid ${SELECTION_COLOR}`,
          }}
        />
      )}
    </div>
  )
}
