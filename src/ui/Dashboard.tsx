import { Ellipsis, Plus, Search, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Schematic } from '../canvas/Schematic'
import { expandRect } from '../model/geometry'
import { contentBoundsOf, schematicMarks } from '../model/schematic'
import { TEMPLATES, templateItems } from '../model/templates'
import type { TemplateKind } from '../model/templates'
import type { BoardMeta } from '../model/types'
import { createBoard, duplicateBoard, initialCamera, renameStoredBoard } from '../persist/boards'
import { deleteBoard, listBoards } from '../persist/db'
import { parseBoardJson } from '../persist/io'

function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)} min ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)} h ago`
  const d = h / 24
  if (d < 7) return `${Math.floor(d)} d ago`
  return new Date(ts).toLocaleDateString()
}

const windowSize = () => ({ w: window.innerWidth, h: window.innerHeight })
const open = (id: string) => {
  window.location.hash = `#/b/${id}`
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#3B6CFF" />
      <rect x="14" y="14" width="22" height="22" rx="3" fill="#FFF3A3" />
      <rect x="28" y="28" width="22" height="22" rx="3" fill="#FFC6DE" />
    </svg>
  )
}

function TemplatePreview({ kind }: { kind: TemplateKind }) {
  const preview = useMemo(() => {
    const items = templateItems(kind)
    const bounds = contentBoundsOf(items)
    return bounds
      ? {
          marks: schematicMarks(items),
          view: expandRect(bounds, Math.max(bounds.w, bounds.h) * 0.08),
        }
      : null
  }, [kind])
  if (!preview) {
    return (
      <div className="grid h-full place-items-center text-neutral-400">
        <Plus size={30} strokeWidth={1.6} />
      </div>
    )
  }
  return <Schematic marks={preview.marks} view={preview.view} width="100%" height="100%" />
}

function MenuItem({
  children,
  onClick,
  danger,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  danger?: boolean
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-neutral-100 ${
        danger ? 'text-red-600' : 'text-neutral-800'
      }`}
    >
      {children}
    </button>
  )
}

function BoardCard({ meta, onChanged }: { meta: BoardMeta; onChanged: () => void }) {
  const [menu, setMenu] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const thumb = meta.thumbnail
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(meta.thumbnail)}`
    : null

  const closeMenu = () => {
    setMenu(false)
    setConfirming(false)
  }

  return (
    <div className="group relative" data-testid="board-card">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:border-[#3B6CFF] hover:shadow-md">
        <a
          href={`#/b/${meta.id}`}
          className="block aspect-[16/10] bg-[#F5F5F3]"
          aria-label={`Open ${meta.name}`}
        >
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="h-full w-full object-contain p-3"
              draggable={false}
            />
          ) : (
            <div className="grid h-full place-items-center text-xs text-neutral-400">
              Empty board
            </div>
          )}
        </a>
        <div className="border-t border-neutral-100 px-3 py-2.5">
          {renaming ? (
            <input
              autoFocus
              defaultValue={meta.name}
              aria-label="Board name"
              className="w-full rounded border border-[#3B6CFF] px-1.5 py-0.5 text-sm font-semibold outline-none"
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                const name = e.target.value.trim()
                setRenaming(false)
                if (name && name !== meta.name)
                  void renameStoredBoard(meta.id, name).then(onChanged)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <a href={`#/b/${meta.id}`} className="block truncate text-sm font-semibold">
              {meta.name}
            </a>
          )}
          <div className="mt-0.5 text-xs text-neutral-500">
            Edited {timeAgo(meta.updatedAt)} · {meta.itemCount}{' '}
            {meta.itemCount === 1 ? 'item' : 'items'}
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-label={`More actions for ${meta.name}`}
        data-testid="board-menu"
        onClick={() => setMenu((m) => !m)}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-neutral-700 opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"
      >
        <Ellipsis size={16} />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={closeMenu} />
          <div className="wb-panel absolute right-2 top-11 z-20 w-44 p-1">
            <MenuItem
              onClick={() => {
                closeMenu()
                setRenaming(true)
              }}
            >
              Rename
            </MenuItem>
            <MenuItem
              onClick={() => {
                closeMenu()
                void duplicateBoard(meta.id).then(onChanged)
              }}
            >
              Duplicate
            </MenuItem>
            {confirming ? (
              <MenuItem
                danger
                testId="board-delete-confirm"
                onClick={() => {
                  closeMenu()
                  void deleteBoard(meta.id).then(onChanged)
                }}
              >
                Delete permanently
              </MenuItem>
            ) : (
              <MenuItem danger testId="board-delete" onClick={() => setConfirming(true)}>
                Delete…
              </MenuItem>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function Dashboard() {
  const [boards, setBoards] = useState<BoardMeta[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    void listBoards().then(setBoards)
  }

  useEffect(() => {
    document.title = 'Whiteboard'
    refresh()
  }, [])

  const create = async (kind: TemplateKind) => {
    const items = templateItems(kind)
    const name =
      kind === 'blank'
        ? 'Untitled board'
        : (TEMPLATES.find((t) => t.kind === kind)?.name ?? 'Untitled board')
    const doc = await createBoard(name, items, initialCamera(items, windowSize()))
    open(doc.id)
  }

  const importFile = async (file: File) => {
    try {
      const parsed = parseBoardJson(await file.text())
      const doc = await createBoard(parsed.name, parsed.items, parsed.camera)
      open(doc.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be imported.')
    }
  }

  const q = query.trim().toLowerCase()
  const visible = (boards ?? []).filter((b) => b.name.toLowerCase().includes(q))

  return (
    <div className="h-full overflow-y-auto bg-[#F5F5F3]">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2.5 px-6">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Whiteboard</span>
          <div className="flex-1" />
          <button
            type="button"
            data-testid="import-board"
            onClick={() => fileRef.current?.click()}
            className="flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Upload size={15} /> Import
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
          >
            <span>{error}</span>
            <button type="button" className="font-medium" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Create a board</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.kind}
              type="button"
              data-testid={`template-${t.kind}`}
              onClick={() => void create(t.kind)}
              className="overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition hover:border-[#3B6CFF] hover:shadow-md"
            >
              <div className="aspect-[16/10] bg-[#F5F5F3] p-3">
                <TemplatePreview kind={t.kind} />
              </div>
              <div className="border-t border-neutral-100 px-3 py-2.5">
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="mt-0.5 text-xs text-neutral-500">{t.description}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-700">Your boards</h2>
          <label className="flex h-9 w-full max-w-64 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-neutral-500 focus-within:border-[#3B6CFF]">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards"
              aria-label="Search boards"
              className="w-full bg-transparent text-sm text-neutral-800 outline-none"
            />
          </label>
        </div>

        {boards === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500">
            {boards.length === 0
              ? 'No boards yet. Pick a template above to start one.'
              : `No boards match “${query.trim()}”.`}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((b) => (
              <BoardCard key={b.id} meta={b} onChanged={refresh} />
            ))}
          </div>
        )}
      </main>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void importFile(file)
        }}
      />
    </div>
  )
}
