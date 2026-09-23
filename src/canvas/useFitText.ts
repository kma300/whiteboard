import { useMemo } from 'react'

export const TEXT_LINE_HEIGHT = 1.25
const MIN_FONT = 6
const cache = new Map<string, number>()
let measurer: HTMLDivElement | null = null

function getMeasurer(): HTMLDivElement {
  if (!measurer) {
    measurer = document.createElement('div')
    measurer.className = 'wb-text'
    Object.assign(measurer.style, {
      position: 'absolute',
      left: '-100000px',
      top: '0',
      visibility: 'hidden',
      lineHeight: String(TEXT_LINE_HEIGHT),
    })
    document.body.appendChild(measurer)
  }
  return measurer
}

/**
 * Largest font size (up to `max`) at which `text` fits inside `width` x `height`.
 * Measured on a hidden node outside the zoomed canvas, so zoom never affects the result.
 */
export function fitFontSize(
  text: string,
  width: number,
  height: number,
  max: number,
  bold: boolean,
): number {
  // scrollWidth and scrollHeight are whole pixels, so measure against whole-pixel bounds.
  // A fractional width (137.6px) would otherwise read back as 138 and never "fit".
  const w = Math.floor(width)
  const h = Math.floor(height)
  if (!text.trim() || w <= 0 || h <= 0) return max
  const key = `${w}|${h}|${max}|${bold ? 1 : 0}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const m = getMeasurer()
  m.style.width = `${w}px`
  m.style.fontWeight = bold ? '700' : '400'
  m.textContent = text
  const fits = (size: number) => {
    m.style.fontSize = `${size}px`
    return m.scrollHeight <= h && m.scrollWidth <= w
  }
  let best = MIN_FONT
  if (fits(max)) {
    best = max
  } else {
    let lo = MIN_FONT
    let hi = max
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) {
        best = mid
        lo = mid
      } else {
        hi = mid
      }
    }
  }
  const result = Math.floor(best * 2) / 2
  if (cache.size > 4000) cache.clear()
  cache.set(key, result)
  return result
}

export function useFitText(text: string, width: number, height: number, max: number, bold = false) {
  return useMemo(
    () => fitFontSize(text, width, height, max, bold),
    [text, width, height, max, bold],
  )
}
