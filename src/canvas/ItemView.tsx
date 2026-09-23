import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { arrowHeadPath, connectorGeometry } from '../model/connectors'
import { shapePath, strokePath } from '../model/shapes'
import type {
  ConnectorItem,
  FrameItem,
  ImageItem,
  Items,
  ShapeItem,
  ShapeKind,
  StickyItem,
  StrokeItem,
  TextAlign,
  TextItem,
} from '../model/types'
import { changeSilently, setItemText, stopEditing, useBoard } from '../store/boardStore'
import { TextEditor } from './TextEditor'
import { TEXT_LINE_HEIGHT, useFitText } from './useFitText'

function place(x: number, y: number, w?: number, h?: number): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    transform: `translate(${x}px, ${y}px)`,
    width: w,
    height: h,
  }
}

function textStyle(
  fontSize: number,
  align: TextAlign,
  bold: boolean | undefined,
  color: string,
): CSSProperties {
  return {
    fontSize,
    lineHeight: TEXT_LINE_HEIGHT,
    textAlign: align,
    fontWeight: bold ? 700 : 400,
    color,
    width: '100%',
  }
}

export const ItemView = memo(function ItemView({ id }: { id: string }) {
  const item = useBoard((s) => s.items[id])
  const editing = useBoard((s) => s.editingId === id)
  if (!item) return null
  switch (item.type) {
    case 'sticky':
      return <StickyView item={item} editing={editing} />
    case 'text':
      return <TextView item={item} editing={editing} />
    case 'shape':
      return <ShapeView item={item} editing={editing} />
    case 'frame':
      return <FrameView item={item} editing={editing} />
    case 'image':
      return <ImageView item={item} />
    case 'stroke':
      return <StrokeView item={item} />
    case 'connector':
      return <ConnectorView item={item} />
  }
})

function StickyView({ item, editing }: { item: StickyItem; editing: boolean }) {
  const pad = Math.max(8, item.w * 0.07)
  const fontSize = useFitText(
    item.text,
    item.w - pad * 2,
    item.h - pad * 2,
    Math.round(item.w * 0.14),
    item.bold,
  )
  const style = textStyle(fontSize, item.align, item.bold, '#1F1F1F')
  return (
    <div
      data-item-id={item.id}
      className="wb-sticky"
      style={{ ...place(item.x, item.y, item.w, item.h), background: item.fill, padding: pad }}
    >
      {editing ? (
        <TextEditor id={item.id} value={item.text} style={style} />
      ) : (
        <div className="wb-text" style={style}>
          {item.text}
        </div>
      )}
    </div>
  )
}

function TextView({ item, editing }: { item: TextItem; editing: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = item.id

  // Text boxes grow with their content; keep the stored height in sync for selection and export.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight
      const cur = useBoard.getState().items[id]
      if (cur?.type === 'text' && Math.abs(cur.h - h) > 0.5) changeSilently({ [id]: { ...cur, h } })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [id])

  const style = textStyle(item.fontSize, item.align, item.bold, item.color)
  return (
    <div
      ref={ref}
      data-item-id={item.id}
      style={{ ...place(item.x, item.y, item.w), minHeight: item.fontSize * TEXT_LINE_HEIGHT }}
    >
      {editing ? (
        <TextEditor id={item.id} value={item.text} style={style} />
      ) : (
        <div className="wb-text" style={style}>
          {item.text || '​'}
        </div>
      )}
    </div>
  )
}

/** Region inside each shape where text sits comfortably. Fractions of the shape box. */
const TEXT_BOX: Record<ShapeKind, [number, number, number, number]> = {
  rect: [0, 0, 1, 1],
  roundRect: [0, 0, 1, 1],
  ellipse: [0.146, 0.146, 0.708, 0.708],
  triangle: [0.25, 0.45, 0.5, 0.5],
  diamond: [0.25, 0.25, 0.5, 0.5],
  star: [0.3, 0.36, 0.4, 0.38],
}

function ShapeView({ item, editing }: { item: ShapeItem; editing: boolean }) {
  const [fx, fy, fw, fh] = TEXT_BOX[item.shape]
  const pad = Math.max(4, Math.min(item.w, item.h) * 0.06)
  const box = {
    x: item.w * fx + pad,
    y: item.h * fy + pad,
    w: Math.max(item.w * fw - pad * 2, 1),
    h: Math.max(item.h * fh - pad * 2, 1),
  }
  const fontSize = useFitText(item.text, box.w, box.h, item.fontSize, item.bold)
  const style = textStyle(fontSize, item.align, item.bold, item.color)
  const d = useMemo(
    () => shapePath(item.shape, 0, 0, item.w, item.h, item.strokeWidth / 2),
    [item.shape, item.w, item.h, item.strokeWidth],
  )
  return (
    <div data-item-id={item.id} style={place(item.x, item.y, item.w, item.h)}>
      <svg
        width={item.w}
        height={item.h}
        className="absolute left-0 top-0 overflow-visible"
        style={{ pointerEvents: 'none' }}
      >
        <path
          d={d}
          fill={item.fill === 'transparent' ? 'none' : item.fill}
          stroke={item.strokeWidth > 0 ? item.stroke : 'none'}
          strokeWidth={item.strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
      <div
        className="absolute flex items-center justify-center"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      >
        {editing ? (
          <TextEditor id={item.id} value={item.text} style={style} />
        ) : item.text ? (
          <div className="wb-text" style={style}>
            {item.text}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function FrameTitleEditor({ item }: { item: FrameItem }) {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true })
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      value={item.title}
      className="wb-frame-title-input"
      onChange={(e) => setItemText(item.id, e.target.value)}
      onBlur={() => stopEditing()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          stopEditing()
        }
      }}
    />
  )
}

function FrameView({ item, editing }: { item: FrameItem; editing: boolean }) {
  const zoom = useBoard((s) => s.camera.zoom)
  return (
    <div
      data-item-id={item.id}
      className="wb-frame"
      style={{ ...place(item.x, item.y, item.w, item.h), background: item.fill }}
    >
      <div
        data-frame-title={item.id}
        className="wb-frame-title"
        style={{ transform: `scale(${1 / zoom})` }}
      >
        {editing ? <FrameTitleEditor item={item} /> : item.title || 'Untitled frame'}
      </div>
    </div>
  )
}

function ImageView({ item }: { item: ImageItem }) {
  return (
    <div data-item-id={item.id} style={place(item.x, item.y, item.w, item.h)}>
      <img
        src={item.src}
        alt=""
        draggable={false}
        className="block h-full w-full select-none"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  )
}

function StrokeView({ item }: { item: StrokeItem }) {
  const zoom = useBoard((s) => s.camera.zoom)
  const d = useMemo(
    () => strokePath(item.points, item.size, item.simulatePressure, item.opacity < 1),
    [item.points, item.size, item.simulatePressure, item.opacity],
  )
  return (
    <svg
      width={1}
      height={1}
      className="absolute left-0 top-0 overflow-visible"
      style={{ transform: `translate(${item.x}px, ${item.y}px)`, pointerEvents: 'none' }}
    >
      <path d={d} fill={item.color} fillOpacity={item.opacity} />
      <path
        d={d}
        data-item-id={item.id}
        fill="transparent"
        stroke="transparent"
        strokeWidth={10 / zoom}
        style={{ pointerEvents: 'all' }}
      />
    </svg>
  )
}

function ConnectorView({ item }: { item: ConnectorItem }) {
  // Subscribe to both endpoints so the line follows them while they move.
  const startItem = useBoard((s) =>
    item.start.kind === 'item' ? s.items[item.start.itemId] : undefined,
  )
  const endItem = useBoard((s) => (item.end.kind === 'item' ? s.items[item.end.itemId] : undefined))
  const zoom = useBoard((s) => s.camera.zoom)
  const geom = useMemo(() => {
    const items: Items = {}
    if (startItem) items[startItem.id] = startItem
    if (endItem) items[endItem.id] = endItem
    return connectorGeometry(item, items)
  }, [item, startItem, endItem])
  if (!geom) return null
  return (
    <svg
      width={1}
      height={1}
      className="absolute left-0 top-0 overflow-visible"
      style={{ pointerEvents: 'none' }}
    >
      <path
        d={geom.d}
        data-item-id={item.id}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(item.strokeWidth, 14 / zoom)}
        style={{ pointerEvents: 'stroke' }}
      />
      <path
        d={geom.d}
        fill="none"
        stroke={item.stroke}
        strokeWidth={item.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrowheads sit past the trimmed hit path, so they are hit targets themselves. */}
      {item.startArrow === 'arrow' && (
        <path
          d={arrowHeadPath(geom.start, geom.startDir, item.strokeWidth)}
          data-item-id={item.id}
          fill={item.stroke}
          stroke={item.stroke}
          strokeLinejoin="round"
          style={{ pointerEvents: 'visiblePainted' }}
        />
      )}
      {item.endArrow === 'arrow' && (
        <path
          d={arrowHeadPath(geom.end, geom.endDir, item.strokeWidth)}
          data-item-id={item.id}
          fill={item.stroke}
          stroke={item.stroke}
          strokeLinejoin="round"
          style={{ pointerEvents: 'visiblePainted' }}
        />
      )}
    </svg>
  )
}
