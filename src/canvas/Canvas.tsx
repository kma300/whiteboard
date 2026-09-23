import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { CANVAS_BG } from '../model/palette'
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

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null)
  const order = useBoard((s) => s.order)
  const camera = useBoard((s) => s.camera)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cleanup = createInteractions(el)
    const ro = new ResizeObserver(() => setViewport(el.clientWidth, el.clientHeight))
    ro.observe(el)
    return () => {
      ro.disconnect()
      cleanup()
    }
  }, [])

  return (
    <div ref={ref} className="wb-canvas absolute inset-0 overflow-hidden" style={gridStyle(camera)}>
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
      </div>
      <SelectionOverlay />
    </div>
  )
}
