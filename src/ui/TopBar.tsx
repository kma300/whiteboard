import { LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { renameBoard, useBoard } from '../store/boardStore'
import { Panel } from './buttons'

export function TopBar({ children }: { children?: ReactNode }) {
  const name = useBoard((s) => s.name)
  const [editing, setEditing] = useState(false)

  const commit = (value: string) => {
    renameBoard(value.trim() || 'Untitled board')
    setEditing(false)
  }

  return (
    <Panel className="fixed left-3 top-3 z-20 flex h-11 items-center gap-1 px-1">
      <a
        href="#/"
        title="All boards"
        aria-label="All boards"
        className="grid h-9 w-9 place-items-center rounded-lg text-neutral-700 hover:bg-neutral-100"
      >
        <LayoutGrid size={18} strokeWidth={1.9} />
      </a>
      <div className="h-5 w-px bg-neutral-200" />
      {editing ? (
        <input
          autoFocus
          defaultValue={name}
          aria-label="Board name"
          className="h-8 w-56 rounded-md border border-[#3B6CFF] px-2 text-sm font-semibold outline-none"
          onFocus={(e) => e.target.select()}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          type="button"
          title="Rename board"
          onClick={() => setEditing(true)}
          className="h-8 max-w-72 truncate rounded-md px-2 text-sm font-semibold hover:bg-neutral-100"
        >
          {name}
        </button>
      )}
      {children}
    </Panel>
  )
}
