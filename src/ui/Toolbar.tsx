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
import { displayKey, useShortcuts } from '../store/shortcuts'
import type { ShortcutMap } from '../store/shortcuts'
import { IconButton, Panel, Swatch, Tip } from './buttons'
import type { TipSide } from './buttons'
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
  { tool: 'select', label: 'Select', icon: MousePointer2 },
  { tool: 'hand', label: 'Hand', icon: Hand },
  { tool: 'sticky', label: 'Sticky note', icon: StickyNote },
  { tool: 'text', label: 'Text', icon: Type },
  { tool: 'shape', label: 'Shape', icon: 'shape' },
  { tool: 'connector', label: 'Connection line', icon: Spline },
  { tool: 'pen', label: 'Pen', icon: Pen },
  { tool: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { tool: 'eraser', label: 'Eraser', icon: Eraser },
  { tool: 'frame', label: 'Frame', icon: Frame },
]

export function OptionButton({
  active,
  label,
  onClick,
  children,
  shortcut,
  tipSide,
  testId,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: ReactNode
  shortcut?: string
  tipSide?: TipSide
  testId?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      className={`group relative grid h-9 w-9 place-items-center rounded-lg ${
        active ? 'bg-[#EAEFFF] text-[#3B6CFF]' : 'text-neutral-700 hover:bg-neutral-100'
      }`}
    >
      {children}
      <Tip label={label} shortcut={shortcut} side={tipSide} />
    </button>
  )
}

/** Shortcut shown for a shape kind: its own key, if the user gave it one. */
const shapeKey = (map: ShortcutMap, kind: ShapeKind) =>
  displayKey(kind === 'rect' ? map.rect : kind === 'ellipse' ? map.ellipse : null) ?? undefined

function ToolOptions({ tool }: { tool: Tool }) {
  const opts = useBoard((s) => s.toolOptions)
  const keys = useShortcuts((s) => s.map)
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
              shortcut={shapeKey(keys, s.kind)}
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
  const shapeKind = useBoard((s) => s.toolOptions.shape)
  const keys = useShortcuts((s) => s.map)
  const shapeTip = {
    label: SHAPES.find((s) => s.kind === shapeKind)?.label ?? 'Shape',
    shortcut: shapeKey(keys, shapeKind) ?? displayKey(keys.shape) ?? undefined,
  }

  return (
    <div className="fixed left-3 top-1/2 z-20 flex -translate-y-1/2 items-start gap-2">
      <Panel className="flex flex-col gap-0.5 p-1">
        {TOOLS.map((t) =>
          t.icon === 'shape' ? (
            <OptionButton
              key={t.tool}
              label={shapeTip.label}
              shortcut={shapeTip.shortcut}
              tipSide="right"
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
              shortcut={displayKey(keys[t.tool]) ?? undefined}
              tipSide="right"
              active={tool === t.tool}
              testId={`tool-${t.tool}`}
              onClick={() => setTool(t.tool)}
            />
          ),
        )}
        <IconButton
          icon={Image}
          label="Upload image"
          shortcut={displayKey(keys.image) ?? undefined}
          tipSide="right"
          testId="tool-image"
          onClick={() => fileInput.current?.click()}
        />
        <div className="mx-1.5 my-1 h-px bg-neutral-200" />
        <IconButton
          icon={Undo2}
          label="Undo"
          shortcut="⌘Z"
          tipSide="right"
          disabled={!canUndo}
          onClick={undo}
        />
        <IconButton
          icon={Redo2}
          label="Redo"
          shortcut="⇧⌘Z"
          tipSide="right"
          disabled={!canRedo}
          onClick={redo}
        />
      </Panel>
      <ToolOptions tool={tool} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        id="wb-image-input"
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
