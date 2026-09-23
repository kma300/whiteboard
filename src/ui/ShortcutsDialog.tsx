import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  SHORTCUT_LABELS,
  SHORTCUT_ORDER,
  displayKey,
  normalizeKey,
  resetShortcuts,
  setShortcut,
  useShortcuts,
} from '../store/shortcuts'
import type { ShortcutAction } from '../store/shortcuts'

/** Lets the user rebind the left toolbar's single-key shortcuts. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const map = useShortcuts((s) => s.map)
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // Capture phase, so the board never reacts to keys pressed while this dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (!capturing) {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
        return
      }
      e.preventDefault()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setShortcut(capturing, null)
        setNote(`${SHORTCUT_LABELS[capturing]} has no shortcut now.`)
        setCapturing(null)
        return
      }
      if (['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
        setNote('Use a single key, without ⌘, ⌥, ⌃, or ⇧.')
        return
      }
      const key = normalizeKey(e.key)
      if (!key) {
        setNote('That key cannot be a shortcut. Pick a letter, number, or symbol.')
        return
      }
      const displaced = setShortcut(capturing, key)
      setNote(
        displaced
          ? `${displayKey(key)} moved from ${SHORTCUT_LABELS[displaced]} to ${SHORTCUT_LABELS[capturing]}.`
          : null,
      )
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/25"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        data-testid="shortcuts-dialog"
        className="wb-panel w-[380px] max-w-[calc(100vw-32px)] p-4"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-sm font-semibold">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-3 text-xs text-neutral-500">
          Click a key, then press the new one. Backspace removes it.
        </p>
        <ul className="divide-y divide-neutral-100">
          {SHORTCUT_ORDER.map((action) => (
            <li key={action} className="flex items-center justify-between py-1.5 text-sm">
              <span>{SHORTCUT_LABELS[action]}</span>
              <button
                type="button"
                data-testid={`shortcut-${action}`}
                aria-label={`Change shortcut for ${SHORTCUT_LABELS[action]}`}
                onClick={() => {
                  setNote(null)
                  setCapturing(action)
                }}
                className={`min-w-14 rounded-md border px-2 py-1 font-mono text-xs ${
                  capturing === action
                    ? 'border-[#3B6CFF] bg-[#EAEFFF] text-[#3B6CFF]'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300'
                }`}
              >
                {capturing === action ? 'Press a key' : (displayKey(map[action]) ?? 'None')}
              </button>
            </li>
          ))}
        </ul>
        <p role="status" className="mt-3 min-h-4 text-xs text-neutral-600">
          {note ?? 'Undo, copy, and other ⌘ shortcuts stay fixed.'}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              resetShortcuts()
              setCapturing(null)
              setNote('Shortcuts reset to the defaults.')
            }}
            className="h-8 rounded-lg border border-neutral-200 px-3 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg bg-[#3B6CFF] px-3 text-sm font-medium text-white hover:bg-[#2F5BE6]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
