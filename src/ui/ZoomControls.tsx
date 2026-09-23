import { Maximize, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBoard, zoomBy, zoomTo, zoomToFit } from '../store/boardStore'
import { IconButton, Panel, Tip } from './buttons'

export function ZoomControls({ children }: { children?: ReactNode }) {
  const zoom = useBoard((s) => s.camera.zoom)
  return (
    <Panel className="fixed bottom-3 right-3 z-20 flex items-center gap-0.5 p-1">
      {children}
      <IconButton
        icon={Minus}
        label="Zoom out"
        shortcut="⌘-"
        tipSide="top"
        onClick={() => zoomBy(1 / 1.25)}
      />
      <button
        type="button"
        aria-label="Zoom to 100%"
        onClick={() => zoomTo(1)}
        data-testid="zoom-level"
        className="group relative h-9 w-14 rounded-lg text-xs font-medium tabular-nums text-neutral-700 hover:bg-neutral-100"
      >
        {Math.round(zoom * 100)}%
        <Tip label="Zoom to 100%" shortcut="⌘0" side="top" />
      </button>
      <IconButton
        icon={Plus}
        label="Zoom in"
        shortcut="⌘+"
        tipSide="top"
        onClick={() => zoomBy(1.25)}
      />
      <IconButton
        icon={Maximize}
        label="Fit to screen"
        shortcut="⇧1"
        tipSide="top"
        onClick={zoomToFit}
      />
    </Panel>
  )
}
