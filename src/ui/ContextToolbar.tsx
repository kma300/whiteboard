import {
  Bold,
  BringToFront,
  Copy,
  Group,
  Lock,
  LockOpen,
  MoveLeft,
  MoveRight,
  SendToBack,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash,
  Ungroup,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { itemBounds } from '../model/connectors'
import { clamp, toScreenRect, unionRects } from '../model/geometry'
import {
  FILL_COLORS,
  FONT_SIZES,
  HIGHLIGHTER_COLORS,
  INK_COLORS,
  PEN_COLORS,
  STICKY_COLORS,
} from '../model/palette'
import type { Item, Rect, TextAlign } from '../model/types'
import { updateSelection, useBoard } from '../store/boardStore'
import { runCommand } from '../store/commands'
import { IconButton, Swatch, Tip } from './buttons'
import { CONNECTOR_STYLES, SHAPES } from './options'
import { OptionButton, ShapeIcon } from './Toolbar'

const FRAME_FILLS = ['#FFFFFF', '#F5F5F3', ...STICKY_COLORS.map((c) => c.value), 'transparent']
const BORDER_WIDTHS = [0, 1, 2, 4, 6]
const LINE_WIDTHS = [1, 2, 3, 4, 6]
const NEXT_ALIGN: Record<TextAlign, TextAlign> = { left: 'center', center: 'right', right: 'left' }
const ALIGN_ICON = { left: TextAlignStart, center: TextAlignCenter, right: TextAlignEnd }

function Divider() {
  return <div className="mx-0.5 h-6 w-px bg-neutral-200" />
}

function ColorMenu({
  id,
  open,
  setOpen,
  label,
  value,
  colors,
  ring,
  onPick,
}: {
  id: string
  open: string | null
  setOpen: (id: string | null) => void
  label: string
  value: string
  colors: readonly string[]
  ring?: boolean
  onPick: (color: string) => void
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(open === id ? null : id)}
        className="group relative grid h-9 w-9 place-items-center rounded-lg hover:bg-neutral-100"
      >
        <span
          className="block h-5 w-5 rounded-full"
          style={
            ring
              ? { border: `3px solid ${value}`, boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.1)' }
              : {
                  background:
                    value === 'transparent'
                      ? 'linear-gradient(135deg, #fff 45%, #F24E4E 45%, #F24E4E 55%, #fff 55%)'
                      : value,
                  boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.12)',
                }
          }
        />
        <Tip label={label} side="top" />
      </button>
      {open === id && (
        <Popover>
          <div className="grid grid-cols-5 gap-1">
            {colors.map((c) => (
              <Swatch
                key={c}
                color={c}
                active={c === value}
                onClick={() => {
                  setOpen(null)
                  onPick(c)
                }}
              />
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

const EDGE_GAP = 8

/**
 * Menu centered under a toolbar button. It sizes to its content, since the button it hangs from
 * is narrower than the menu, and shifts sideways to stay inside the window.
 */
function Popover({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    if (r.left < EDGE_GAP) setShift(EDGE_GAP - r.left)
    else if (r.right > window.innerWidth - EDGE_GAP)
      setShift(window.innerWidth - EDGE_GAP - r.right)
  }, [])
  return (
    <div
      ref={ref}
      className="wb-panel absolute left-1/2 top-full z-10 mt-2 w-max p-2"
      style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
    >
      {children}
    </div>
  )
}

function NumberSelect({
  label,
  value,
  options,
  onChange,
  format = (v: number) => String(v),
}: {
  label: string
  value: number
  options: readonly number[]
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b)
  return (
    <select
      title={label}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 rounded-md border border-neutral-200 bg-white px-1.5 text-xs tabular-nums text-neutral-700 outline-none hover:border-neutral-300"
    >
      {all.map((v) => (
        <option key={v} value={v}>
          {format(v)}
        </option>
      ))}
    </select>
  )
}

/** Applies `fn` to selected items of one type, leaving the others untouched. */
function updateType<T extends Item['type']>(
  type: T,
  fn: (item: Extract<Item, { type: T }>) => Extract<Item, { type: T }>,
) {
  updateSelection((it) => (it.type === type ? fn(it as Extract<Item, { type: T }>) : it))
}

export function ContextToolbar() {
  const selection = useBoard((s) => s.selection)
  const interacting = useBoard((s) => s.interacting)
  if (!selection.length || interacting) return null
  // Remount per selection so any open menu closes when the selection changes.
  return <ContextToolbarBody key={selection.join(',')} />
}

function ContextToolbarBody() {
  const selection = useBoard((s) => s.selection)
  const items = useBoard((s) => s.items)
  const camera = useBoard((s) => s.camera)
  const viewport = useBoard((s) => s.viewport)
  const [open, setOpenState] = useState<string | null>(null)

  const selected = selection.map((id) => items[id]).filter(Boolean)
  const bounds = unionRects(
    selected.map((it) => itemBounds(it, items)).filter((r): r is Rect => r !== null),
  )
  if (!bounds || !selected.length) return null
  const box = toScreenRect(bounds, camera)

  const stickies = selected.filter((it) => it.type === 'sticky')
  const shapes = selected.filter((it) => it.type === 'shape')
  const texts = selected.filter((it) => it.type === 'text')
  const frames = selected.filter((it) => it.type === 'frame')
  const connectors = selected.filter((it) => it.type === 'connector')
  const strokes = selected.filter((it) => it.type === 'stroke')
  const textual = [...stickies, ...shapes, ...texts]
  const sized = [...shapes, ...texts]
  const inked = [...shapes, ...texts]
  const grouped = selected.some((it) => it.groupId)
  const allLocked = selected.every((it) => it.locked)

  // Routes a color picked in a menu to the matching property of the selected items.
  const pick = (menu: string) => (c: string) => {
    switch (menu) {
      case 'sticky':
        return updateType('sticky', (it) => ({ ...it, fill: c }))
      case 'fill':
        return updateType('shape', (it) => ({ ...it, fill: c }))
      case 'border':
        return updateType('shape', (it) => ({ ...it, stroke: c }))
      case 'frame':
        return updateType('frame', (it) => ({ ...it, fill: c }))
      case 'ink':
        updateType('text', (it) => ({ ...it, color: c }))
        return updateType('shape', (it) => ({ ...it, color: c }))
      case 'line':
        return updateType('connector', (it) => ({ ...it, stroke: c }))
      case 'stroke':
        return updateType('stroke', (it) => ({ ...it, color: c }))
    }
  }

  const colorMenu = (
    menu: string,
    label: string,
    value: string,
    colors: readonly string[],
    ring = false,
  ) => (
    <ColorMenu
      id={menu}
      open={open}
      setOpen={setOpenState}
      label={label}
      value={value}
      colors={colors}
      ring={ring}
      onPick={pick(menu)}
    />
  )

  // Sit clear of the connection dots, which float 16px outside the selection.
  const top = box.y - 76 < 64 ? box.y + box.h + 32 : box.y - 76
  const left = clamp(box.x + box.w / 2, 220, Math.max(220, viewport.w - 220))
  const firstTextual = textual[0]
  const align = firstTextual?.align ?? 'center'
  const AlignIcon = ALIGN_ICON[align]
  const firstShape = shapes[0]
  const firstConnector = connectors[0]

  return (
    <div
      data-testid="context-toolbar"
      className="wb-panel fixed z-30 flex -translate-x-1/2 items-center gap-0.5 px-1 py-1"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {stickies.length > 0 &&
        colorMenu(
          'sticky',
          'Sticky color',
          stickies[0].fill,
          STICKY_COLORS.map((c) => c.value),
        )}

      {firstShape && (
        <>
          <div className="relative">
            <OptionButton
              label="Shape"
              tipSide="top"
              active={open === 'shape'}
              onClick={() => setOpenState(open === 'shape' ? null : 'shape')}
            >
              <ShapeIcon kind={firstShape.shape} />
            </OptionButton>
            {open === 'shape' && (
              <Popover>
                <div className="grid grid-cols-3 gap-0.5">
                  {SHAPES.map((s) => (
                    <OptionButton
                      key={s.kind}
                      label={s.label}
                      active={firstShape.shape === s.kind}
                      onClick={() => {
                        setOpenState(null)
                        updateType('shape', (it) => ({ ...it, shape: s.kind }))
                      }}
                    >
                      <ShapeIcon kind={s.kind} />
                    </OptionButton>
                  ))}
                </div>
              </Popover>
            )}
          </div>
          {colorMenu('fill', 'Fill color', firstShape.fill, FILL_COLORS)}
          {colorMenu('border', 'Border color', firstShape.stroke, INK_COLORS, true)}
          <NumberSelect
            label="Border width"
            value={firstShape.strokeWidth}
            options={BORDER_WIDTHS}
            format={(v) => (v === 0 ? 'No border' : `${v}px`)}
            onChange={(v) => updateType('shape', (it) => ({ ...it, strokeWidth: v }))}
          />
        </>
      )}

      {frames.length > 0 && colorMenu('frame', 'Frame color', frames[0].fill, FRAME_FILLS)}

      {textual.length > 0 && (
        <>
          {(stickies.length > 0 || firstShape || frames.length > 0) && <Divider />}
          {sized.length > 0 && (
            <NumberSelect
              label="Font size"
              value={sized[0].fontSize}
              options={FONT_SIZES}
              onChange={(v) => {
                updateType('text', (it) => ({ ...it, fontSize: v }))
                updateType('shape', (it) => ({ ...it, fontSize: v }))
              }}
            />
          )}
          <IconButton
            tipSide="top"
            icon={Bold}
            label="Bold"
            active={textual.every((it) => it.bold)}
            onClick={() => {
              const bold = !textual.every((it) => it.bold)
              updateSelection((it) =>
                it.type === 'sticky' || it.type === 'text' || it.type === 'shape'
                  ? { ...it, bold: bold || undefined }
                  : it,
              )
            }}
          />
          <IconButton
            tipSide="top"
            icon={AlignIcon}
            label="Text alignment"
            onClick={() => {
              const next = NEXT_ALIGN[align]
              updateSelection((it) =>
                it.type === 'sticky' || it.type === 'text' || it.type === 'shape'
                  ? { ...it, align: next }
                  : it,
              )
            }}
          />
          {inked.length > 0 && colorMenu('ink', 'Text color', inked[0].color, INK_COLORS)}
        </>
      )}

      {firstConnector && (
        <>
          {CONNECTOR_STYLES.map(({ style, label, icon }) => (
            <IconButton
              tipSide="top"
              key={style}
              icon={icon}
              label={label}
              active={connectors.every((c) => c.style === style)}
              onClick={() => updateType('connector', (it) => ({ ...it, style }))}
            />
          ))}
          <IconButton
            tipSide="top"
            icon={MoveLeft}
            label="Start arrow"
            active={connectors.every((c) => c.startArrow === 'arrow')}
            onClick={() => {
              const on = !connectors.every((c) => c.startArrow === 'arrow')
              updateType('connector', (it) => ({ ...it, startArrow: on ? 'arrow' : 'none' }))
            }}
          />
          <IconButton
            tipSide="top"
            icon={MoveRight}
            label="End arrow"
            active={connectors.every((c) => c.endArrow === 'arrow')}
            onClick={() => {
              const on = !connectors.every((c) => c.endArrow === 'arrow')
              updateType('connector', (it) => ({ ...it, endArrow: on ? 'arrow' : 'none' }))
            }}
          />
          {colorMenu('line', 'Line color', firstConnector.stroke, INK_COLORS)}
          <NumberSelect
            label="Line width"
            value={firstConnector.strokeWidth}
            options={LINE_WIDTHS}
            format={(v) => `${v}px`}
            onChange={(v) => updateType('connector', (it) => ({ ...it, strokeWidth: v }))}
          />
        </>
      )}

      {strokes.length > 0 &&
        colorMenu('stroke', 'Pen color', strokes[0].color, [...PEN_COLORS, ...HIGHLIGHTER_COLORS])}

      <Divider />
      {selected.length > 1 && !grouped && (
        <IconButton
          tipSide="top"
          icon={Group}
          label="Group"
          shortcut="⌘G"
          onClick={() => runCommand('group')}
        />
      )}
      {grouped && (
        <IconButton
          tipSide="top"
          icon={Ungroup}
          label="Ungroup"
          shortcut="⇧⌘G"
          onClick={() => runCommand('ungroup')}
        />
      )}
      <IconButton
        tipSide="top"
        icon={BringToFront}
        label="Bring to front"
        shortcut="⌘]"
        onClick={() => runCommand('bringToFront')}
      />
      <IconButton
        tipSide="top"
        icon={SendToBack}
        label="Send to back"
        shortcut="⌘["
        onClick={() => runCommand('sendToBack')}
      />
      <IconButton
        tipSide="top"
        icon={allLocked ? LockOpen : Lock}
        label={allLocked ? 'Unlock' : 'Lock'}
        shortcut="⇧⌘L"
        onClick={() => runCommand('toggleLock')}
      />
      <IconButton
        tipSide="top"
        icon={Copy}
        label="Duplicate"
        shortcut="⌘D"
        testId="ctx-duplicate"
        onClick={() => runCommand('duplicate')}
      />
      <IconButton
        tipSide="top"
        icon={Trash}
        label="Delete"
        shortcut="⌫"
        testId="ctx-delete"
        disabled={allLocked}
        onClick={() => runCommand('delete')}
      />
    </div>
  )
}
