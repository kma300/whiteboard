import { newId } from '../model/ids'
import { BOARD_VERSION } from '../model/types'
import type { BoardDoc, BoardMeta, Items } from '../model/types'
import { saveBoard } from './db'

export function metaFor(doc: BoardDoc): BoardMeta {
  return {
    id: doc.id,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    itemCount: Object.keys(doc.items).length,
    thumbnail: '',
  }
}

export function newBoardDoc(name: string, items: Items = {}): BoardDoc {
  const now = Date.now()
  return {
    version: BOARD_VERSION,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    items,
    camera: { x: 0, y: 0, zoom: 1 },
  }
}

export async function createBoard(name: string, items: Items = {}): Promise<BoardDoc> {
  const doc = newBoardDoc(name, items)
  await saveBoard(doc, metaFor(doc))
  return doc
}
