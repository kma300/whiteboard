import type { Camera } from '../model/types'
import { toDoc, useBoard } from '../store/boardStore'
import { metaFor } from './boards'
import { saveBoard } from './db'

const DEBOUNCE_MS = 500

let timer: ReturnType<typeof setTimeout> | null = null
let savedRevision = -1
let savedCamera: Camera | null = null

/** Saves the open board. The document is captured synchronously, so callers may unload right after. */
export function flushAutosave(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const s = useBoard.getState()
  const doc = toDoc()
  if (!doc) return Promise.resolve()
  const docChanged = s.revision !== savedRevision
  if (!docChanged && s.camera === savedCamera) return Promise.resolve()
  savedRevision = s.revision
  savedCamera = s.camera
  const updatedAt = docChanged ? Date.now() : s.updatedAt
  if (docChanged) useBoard.setState({ updatedAt })
  const full = { ...doc, updatedAt }
  return saveBoard(full, metaFor(full))
}

function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushAutosave(), DEBOUNCE_MS)
}

/** Watches the open board and saves it shortly after each change. Returns a cleanup. */
export function startAutosave(): () => void {
  const unsubscribe = useBoard.subscribe((s, prev) => {
    if (!s.boardId) return
    if (s.boardId !== prev.boardId) {
      savedRevision = s.revision
      savedCamera = s.camera
      return
    }
    if (s.revision !== prev.revision || s.camera !== prev.camera) schedule()
  })
  const onHidden = () => {
    if (document.visibilityState === 'hidden') void flushAutosave()
  }
  const onPageHide = () => void flushAutosave()
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', onPageHide)
  return () => {
    unsubscribe()
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', onPageHide)
  }
}
