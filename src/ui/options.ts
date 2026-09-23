import { CornerDownRight, Slash, Spline } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ConnectorStyle, ShapeKind } from '../model/types'

export const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'roundRect', label: 'Rounded rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'star', label: 'Star' },
]

export const CONNECTOR_STYLES: { style: ConnectorStyle; label: string; icon: LucideIcon }[] = [
  { style: 'straight', label: 'Straight line', icon: Slash },
  { style: 'elbow', label: 'Elbow line', icon: CornerDownRight },
  { style: 'curved', label: 'Curved line', icon: Spline },
]
