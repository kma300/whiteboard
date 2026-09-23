import { beforeEach, describe, expect, it } from 'vitest'
import { createConnector, createFrame, createSticky, createText } from '../model/factories'
import { BOARD_VERSION } from '../model/types'
import type { StickyItem } from '../model/types'
import {
  addItems,
  beginTx,
  bringToFront,
  change,
  commitTx,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  loadBoard,
  movingSet,
  redo,
  refreshFrames,
  select,
  startEditing,
  setItemText,
  stopEditing,
  translateItem,
  undo,
  useBoard,
} from './boardStore'

const state = () => useBoard.getState()

function freshBoard() {
  loadBoard({
    version: BOARD_VERSION,
    id: 'b1',
    name: 'Test',
    createdAt: 0,
    updatedAt: 0,
    items: {},
    camera: { x: 0, y: 0, zoom: 1 },
  })
}

function sticky(x: number, y: number, z = 1): StickyItem {
  return createSticky({ x, y }, '#FFF3A3', z)
}

beforeEach(freshBoard)

describe('history', () => {
  it('records a whole drag as one undo step', () => {
    const a = sticky(0, 0)
    addItems([a])
    beginTx()
    for (let i = 1; i <= 10; i++) change({ [a.id]: translateItem(a, i * 5, 0) })
    commitTx()
    expect(state().undoStack).toHaveLength(2)
    expect((state().items[a.id] as StickyItem).x).toBe(a.x + 50)
    undo()
    expect((state().items[a.id] as StickyItem).x).toBe(a.x)
    redo()
    expect((state().items[a.id] as StickyItem).x).toBe(a.x + 50)
  })

  it('clears redo after a new edit', () => {
    const a = sticky(0, 0)
    addItems([a])
    undo()
    expect(state().redoStack).toHaveLength(1)
    addItems([sticky(300, 0)])
    expect(state().redoStack).toHaveLength(0)
  })

  it('drops transactions that end where they started', () => {
    const a = sticky(0, 0)
    addItems([a])
    beginTx()
    change({ [a.id]: translateItem(a, 40, 0) })
    change({ [a.id]: a })
    commitTx()
    expect(state().undoStack).toHaveLength(1)
  })

  it('treats create plus typing as a single step', () => {
    const a = sticky(0, 0)
    beginTx()
    addItems([a])
    startEditing(a.id)
    setItemText(a.id, 'hello')
    stopEditing()
    expect(state().undoStack).toHaveLength(1)
    undo()
    expect(state().items[a.id]).toBeUndefined()
  })
})

describe('item operations', () => {
  it('deletes connectors attached to deleted items', () => {
    const a = sticky(0, 0)
    const b = sticky(400, 0, 2)
    const c = createConnector(
      { kind: 'item', itemId: a.id, side: 'right' },
      { kind: 'item', itemId: b.id, side: 'left' },
      'curved',
      3,
    )
    addItems([a, b, c])
    select([a.id])
    deleteSelection()
    expect(state().items[c.id]).toBeUndefined()
    expect(state().items[b.id]).toBeDefined()
  })

  it('removes the connectors of a text box emptied while editing, in one undo step', () => {
    const a = sticky(0, 0)
    const t = { ...createText({ x: 400, y: 0 }, 2), text: 'hello' }
    const c = createConnector(
      { kind: 'item', itemId: a.id, side: 'right' },
      { kind: 'item', itemId: t.id, side: 'left' },
      'straight',
      3,
    )
    addItems([a, t, c])
    startEditing(t.id)
    setItemText(t.id, '')
    stopEditing()
    expect(state().items[t.id]).toBeUndefined()
    expect(state().items[c.id]).toBeUndefined()
    expect(state().items[a.id]).toBeDefined()
    undo()
    expect(state().items[t.id]).toMatchObject({ text: 'hello' })
    expect(state().items[c.id]).toBeDefined()
  })

  it('drops connectors whose attached item is missing when a board loads', () => {
    const a = sticky(0, 0)
    const orphan = createConnector(
      { kind: 'item', itemId: a.id, side: 'right' },
      { kind: 'item', itemId: 'gone', side: 'left' },
      'straight',
      2,
    )
    loadBoard({
      version: BOARD_VERSION,
      id: 'b2',
      name: 'Saved',
      createdAt: 0,
      updatedAt: 0,
      items: { [a.id]: a, [orphan.id]: orphan },
      camera: { x: 0, y: 0, zoom: 1 },
    })
    expect(Object.keys(state().items)).toEqual([a.id])
    expect(state().order).toEqual([a.id])
  })

  it('duplicates with new ids and remaps connectors between copies', () => {
    const a = sticky(0, 0)
    const b = sticky(400, 0, 2)
    const c = createConnector(
      { kind: 'item', itemId: a.id, side: 'right' },
      { kind: 'item', itemId: b.id, side: 'left' },
      'straight',
      3,
    )
    addItems([a, b, c])
    select([a.id, b.id])
    const ids = duplicateSelection()
    expect(ids).toHaveLength(3)
    const copies = ids.map((id) => state().items[id])
    const conn = copies.find((it) => it.type === 'connector')
    expect(conn?.type).toBe('connector')
    if (conn?.type === 'connector' && conn.start.kind === 'item' && conn.end.kind === 'item') {
      expect(ids).toContain(conn.start.itemId)
      expect(ids).toContain(conn.end.itemId)
    }
  })

  it('selects whole groups', () => {
    const a = sticky(0, 0)
    const b = sticky(300, 0, 2)
    const c = sticky(600, 0, 3)
    addItems([a, b, c])
    select([a.id, b.id])
    groupSelection()
    select([b.id])
    expect(new Set(state().selection)).toEqual(new Set([a.id, b.id]))
  })

  it('moves frame children with the frame', () => {
    const f = createFrame({ x: -500, y: -500, w: 1000, h: 1000 }, 'F', 1)
    const a = sticky(0, 0, 2)
    addItems([f, a])
    refreshFrames()
    expect(state().items[a.id]).toMatchObject({ frameId: f.id })
    expect(new Set(movingSet([f.id], state().items))).toEqual(new Set([f.id, a.id]))
  })

  it('brings the selection to the front', () => {
    const a = sticky(0, 0, 1)
    const b = sticky(50, 50, 2)
    addItems([a, b])
    select([a.id])
    bringToFront()
    const order = state().order
    expect(order[order.length - 1]).toBe(a.id)
  })
})
