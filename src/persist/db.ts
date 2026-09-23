import type { BoardDoc, BoardMeta } from '../model/types'

const DB_NAME = 'whiteboard'
const DB_VERSION = 1
const BOARDS = 'boards'
const META = 'boardMeta'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(BOARDS)) db.createObjectStore(BOARDS, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function getBoard(id: string): Promise<BoardDoc | null> {
  const db = await openDb()
  const doc = await request<BoardDoc | undefined>(
    db.transaction(BOARDS, 'readonly').objectStore(BOARDS).get(id),
  )
  return doc ?? null
}

/** Writes the board and its dashboard summary in one transaction. */
export async function saveBoard(doc: BoardDoc, meta: BoardMeta): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([BOARDS, META], 'readwrite')
  tx.objectStore(BOARDS).put(doc)
  tx.objectStore(META).put(meta)
  await done(tx)
}

export async function listBoards(): Promise<BoardMeta[]> {
  const db = await openDb()
  const all = await request<BoardMeta[]>(
    db.transaction(META, 'readonly').objectStore(META).getAll(),
  )
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteBoard(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([BOARDS, META], 'readwrite')
  tx.objectStore(BOARDS).delete(id)
  tx.objectStore(META).delete(id)
  await done(tx)
}
