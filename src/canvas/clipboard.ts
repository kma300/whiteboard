import { collectForCopy } from '../model/clone'
import { createSticky } from '../model/factories'
import { parseClipboard, serializeClipboard } from '../persist/io'
import * as B from '../store/boardStore'
import { isTypingTarget } from '../store/commands'
import { insertImages } from './images'

/**
 * Copy, cut, and paste through DOM clipboard events, which need no permission prompt and fire
 * both for keyboard shortcuts and for the Electron Edit menu. Returns a cleanup.
 */
export function installClipboard(): () => void {
  let lastPaste = { text: '', count: 0 }

  const copySelection = (e: ClipboardEvent): boolean => {
    if (isTypingTarget(document.activeElement)) return false
    const s = B.useBoard.getState()
    if (!s.boardId || !s.selection.length || !e.clipboardData) return false
    e.clipboardData.setData('text/plain', serializeClipboard(collectForCopy(s.selection, s.items)))
    e.preventDefault()
    return true
  }

  const onCopy = (e: ClipboardEvent) => {
    copySelection(e)
  }

  const onCut = (e: ClipboardEvent) => {
    if (copySelection(e)) B.deleteSelection()
  }

  const onPaste = (e: ClipboardEvent) => {
    if (isTypingTarget(document.activeElement)) return
    const s = B.useBoard.getState()
    const data = e.clipboardData
    if (!s.boardId || !data) return
    const center = B.viewportCenterWorld()
    const files = [...data.files].filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault()
      void insertImages(files, center)
      return
    }
    const text = data.getData('text/plain')
    if (!text) return
    e.preventDefault()
    lastPaste = lastPaste.text === text ? { text, count: lastPaste.count + 1 } : { text, count: 0 }
    const shift = lastPaste.count * 24
    const at = { x: center.x + shift, y: center.y + shift }
    const items = parseClipboard(text)
    if (items) {
      B.setTool('select')
      B.pasteItems(items, at)
      return
    }
    const sticky = { ...createSticky(at, s.toolOptions.stickyFill, B.nextZ()), text }
    B.setTool('select')
    B.beginTx()
    B.addItems([sticky])
    B.refreshFrames([sticky.id])
    B.commitTx()
  }

  // Dropping a file anywhere outside the canvas would otherwise navigate away from the app.
  const blockDrop = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  }

  document.addEventListener('copy', onCopy)
  document.addEventListener('cut', onCut)
  document.addEventListener('paste', onPaste)
  window.addEventListener('dragover', blockDrop)
  window.addEventListener('drop', blockDrop)
  return () => {
    document.removeEventListener('copy', onCopy)
    document.removeEventListener('cut', onCut)
    document.removeEventListener('paste', onPaste)
    window.removeEventListener('dragover', blockDrop)
    window.removeEventListener('drop', blockDrop)
  }
}
