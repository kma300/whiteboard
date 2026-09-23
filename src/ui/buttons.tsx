import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type TipSide = 'right' | 'top' | 'bottom'

const TIP_POSITION: Record<TipSide, string> = {
  right: 'left-full top-1/2 ml-2.5 -translate-y-1/2',
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
}

/**
 * Hover label with the keyboard shortcut as a key chip. Replaces the native `title` tooltip,
 * which macOS shows only after a long delay. The parent needs the `group relative` classes.
 */
export function Tip({
  label,
  shortcut,
  side = 'bottom',
}: {
  label: string
  shortcut?: string
  side?: TipSide
}) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-hover:delay-150 group-focus-visible:opacity-100 ${TIP_POSITION[side]}`}
    >
      {label}
      {shortcut && (
        <kbd className="rounded bg-white/15 px-1 font-sans text-[11px] leading-4 text-white/85">
          {shortcut}
        </kbd>
      )}
    </span>
  )
}

interface IconButtonProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  shortcut?: string
  tipSide?: TipSide
  active?: boolean
  disabled?: boolean
  size?: number
  testId?: string
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  shortcut,
  tipSide,
  active,
  disabled,
  size = 18,
  testId,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={`group relative grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-35 ${
        active
          ? 'bg-[#EAEFFF] text-[#3B6CFF]'
          : 'text-neutral-700 hover:bg-neutral-100 disabled:hover:bg-transparent'
      }`}
    >
      <Icon size={size} strokeWidth={1.9} />
      <Tip label={label} shortcut={shortcut} side={tipSide} />
    </button>
  )
}

export function Swatch({
  color,
  active,
  onClick,
  label,
  size = 22,
}: {
  color: string
  active?: boolean
  onClick: () => void
  label?: string
  size?: number
}) {
  const transparent = color === 'transparent'
  return (
    <button
      type="button"
      title={label ?? color}
      aria-label={label ?? color}
      onClick={onClick}
      className="grid place-items-center rounded-full"
      style={{
        width: size + 6,
        height: size + 6,
        boxShadow: active ? '0 0 0 2px #3B6CFF' : undefined,
      }}
    >
      <span
        className="block rounded-full border border-black/10"
        style={{
          width: size,
          height: size,
          background: transparent
            ? 'linear-gradient(135deg, #fff 45%, #F24E4E 45%, #F24E4E 55%, #fff 55%)'
            : color,
        }}
      />
    </button>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`wb-panel ${className}`}>{children}</div>
}
