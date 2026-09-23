import { Hand, MousePointer2, Redo2, StickyNote, Type, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { shapePath } from '../model/shapes'
import { STICKY_COLORS } from '../model/palette'
import type { ShapeKind, Tool } from '../model/types'
import { redo, setTool, setToolOptions, undo, useBoard } from '../store/boardStore'
import { IconButton, Panel, Swatch } from './buttons'

const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'roundRect', label: 'Rounded rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'star', label: 'Star' },
]

export function ShapeIcon({ kind, size = 18 }: { kind: ShapeKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path
        d={shapePath(kind, 2, 2, 16, 16)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShapeToolIcon() {
  const kind = useBoard((s) => s.toolOptions.shape)
  return <ShapeIcon kind={kind} />
}

interface ToolDef {
  tool: Tool
  label: string
  icon: LucideIcon | null
}

const TOOLS: ToolDef[] = [
  { tool: 'select', label: 'Select (V)', icon: MousePointer2 },
  { tool: 'hand', label: 'Hand (H)', icon: Hand },
  { tool: 'sticky', label: 'Sticky note (N)', icon: StickyNote },
  { tool: 'text', label: 'Text (T)', icon: Type },
  { tool: 'shape', label: 'Shape (S)', icon: null },
]

function ToolOptions({ tool }: { tool: Tool }) {
  const opts = useBoard((s) => s.toolOptions)
  if (tool === 'sticky') {
    return (
      <Panel className="grid grid-cols-4 gap-1 p-2">
        {STICKY_COLORS.map((c) => (
          <Swatch
            key={c.value}
            color={c.value}
            label={c.name}
            active={opts.stickyFill === c.value}
            onClick={() => setToolOptions({ stickyFill: c.value })}
          />
        ))}
      </Panel>
    )
  }
  if (tool === 'shape') {
    return (
      <Panel className="grid grid-cols-3 gap-0.5 p-1">
        {SHAPES.map((s) => (
          <button
            key={s.kind}
            type="button"
            title={s.label}
            aria-label={s.label}
            onClick={() => setToolOptions({ shape: s.kind })}
            className={`grid h-9 w-9 place-items-center rounded-lg ${
              opts.shape === s.kind
                ? 'bg-[#EAEFFF] text-[#3B6CFF]'
                : 'text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            <ShapeIcon kind={s.kind} />
          </button>
        ))}
      </Panel>
    )
  }
  return null
}

export function Toolbar() {
  const tool = useBoard((s) => s.tool)
  const canUndo = useBoard((s) => s.undoStack.length > 0)
  const canRedo = useBoard((s) => s.redoStack.length > 0)
  return (
    <div className="fixed left-3 top-1/2 z-20 flex -translate-y-1/2 items-start gap-2">
      <Panel className="flex flex-col gap-0.5 p-1">
        {TOOLS.map((t) =>
          t.icon ? (
            <IconButton
              key={t.tool}
              icon={t.icon}
              label={t.label}
              active={tool === t.tool}
              testId={`tool-${t.tool}`}
              onClick={() => setTool(t.tool)}
            />
          ) : (
            <button
              key={t.tool}
              type="button"
              title={t.label}
              aria-label={t.label}
              aria-pressed={tool === t.tool}
              data-testid={`tool-${t.tool}`}
              onClick={() => setTool(t.tool)}
              className={`grid h-9 w-9 place-items-center rounded-lg ${
                tool === t.tool
                  ? 'bg-[#EAEFFF] text-[#3B6CFF]'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <ShapeToolIcon />
            </button>
          ),
        )}
        <div className="mx-1.5 my-1 h-px bg-neutral-200" />
        <IconButton icon={Undo2} label="Undo (⌘Z)" disabled={!canUndo} onClick={undo} />
        <IconButton icon={Redo2} label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo} />
      </Panel>
      <ToolOptions tool={tool} />
    </div>
  )
}
