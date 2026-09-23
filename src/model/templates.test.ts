import { describe, expect, it } from 'vitest'
import { sanitizeItems } from '../persist/io'
import { boxRect, rectCenter, rectContains } from './geometry'
import { schematicSvg } from './schematic'
import { TEMPLATES, templateItems } from './templates'

describe('templates', () => {
  it.each(TEMPLATES.map((t) => t.kind))('%s produces a valid board', (kind) => {
    const items = templateItems(kind)
    // Every item survives the same validation an imported file goes through.
    const clean = JSON.parse(JSON.stringify(items))
    expect(sanitizeItems(Object.values(clean))).toEqual(clean)
    for (const it of Object.values(items)) {
      if (it.type === 'connector') {
        if (it.start.kind === 'item') expect(items[it.start.itemId]).toBeDefined()
        if (it.end.kind === 'item') expect(items[it.end.itemId]).toBeDefined()
      } else if (it.frameId) {
        const frame = items[it.frameId]
        expect(frame?.type).toBe('frame')
        if (frame?.type === 'frame') {
          expect(rectContains(boxRect(frame), rectCenter(boxRect(it)))).toBe(true)
        }
      }
    }
  })

  it('only the blank template is empty', () => {
    for (const t of TEMPLATES) {
      expect(Object.keys(templateItems(t.kind)).length === 0).toBe(t.kind === 'blank')
    }
  })
})

describe('schematic thumbnails', () => {
  it('renders nothing for an empty board and escapes attribute values', () => {
    expect(schematicSvg({})).toBe('')
    const items = templateItems('kanban')
    const first = Object.values(items).find((it) => it.type === 'sticky')
    if (first?.type === 'sticky') items[first.id] = { ...first, fill: '#fff" onload="x' }
    const svg = schematicSvg(items)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('" onload="')
  })
})
