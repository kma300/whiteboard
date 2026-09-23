import { Maximize, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBoard, zoomBy, zoomTo, zoomToFit } from '../store/boardStore'
import { IconButton, Panel } from './buttons'

export function ZoomControls({ children }: { children?: ReactNode }) {
  const zoom = useBoard((s) => s.camera.zoom)
  return (
    <Panel className="fixed bottom-3 right-3 z-20 flex items-center gap-0.5 p-1">
      {children}
      <IconButton icon={Minus} label="Zoom out (⌘-)" onClick={() => zoomBy(1 / 1.25)} />
      <button
        type="button"
        title="Zoom to 100% (⌘0)"
        onClick={() => zoomTo(1)}
        data-testid="zoom-level"
        className="h-9 w-14 rounded-lg text-xs font-medium tabular-nums text-neutral-700 hover:bg-neutral-100"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton icon={Plus} label="Zoom in (⌘+)" onClick={() => zoomBy(1.25)} />
      <IconButton icon={Maximize} label="Fit to screen (⇧1)" onClick={zoomToFit} />
    </Panel>
  )
}
