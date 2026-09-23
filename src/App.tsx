import { useEffect, useState } from 'react'
import { BoardPage } from './ui/BoardPage'
import { Dashboard } from './ui/Dashboard'

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

export function App() {
  const route = useRoute()
  return route.page === 'board' ? <BoardPage key={route.id} id={route.id} /> : <Dashboard />
}
