import { exportBoardJson } from '../persist/io'
import { toDoc } from '../store/boardStore'

/** Saves the open board as a .json file through the browser's (or Electron's) download flow. */
export function downloadBoardJson(): void {
  const doc = toDoc()
  if (!doc) return
  const blob = new Blob([exportBoardJson(doc)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.name.replace(/[^\w\- ]+/g, '').trim() || 'board'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
