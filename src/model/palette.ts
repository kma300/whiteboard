export const SELECTION_COLOR = '#3B6CFF'
export const CANVAS_BG = '#F5F5F3'

export const STICKY_COLORS = [
  { name: 'Yellow', value: '#FFF3A3' },
  { name: 'Orange', value: '#FFD6A8' },
  { name: 'Pink', value: '#FFC6DE' },
  { name: 'Violet', value: '#DDCBFF' },
  { name: 'Blue', value: '#BCDDFF' },
  { name: 'Cyan', value: '#B7EEE9' },
  { name: 'Green', value: '#CDEFB6' },
  { name: 'Gray', value: '#E7E7E4' },
] as const

export const FILL_COLORS = [
  'transparent',
  '#FFFFFF',
  ...STICKY_COLORS.map((c) => c.value),
  '#3B6CFF',
  '#F24E4E',
  '#1F1F1F',
] as const

export const INK_COLORS = [
  '#1F1F1F',
  '#6B6B6B',
  '#3B6CFF',
  '#F24E4E',
  '#12A150',
  '#F59E0B',
  '#8B5CF6',
  '#FFFFFF',
] as const

export const PEN_COLORS = [
  '#1F1F1F',
  '#3B6CFF',
  '#F24E4E',
  '#12A150',
  '#F59E0B',
  '#8B5CF6',
] as const
export const HIGHLIGHTER_COLORS = ['#FFE45C', '#7CF29A', '#6EC6FF', '#FF8AD8'] as const
export const PEN_SIZES = [2, 4, 8] as const
export const HIGHLIGHTER_SIZE = 20
export const FONT_SIZES = [12, 14, 18, 24, 32, 48, 64, 96] as const

export const STICKY_SIZE = 200
export const DEFAULT_SHAPE_SIZE = 160
export const DEFAULT_FRAME = { w: 800, h: 560 }
