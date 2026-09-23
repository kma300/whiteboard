import { describe, expect, it } from 'vitest'
import { createConnector, createSticky, createStroke } from '../model/factories'
import { BOARD_VERSION } from '../model/types'
import type { BoardDoc } from '../model/types'
import {
  exportBoardJson,
  parseBoardJson,
  parseClipboard,
  sanitizeItem,
  serializeClipboard,
} from './io'

function sampleDoc(): BoardDoc {
  const s1 = { ...createSticky({ x: 0, y: 0 }, '#FFF3A3', 1), text: 'Hello' }
  const s2 = createSticky({ x: 400, y: 0 }, '#FFC6DE', 2)
  const c = createConnector(
    { kind: 'item', itemId: s1.id, side: 'right' },
    { kind: 'item', itemId: s2.id, side: 'left' },
    'elbow',
    3,
  )
  const pen = createStroke(
    [
      [0, 0, 0.5],
      [10, 5, 0.5],
    ],
    { color: '#1F1F1F', size: 4, opacity: 1, simulatePressure: true },
    4,
  )
  return {
    version: BOARD_VERSION,
    id: 'b1',
    name: 'Roadmap',
    createdAt: 1,
    updatedAt: 2,
    items: { [s1.id]: s1, [s2.id]: s2, [c.id]: c, [pen.id]: pen },
    camera: { x: 10, y: 20, zoom: 1.5 },
  }
}

describe('board files', () => {
  it('round-trips an exported board', () => {
    const doc = sampleDoc()
    const parsed = parseBoardJson(exportBoardJson(doc))
    expect(parsed.name).toBe('Roadmap')
    expect(parsed.items).toEqual(JSON.parse(JSON.stringify(doc.items)))
    expect(parsed.camera).toEqual(doc.camera)
  })

  it('rejects files that are not board exports', () => {
    expect(() => parseBoardJson('not json')).toThrow(/valid JSON/)
    expect(() => parseBoardJson('{"hello": 1}')).toThrow(/not a Whiteboard board/)
    const future = JSON.parse(exportBoardJson(sampleDoc()))
    future.version = 99
    expect(() => parseBoardJson(JSON.stringify(future))).toThrow(/Unsupported board version/)
  })

  it('drops connectors whose items are missing', () => {
    const doc = sampleDoc()
    const sticky = Object.values(doc.items).find(
      (it) => it.type === 'sticky' && it.text === 'Hello',
    )
    if (sticky) delete doc.items[sticky.id]
    const parsed = parseBoardJson(exportBoardJson(doc))
    expect(Object.values(parsed.items).some((it) => it.type === 'connector')).toBe(false)
  })
})

describe('item sanitizing', () => {
  it('refuses remote images and bad geometry', () => {
    const base = { id: 'i1', z: 1, x: 0, y: 0, w: 10, h: 10 }
    expect(sanitizeItem({ ...base, type: 'image', src: 'https://example.com/a.png' })).toBeNull()
    expect(
      sanitizeItem({ ...base, type: 'image', src: 'data:image/png;base64,AAAA' }),
    ).not.toBeNull()
    expect(sanitizeItem({ ...base, w: -5, type: 'sticky', text: '', fill: '#fff' })).toBeNull()
    expect(sanitizeItem({ ...base, type: 'widget' })).toBeNull()
  })

  it('replaces unsafe colors with defaults', () => {
    const item = sanitizeItem({
      id: 's',
      z: 1,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      type: 'sticky',
      text: 'x',
      fill: 'red" onload="alert(1)',
    })
    expect(item?.type === 'sticky' && item.fill).toBe('#FFF3A3')
  })
})

describe('clipboard', () => {
  it('reads back what it writes and ignores plain text', () => {
    const items = Object.values(sampleDoc().items)
    expect(parseClipboard(serializeClipboard(items))).toHaveLength(items.length)
    expect(parseClipboard('just some words')).toBeNull()
    expect(parseClipboard('{"kind":"other"}')).toBeNull()
  })
})
