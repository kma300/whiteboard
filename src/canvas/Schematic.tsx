import type { ReactNode } from 'react'
import type { SchematicMark } from '../model/schematic'
import type { Rect } from '../model/types'

/** Renders schematic marks inside an SVG whose viewBox is `view` (world units). */
export function Schematic({
  marks,
  view,
  width,
  height,
  children,
}: {
  marks: SchematicMark[]
  view: Rect
  width: number | string
  height: number | string
  children?: ReactNode
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {marks.map((m, i) => (
        <path
          key={i}
          d={m.d}
          fill={m.fill}
          stroke={m.stroke}
          strokeWidth={m.strokeWidth}
          opacity={m.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {children}
    </svg>
  )
}
