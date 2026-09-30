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
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { itemBounds } from '../model/connectors'
import { toScreenRect, unionRects } from '../model/geometry'
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
import { FLOATING_EDGE, TOOLBAR_LEFT, popoverPosition, toolbarPosition } from './floatingLayout'
import { CONNECTOR_STYLES, SHAPES } from './options'
import { OptionButton, ShapeIcon } from './Toolbar'

const FRAME_FILLS = ['#FFFFFF', '#F5F5F3', ...STICKY_COLORS.map((c) => c.value), 'transparent']
const BORDER_WIDTHS = [0, 1, 2, 4, 6]
const LINE_WIDTHS = [1, 2, 3, 4, 6]
const NEXT_ALIGN: Record<TextAlign, TextAlign> = { left: 'center', center: 'right', right: 'left' }
const ALIGN_ICON = { left: TextAlignStart, center: TextAlignCenter, right: TextAlignEnd }
const CONTROL_GROUP = 'flex items-center gap-0.5 *:shrink-0'

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
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchorRef} className="relative">
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
        <Popover anchorRef={anchorRef} onClose={() => setOpen(null)}>
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

/**
 * Menus have their own layer so a narrow or wrapped toolbar cannot squeeze them or clip them.
 */
function Popover({
  children,
  anchorRef,
  onClose,
}: {
  children: ReactNode
  anchorRef: RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const update = useCallback(() => {
    const anchor = anchorRef.current
    const menu = ref.current
    if (!anchor || !menu) return
    const a = anchor.getBoundingClientRect()
    const r = menu.getBoundingClientRect()
    const toolbar = anchor.closest('[data-testid="context-toolbar"]')
    const next = popoverPosition(
      { x: a.left, y: a.top, w: a.width, h: a.height },
      { w: r.width, h: r.height },
      { w: window.innerWidth, h: window.innerHeight },
      toolbar?.getAttribute('data-placement') === 'above' ? 'above' : 'below',
    )
    setPosition((previous) => (previous?.x === next.x && previous.y === next.y ? previous : next))
  }, [anchorRef])

  useLayoutEffect(update)
  useLayoutEffect(() => {
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }
    const observer = new ResizeObserver(schedule)
    if (ref.current) observer.observe(ref.current)
    if (anchorRef.current) observer.observe(anchorRef.current)
    const toolbar = anchorRef.current?.closest('[data-testid="context-toolbar"]')
    if (toolbar) observer.observe(toolbar)
    window.addEventListener('resize', schedule)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
    }
  }, [anchorRef, update])
  useLayoutEffect(() => {
    const pointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !anchorRef.current?.contains(target)) onClose()
    }
    const keyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
      anchorRef.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('keydown', keyDown, true)
    return () => {
      document.removeEventListener('pointerdown', pointerDown, true)
      document.removeEventListener('keydown', keyDown, true)
    }
  }, [anchorRef, onClose])

  return createPortal(
    <div
      ref={ref}
      data-testid="context-menu"
      className="wb-panel fixed z-40 w-max overflow-y-auto p-2"
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        maxWidth: `calc(100vw - ${FLOATING_EDGE * 2}px)`,
        maxHeight: `calc(100vh - ${FLOATING_EDGE * 2}px)`,
        visibility: position ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
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
  const ref = useRef<HTMLDivElement>(null)
  const shapeRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [obstacles, setObstacles] = useState<Rect[]>([])

  const measureObstacles = useCallback(() => {
    if (!ref.current) return
    const next = [...document.querySelectorAll<HTMLElement>('.wb-panel.fixed')]
      .filter((el) => !el.closest('[data-testid="context-toolbar"], [data-testid="context-menu"]'))
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      })
    setObstacles((previous) =>
      previous.length === next.length &&
      previous.every(
        (r, i) => r.x === next[i].x && r.y === next[i].y && r.w === next[i].w && r.h === next[i].h,
      )
        ? previous
        : next,
    )
  }, [])
  useLayoutEffect(measureObstacles)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setSize((previous) =>
        previous.w === r.width && previous.h === r.height ? previous : { w: r.width, h: r.height },
      )
    }
    update()
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        update()
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

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

  const position = toolbarPosition(box, size, viewport, obstacles)
  const firstTextual = textual[0]
  const align = firstTextual?.align ?? 'center'
  const AlignIcon = ALIGN_ICON[align]
  const firstShape = shapes[0]
  const firstConnector = connectors[0]

  return (
    <div
      ref={ref}
      data-testid="context-toolbar"
      data-placement={position.placement}
      className="wb-panel fixed z-30 flex w-max flex-wrap items-center gap-x-0.5 gap-y-1 px-1 py-1 *:shrink-0"
      style={{
        left: position.x,
        top: position.y,
        maxWidth: Math.max(0, viewport.w - TOOLBAR_LEFT - FLOATING_EDGE),
        visibility: size.w ? 'visible' : 'hidden',
      }}
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
        <div className={CONTROL_GROUP}>
          <div ref={shapeRef} className="relative">
            <OptionButton
              label="Shape"
              tipSide="top"
              active={open === 'shape'}
              onClick={() => setOpenState(open === 'shape' ? null : 'shape')}
            >
              <ShapeIcon kind={firstShape.shape} />
            </OptionButton>
            {open === 'shape' && (
              <Popover anchorRef={shapeRef} onClose={() => setOpenState(null)}>
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
        </div>
      )}

      {frames.length > 0 && colorMenu('frame', 'Frame color', frames[0].fill, FRAME_FILLS)}

      {textual.length > 0 && (
        <div className={CONTROL_GROUP}>
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
        </div>
      )}

      {firstConnector && (
        <div className={CONTROL_GROUP}>
          {textual.length > 0 && <Divider />}
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
        </div>
      )}

      {strokes.length > 0 &&
        colorMenu('stroke', 'Pen color', strokes[0].color, [...PEN_COLORS, ...HIGHLIGHTER_COLORS])}

      <div className={CONTROL_GROUP}>
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
    </div>
  )
}
