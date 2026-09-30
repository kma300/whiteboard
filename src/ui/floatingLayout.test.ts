import { describe, expect, it } from 'vitest'
import { popoverPosition, toolbarPosition } from './floatingLayout'

describe('selection toolbar layout', () => {
  const size = { w: 586, h: 46 }
  const viewport = { w: 1000, h: 700 }

  it('keeps every control on screen when a shape is selected at the left edge', () => {
    const position = toolbarPosition({ x: 20, y: 50, w: 160, h: 160 }, size, viewport)
    expect(position.x).toBeGreaterThanOrEqual(68)
    expect(position.x + size.w).toBeLessThanOrEqual(viewport.w - 8)
    expect(position.y).toBe(242)
    expect(position.placement).toBe('below')
  })

  it('uses the actual toolbar width at the right edge', () => {
    const position = toolbarPosition({ x: 880, y: 300, w: 160, h: 160 }, size, viewport)
    expect(position.x + size.w).toBe(viewport.w - 8)
    expect(position.y + size.h).toBe(268)
    expect(position.placement).toBe('above')
  })

  it('keeps the toolbar visible when the selected shape is partly off screen', () => {
    const position = toolbarPosition({ x: 400, y: 1000, w: 160, h: 160 }, size, viewport)
    expect(position.y + size.h).toBeLessThanOrEqual(viewport.h - 60)
  })

  it('accounts for extra rows in a mixed selection', () => {
    const wrapped = { w: 644, h: 84 }
    const position = toolbarPosition({ x: 500, y: 250, w: 160, h: 160 }, wrapped, {
      w: 720,
      h: 480,
    })
    expect(position.x).toBe(68)
    expect(position.x + wrapped.w).toBe(712)
    expect(position.y + wrapped.h).toBe(218)
  })

  it('avoids covering the minimap when the selection is near the bottom', () => {
    const minimap = { x: 770, y: 490, w: 218, h: 146 }
    const position = toolbarPosition({ x: 840, y: 600, w: 160, h: 160 }, size, viewport, [minimap])
    expect(position.y + size.h).toBeLessThanOrEqual(minimap.y - 8)
  })
})

describe('selection menu layout', () => {
  const size = { w: 160, h: 110 }
  const viewport = { w: 720, h: 480 }

  it('opens away from the selected shape when there is space', () => {
    const position = popoverPosition({ x: 300, y: 200, w: 36, h: 36 }, size, viewport, 'above')
    expect(position.y + size.h).toBe(192)
  })

  it('flips below the button when there is no space above it', () => {
    const position = popoverPosition({ x: 68, y: 64, w: 36, h: 36 }, size, viewport, 'above')
    expect(position.y).toBe(108)
    expect(position.x).toBeGreaterThanOrEqual(8)
  })

  it('flips above and stays in the window at the bottom right', () => {
    const position = popoverPosition({ x: 670, y: 420, w: 36, h: 36 }, size, viewport, 'below')
    expect(position.x + size.w).toBe(712)
    expect(position.y + size.h).toBe(412)
  })
})
