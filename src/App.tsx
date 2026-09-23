import { useEffect, useState } from 'react'
import { createBoard } from './persist/boards'
import { listBoards } from './persist/db'
import { BoardPage } from './ui/BoardPage'

type Route = { page: 'home' } | { page: 'board'; id: string }

function parseRoute(hash: string): Route {
  const match = /^#\/b\/([\w-]+)$/.exec(hash)
  return match ? { page: 'board', id: match[1] } : { page: 'home' }
}

function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parseRoute(hash)
}

/** Opens the most recently edited board, creating one on first launch. */
function Home() {
  useEffect(() => {
    let cancelled = false
    void listBoards().then(async (boards) => {
      if (cancelled) return
      const id = boards[0]?.id ?? (await createBoard('Untitled board')).id
      if (!cancelled) window.location.replace(`#/b/${id}`)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return <div className="grid h-full place-items-center text-sm text-neutral-500">Loading…</div>
}

export function App() {
  const route = useRoute()
  return route.page === 'board' ? <BoardPage key={route.id} id={route.id} /> : <Home />
}
