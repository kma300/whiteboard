import type { ShapeKind, Tool } from '../model/types'
import * as B from './boardStore'

export type Command =
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'zoomFit'
  | 'zoomSelection'
  | 'delete'
  | 'duplicate'
  | 'group'
  | 'ungroup'
  | 'bringToFront'
  | 'sendToBack'
  | 'toggleLock'
  | 'edit'
  | 'escape'

/** Shortcuts the Electron app menu owns. The menu forwards them, so keydown must skip them there. */
const MENU_OWNED = new Set<Command>(['undo', 'redo', 'selectAll', 'zoomIn', 'zoomOut', 'zoomReset'])

export const inElectron =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('shell') === 'electron'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  n: 'sticky',
  t: 'text',
  s: 'shape',
  l: 'connector',
  p: 'pen',
  e: 'eraser',
  f: 'frame',
}

export function runCommand(cmd: Command): void {
  const s = B.useBoard.getState()
  switch (cmd) {
    case 'undo':
      return B.undo()
    case 'redo':
      return B.redo()
    case 'selectAll':
      return B.selectAll()
    case 'zoomIn':
      return B.zoomBy(1.25)
    case 'zoomOut':
      return B.zoomBy(1 / 1.25)
    case 'zoomReset':
      return B.zoomTo(1)
    case 'zoomFit':
      return B.zoomToFit()
    case 'zoomSelection':
      return B.zoomToSelection()
    case 'delete':
      return B.deleteSelection()
    case 'duplicate':
      B.duplicateSelection()
      return
    case 'group':
      return B.groupSelection()
    case 'ungroup':
      return B.ungroupSelection()
    case 'bringToFront':
      return B.bringToFront()
    case 'sendToBack':
      return B.sendToBack()
    case 'toggleLock':
      return B.toggleLock()
    case 'edit':
      if (s.selection.length === 1) B.startEditing(s.selection[0])
      return
    case 'escape':
      if (s.tool !== 'select') B.setTool('select')
      else B.clearSelection()
      return
  }
}

export function isTypingTarget(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT')
  )
}

function commandForKey(e: KeyboardEvent): Command | null {
  const key = e.key.toLowerCase()
  if (e.metaKey || e.ctrlKey) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
    if (key === 'y') return 'redo'
    if (key === 'a') return 'selectAll'
    if (key === 'd') return 'duplicate'
    if (key === 'g') return e.shiftKey ? 'ungroup' : 'group'
    if (key === '=' || key === '+') return 'zoomIn'
    if (key === '-' || key === '_') return 'zoomOut'
    if (key === '0') return 'zoomReset'
    if (key === ']') return 'bringToFront'
    if (key === '[') return 'sendToBack'
    if (key === 'l' && e.shiftKey) return 'toggleLock'
    return null
  }
  if (e.altKey) return null
  if (e.shiftKey && e.code === 'Digit1') return 'zoomFit'
  if (e.shiftKey && e.code === 'Digit2') return 'zoomSelection'
  if (key === 'delete' || key === 'backspace') return 'delete'
  if (key === 'enter') return 'edit'
  if (key === 'escape') return 'escape'
  return null
}

/** Keys that pick the shape tool with a specific shape. */
const SHAPE_KEYS: Record<string, ShapeKind> = { r: 'rect', o: 'ellipse' }

const NUDGE: Record<string, [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
}

/** Keyboard shortcuts plus the Electron menu bridge. Returns a cleanup. */
export function installKeyboard(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target) || !B.useBoard.getState().boardId) return
    const cmd = commandForKey(e)
    if (cmd) {
      if (inElectron && MENU_OWNED.has(cmd)) return
      e.preventDefault()
      runCommand(cmd)
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key.toLowerCase()
    const nudge = NUDGE[key]
    if (nudge) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      B.nudgeSelection(nudge[0] * step, nudge[1] * step)
      return
    }
    const shape = SHAPE_KEYS[key]
    if (shape && !e.shiftKey) {
      e.preventDefault()
      B.setToolOptions({ shape })
      B.setTool('shape')
      return
    }
    const tool = TOOL_KEYS[key]
    if (tool && !e.shiftKey) {
      e.preventDefault()
      B.setTool(tool)
    }
  }

  // The Electron app menu forwards Undo, Redo, Select All, and zoom as a DOM event.
  const onMenuCommand = (e: Event) => {
    const cmd = (e as CustomEvent<Command>).detail
    const active = document.activeElement
    if (isTypingTarget(active) && (cmd === 'undo' || cmd === 'redo' || cmd === 'selectAll')) {
      if (
        cmd === 'selectAll' &&
        (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)
      ) {
        active.select()
      } else {
        document.execCommand(cmd)
      }
      return
    }
    if (B.useBoard.getState().boardId) runCommand(cmd)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('wb-command', onMenuCommand)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('wb-command', onMenuCommand)
  }
}
