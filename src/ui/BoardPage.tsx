import { useEffect, useState } from 'react'
import { Canvas } from '../canvas/Canvas'
import { flushAutosave, startAutosave } from '../persist/autosave'
import { getBoard } from '../persist/db'
import { loadBoard, unloadBoard } from '../store/boardStore'
import { installKeyboard } from '../store/commands'
import { Toolbar } from './Toolbar'
import { TopBar } from './TopBar'
import { ZoomControls } from './ZoomControls'

type Status = 'loading' | 'ready' | 'missing'

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
      document.title = `${doc.name} · Whiteboard`
      setStatus('ready')
    })
    return () => {
      cancelled = true
      stopAutosave()
      void flushAutosave()
      unloadBoard()
    }
  }, [id])

  useEffect(() => installKeyboard(), [])

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
  return (
    <div className="relative h-full w-full">
      <Canvas />
      <TopBar />
      <Toolbar />
      <ZoomControls />
    </div>
  )
}
