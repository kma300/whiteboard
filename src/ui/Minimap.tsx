import { useDeferredValue, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Schematic } from '../canvas/Schematic'
import { expandRect, unionRects } from '../model/geometry'
import { SELECTION_COLOR } from '../model/palette'
import { contentBoundsOf, schematicMarks } from '../model/schematic'
import type { Rect } from '../model/types'
import { setCamera, useBoard } from '../store/boardStore'
import { Panel } from './buttons'

const W = 208
const H = 136

export function Minimap() {
  const items = useBoard((s) => s.items)
  const camera = useBoard((s) => s.camera)
  const viewport = useBoard((s) => s.viewport)
  const deferred = useDeferredValue(items)
  const marks = useMemo(() => schematicMarks(deferred), [deferred])
  const content = useMemo(() => contentBoundsOf(deferred), [deferred])
  const svgRef = useRef<HTMLDivElement>(null)
  // The view box is frozen while dragging so the map does not shift under the pointer.
  const [frozen, setFrozen] = useState<Rect | null>(null)

  const view: Rect = {
    x: -camera.x / camera.zoom,
    y: -camera.y / camera.zoom,
    w: viewport.w / camera.zoom,
    h: viewport.h / camera.zoom,
  }
  const live = unionRects(content ? [content, view] : [view]) ?? view
  const box = frozen ?? expandRect(live, Math.max(live.w, live.h) * 0.05)

  const centerOn = (e: ReactPointerEvent) => {
    const el = svgRef.current?.querySelector('svg')
    const ctm = el?.getScreenCTM()
    if (!ctm) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const cam = useBoard.getState().camera
    setCamera({ ...cam, x: viewport.w / 2 - p.x * cam.zoom, y: viewport.h / 2 - p.y * cam.zoom })
  }

  return (
    <Panel className="fixed bottom-16 right-3 z-20 overflow-hidden p-1">
      <div
        ref={svgRef}
        data-testid="minimap"
        className="cursor-pointer rounded-lg bg-[#F5F5F3]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setFrozen(box)
          centerOn(e)
        }}
        onPointerMove={(e) => {
          if (frozen) centerOn(e)
        }}
        onPointerUp={() => setFrozen(null)}
        onPointerCancel={() => setFrozen(null)}
      >
        <Schematic marks={marks} view={box} width={W} height={H}>
          <rect
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill="rgb(59 108 255 / 0.08)"
            stroke={SELECTION_COLOR}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            rx={4 / Math.max(W / box.w, 1e-6)}
          />
        </Schematic>
      </div>
    </Panel>
  )
}
