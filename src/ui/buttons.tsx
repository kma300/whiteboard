import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface IconButtonProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  size?: number
  testId?: string
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  size = 18,
  testId,
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-35 ${
        active
          ? 'bg-[#EAEFFF] text-[#3B6CFF]'
          : 'text-neutral-700 hover:bg-neutral-100 disabled:hover:bg-transparent'
      }`}
    >
      <Icon size={size} strokeWidth={1.9} />
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
