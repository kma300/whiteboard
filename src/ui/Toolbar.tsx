import {
  Eraser,
  Frame,
  Hand,
  Highlighter,
  Image,
  MousePointer2,
  Pen,
  Redo2,
  Spline,
  StickyNote,
  Type,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { insertImages } from '../canvas/images'
import { HIGHLIGHTER_COLORS, PEN_COLORS, PEN_SIZES, STICKY_COLORS } from '../model/palette'
import { shapePath } from '../model/shapes'
import type { ShapeKind, Tool } from '../model/types'
import {
  redo,
  setTool,
  setToolOptions,
  undo,
  useBoard,
  viewportCenterWorld,
} from '../store/boardStore'
import { IconButton, Panel, Swatch } from './buttons'
import { CONNECTOR_STYLES, SHAPES } from './options'

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

interface ToolDef {
  tool: Tool
  label: string
  icon: LucideIcon | 'shape'
}

const TOOLS: ToolDef[] = [
  { tool: 'select', label: 'Select (V)', icon: MousePointer2 },
  { tool: 'hand', label: 'Hand (H)', icon: Hand },
  { tool: 'sticky', label: 'Sticky note (N)', icon: StickyNote },
  { tool: 'text', label: 'Text (T)', icon: Type },
  { tool: 'shape', label: 'Shape (S)', icon: 'shape' },
  { tool: 'connector', label: 'Connection line (L)', icon: Spline },
  { tool: 'pen', label: 'Pen (P)', icon: Pen },
  { tool: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { tool: 'eraser', label: 'Eraser (E)', icon: Eraser },
  { tool: 'frame', label: 'Frame (F)', icon: Frame },
]

export function OptionButton({
  active,
  label,
  onClick,
  children,
  testId,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-lg ${
        active ? 'bg-[#EAEFFF] text-[#3B6CFF]' : 'text-neutral-700 hover:bg-neutral-100'
      }`}
    >
      {children}
    </button>
  )
}

function ToolOptions({ tool }: { tool: Tool }) {
  const opts = useBoard((s) => s.toolOptions)
  switch (tool) {
    case 'sticky':
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
    case 'shape':
      return (
        <Panel className="grid grid-cols-3 gap-0.5 p-1">
          {SHAPES.map((s) => (
            <OptionButton
              key={s.kind}
              label={s.label}
              active={opts.shape === s.kind}
              onClick={() => setToolOptions({ shape: s.kind })}
            >
              <ShapeIcon kind={s.kind} />
            </OptionButton>
          ))}
        </Panel>
      )
    case 'connector':
      return (
        <Panel className="flex gap-0.5 p-1">
          {CONNECTOR_STYLES.map(({ style, label, icon: Icon }) => (
            <OptionButton
              key={style}
              label={label}
              active={opts.connectorStyle === style}
              onClick={() => setToolOptions({ connectorStyle: style })}
            >
              <Icon size={18} strokeWidth={1.9} />
            </OptionButton>
          ))}
        </Panel>
      )
    case 'pen':
      return (
        <Panel className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-3 gap-1">
            {PEN_COLORS.map((c) => (
              <Swatch
                key={c}
                color={c}
                active={opts.penColor === c}
                onClick={() => setToolOptions({ penColor: c })}
              />
            ))}
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-1">
            {PEN_SIZES.map((size) => (
              <OptionButton
                key={size}
                label={`Thickness ${size}`}
                active={opts.penSize === size}
                onClick={() => setToolOptions({ penSize: size })}
              >
                <span
                  className="block rounded-full bg-current"
                  style={{ width: size + 3, height: size + 3 }}
                />
              </OptionButton>
            ))}
          </div>
        </Panel>
      )
    case 'highlighter':
      return (
        <Panel className="grid grid-cols-2 gap-1 p-2">
          {HIGHLIGHTER_COLORS.map((c) => (
            <Swatch
              key={c}
              color={c}
              active={opts.highlighterColor === c}
              onClick={() => setToolOptions({ highlighterColor: c })}
            />
          ))}
        </Panel>
      )
    default:
      return null
  }
}

function ShapeToolIcon() {
  const kind = useBoard((s) => s.toolOptions.shape)
  return <ShapeIcon kind={kind} />
}

export function Toolbar() {
  const tool = useBoard((s) => s.tool)
  const canUndo = useBoard((s) => s.undoStack.length > 0)
  const canRedo = useBoard((s) => s.redoStack.length > 0)
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <div className="fixed left-3 top-1/2 z-20 flex -translate-y-1/2 items-start gap-2">
      <Panel className="flex flex-col gap-0.5 p-1">
        {TOOLS.map((t) =>
          t.icon === 'shape' ? (
            <OptionButton
              key={t.tool}
              label={t.label}
              active={tool === t.tool}
              testId={`tool-${t.tool}`}
              onClick={() => setTool(t.tool)}
            >
              <ShapeToolIcon />
            </OptionButton>
          ) : (
            <IconButton
              key={t.tool}
              icon={t.icon}
              label={t.label}
              active={tool === t.tool}
              testId={`tool-${t.tool}`}
              onClick={() => setTool(t.tool)}
            />
          ),
        )}
        <IconButton
          icon={Image}
          label="Upload image"
          testId="tool-image"
          onClick={() => fileInput.current?.click()}
        />
        <div className="mx-1.5 my-1 h-px bg-neutral-200" />
        <IconButton icon={Undo2} label="Undo (⌘Z)" disabled={!canUndo} onClick={undo} />
        <IconButton icon={Redo2} label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo} />
      </Panel>
      <ToolOptions tool={tool} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="image-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          void insertImages(files, viewportCenterWorld())
        }}
      />
    </div>
  )
}
