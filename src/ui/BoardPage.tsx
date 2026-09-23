import { Download, Keyboard, Map as MapIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Canvas } from '../canvas/Canvas'
import { installClipboard } from '../canvas/clipboard'
import { flushAutosave, startAutosave } from '../persist/autosave'
import { getBoard } from '../persist/db'
import { loadBoard, unloadBoard, useBoard } from '../store/boardStore'
import { installKeyboard } from '../store/commands'
import { IconButton } from './buttons'
import { ContextToolbar } from './ContextToolbar'
import { downloadBoardJson } from './exportBoard'
import { Minimap } from './Minimap'
import { ShortcutsDialog } from './ShortcutsDialog'
import { Toolbar } from './Toolbar'
import { TopBar } from './TopBar'
import { ZoomControls } from './ZoomControls'

type Status = 'loading' | 'ready' | 'missing'

function EmptyHint() {
  const empty = useBoard((s) => s.order.length === 0)
  if (!empty) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center">
      <div className="text-center text-sm text-neutral-500">
        <p className="font-medium text-neutral-700">This board is empty</p>
        <p className="mt-1">Pick a tool on the left, or press N and click to add a sticky note.</p>
      </div>
    </div>
  )
}

function BoardView() {
  const name = useBoard((s) => s.name)
  const [showMinimap, setShowMinimap] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const closeShortcuts = useCallback(() => setShowShortcuts(false), [])

  useEffect(() => {
    if (name) document.title = `${name} · Whiteboard`
  }, [name])

  return (
    <div className="relative h-full w-full">
      <Canvas />
      <EmptyHint />
      <TopBar>
        <div className="h-5 w-px bg-neutral-200" />
        <IconButton
          icon={Download}
          label="Export board as JSON"
          testId="export-board"
          onClick={downloadBoardJson}
        />
        <IconButton
          icon={Keyboard}
          label="Keyboard shortcuts"
          testId="open-shortcuts"
          onClick={() => setShowShortcuts(true)}
        />
      </TopBar>
      <Toolbar />
      <ContextToolbar />
      {showMinimap && <Minimap />}
      <ZoomControls>
        <IconButton
          icon={MapIcon}
          label={showMinimap ? 'Hide minimap' : 'Show minimap'}
          tipSide="top"
          active={showMinimap}
          onClick={() => setShowMinimap((v) => !v)}
        />
        <div className="mx-0.5 h-5 w-px bg-neutral-200" />
      </ZoomControls>
      {showShortcuts && <ShortcutsDialog onClose={closeShortcuts} />}
    </div>
  )
}

export function BoardPage({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let cancelled = false
    const stopAutosave = startAutosave()
    void getBoard(id).then((doc) => {
      if (cancelled) return
      if (!doc) {
        setStatus('missing')
        return
      }
      loadBoard(doc)
      setStatus('ready')
    })
    return () => {
      cancelled = true
      stopAutosave()
      void flushAutosave()
      unloadBoard()
    }
  }, [id])

  useEffect(() => {
    const removeKeyboard = installKeyboard()
    const removeClipboard = installClipboard()
    return () => {
      removeKeyboard()
      removeClipboard()
    }
  }, [])

  if (status === 'loading') {
    return <div className="grid h-full place-items-center text-sm text-neutral-500">Loading…</div>
  }
  if (status === 'missing') {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="text-sm text-neutral-600">This board no longer exists.</p>
          <a href="#/" className="mt-2 inline-block text-sm font-medium text-[#3B6CFF]">
            Back to boards
          </a>
        </div>
      </div>
    )
  }
  return <BoardView />
}
