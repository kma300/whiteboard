import { fitCamera } from '../model/geometry'
import { newId } from '../model/ids'
import { contentBoundsOf, schematicSvg } from '../model/schematic'
import { BOARD_VERSION } from '../model/types'
import type { BoardDoc, BoardMeta, Camera, Items } from '../model/types'
import { getBoard, saveBoard } from './db'

export function metaFor(doc: BoardDoc): BoardMeta {
  return {
    id: doc.id,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    itemCount: Object.keys(doc.items).length,
    thumbnail: schematicSvg(doc.items),
  }
}

/** Camera that shows `items` in a window of the given size, or centers the origin when empty. */
export function initialCamera(items: Items, size: { w: number; h: number }): Camera {
  const bounds = contentBoundsOf(items)
  return bounds ? fitCamera(bounds, size, 96, 1) : { x: size.w / 2, y: size.h / 2, zoom: 1 }
}

export function newBoardDoc(name: string, items: Items = {}, camera?: Camera): BoardDoc {
  const now = Date.now()
  return {
    version: BOARD_VERSION,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    items,
    camera: camera ?? { x: 0, y: 0, zoom: 1 },
  }
}

export async function createBoard(
  name: string,
  items: Items = {},
  camera?: Camera,
): Promise<BoardDoc> {
  const doc = newBoardDoc(name, items, camera)
  await saveBoard(doc, metaFor(doc))
  return doc
}

export async function duplicateBoard(id: string): Promise<BoardDoc | null> {
  const doc = await getBoard(id)
  if (!doc) return null
  return createBoard(`${doc.name} copy`, doc.items, doc.camera)
}

export async function renameStoredBoard(id: string, name: string): Promise<void> {
  const doc = await getBoard(id)
  if (!doc) return
  const next = { ...doc, name, updatedAt: Date.now() }
  await saveBoard(next, metaFor(next))
}
