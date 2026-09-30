import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { arrowHeadPath, connectorGeometry } from '../model/connectors'
import { CANVAS_BG, SELECTION_COLOR } from '../model/palette'
import { strokePath } from '../model/shapes'
import type { Camera } from '../model/types'
import { setViewport, useBoard } from '../store/boardStore'
import { createInteractions } from './interactions'
import { ItemView } from './ItemView'
import { SelectionOverlay } from './SelectionOverlay'

function gridStyle(cam: Camera): CSSProperties {
  let size = 24 * cam.zoom
  while (size < 12) size *= 2
  return {
    backgroundColor: CANVAS_BG,
    backgroundImage: 'radial-gradient(circle, #CFCFCA 1px, transparent 1.2px)',
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${cam.x}px ${cam.y}px`,
  }
}

/** In-progress pen stroke and connector, drawn in world space above the board. */
function Drafts() {
  const stroke = useBoard((s) => s.draftStroke)
  const connector = useBoard((s) => s.draftConnector)
  const items = useBoard((s) => (s.draftConnector ? s.items : null))
  const zoom = useBoard((s) => s.camera.zoom)
  const strokeD = useMemo(
    () =>
      stroke
        ? strokePath(stroke.points, stroke.size, stroke.simulatePressure, stroke.opacity < 1)
        : '',
    [stroke],
  )
  const geom = useMemo(
    () =>
      connector && items
        ? connectorGeometry({ ...connector, endArrow: 'arrow', strokeWidth: 2 }, items)
        : null,
    [connector, items],
  )
  if (!stroke && !geom) return null
  return (
    <svg
      width={1}
      height={1}
      className="absolute left-0 top-0 overflow-visible"
      style={{ pointerEvents: 'none' }}
    >
      {stroke && <path d={strokeD} fill={stroke.color} fillOpacity={stroke.opacity} />}
      {geom && (
        <>
          <path
            d={geom.d}
            fill="none"
            stroke={SELECTION_COLOR}
            strokeWidth={2 / zoom}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d={arrowHeadPath(geom.end, geom.endDir, 2)} fill={SELECTION_COLOR} />
        </>
      )}
    </svg>
  )
}

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null)
  const order = useBoard((s) => s.order)
  const camera = useBoard((s) => s.camera)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cleanup = createInteractions(el)
    const measure = () => setViewport(el.clientWidth, el.clientHeight)
    let frame = 0
    measure()
    const ro = new ResizeObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (frame) cancelAnimationFrame(frame)
      cleanup()
    }
  }, [])

  return (
    <div
      ref={ref}
      data-testid="canvas"
      className="wb-canvas absolute inset-0 overflow-hidden"
      style={gridStyle(camera)}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {order.map((id) => (
          <ItemView key={id} id={id} />
        ))}
        <Drafts />
      </div>
      <SelectionOverlay />
    </div>
  )
}
