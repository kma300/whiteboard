import { create } from 'zustand'

/** Actions on the left toolbar that can have a single-key shortcut. */
export type ShortcutAction =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'text'
  | 'shape'
  | 'rect'
  | 'ellipse'
  | 'connector'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'frame'
  | 'image'

/** Lowercase single character, or null for no shortcut. */
export type ShortcutMap = Record<ShortcutAction, string | null>

export const SHORTCUT_ORDER: ShortcutAction[] = [
  'select',
  'hand',
  'sticky',
  'text',
  'shape',
  'rect',
  'ellipse',
  'connector',
  'pen',
  'highlighter',
  'eraser',
  'frame',
  'image',
]

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  select: 'Select',
  hand: 'Hand',
  sticky: 'Sticky note',
  text: 'Text',
  shape: 'Shape (last used)',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  connector: 'Connection line',
  pen: 'Pen',
  highlighter: 'Highlighter',
  eraser: 'Eraser',
  frame: 'Frame',
  image: 'Upload image',
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  select: 'v',
  hand: 'h',
  sticky: 'n',
  text: 't',
  shape: 's',
  rect: 'r',
  ellipse: 'o',
  connector: 'l',
  pen: 'p',
  highlighter: null,
  eraser: 'e',
  frame: 'f',
  image: null,
}

/** The key as stored, or null when it cannot be a shortcut (space, named keys like "Enter"). */
export function normalizeKey(key: string): string | null {
  if (key.length !== 1 || key.trim() === '') return null
  return key.toLowerCase()
}

export const displayKey = (key: string | null) => (key ? key.toUpperCase() : null)

/**
 * Binds `key` to `action`. Another action already using the key loses it and is returned as
 * `displaced`, so every key maps to at most one action.
 */
export function assignKey(
  map: ShortcutMap,
  action: ShortcutAction,
  key: string | null,
): { map: ShortcutMap; displaced: ShortcutAction | null } {
  const next = { ...map }
  let displaced: ShortcutAction | null = null
  if (key) {
    for (const other of SHORTCUT_ORDER) {
      if (other !== action && next[other] === key) {
        next[other] = null
        displaced = other
      }
    }
  }
  next[action] = key
  return { map: next, displaced }
}

/** Reads a stored map, ignoring unknown actions, invalid keys, and duplicate keys. */
export function sanitizeShortcuts(raw: unknown): ShortcutMap {
  let map: ShortcutMap = { ...DEFAULT_SHORTCUTS }
  if (typeof raw !== 'object' || raw === null) return map
  const stored = new Map(Object.entries(raw))
  for (const action of SHORTCUT_ORDER) {
    if (!stored.has(action)) continue
    const value = stored.get(action)
    const key = typeof value === 'string' ? normalizeKey(value) : null
    if (value === null || key) map = assignKey(map, action, key).map
  }
  return map
}

const STORAGE_KEY = 'whiteboard.shortcuts.v1'

function load(): ShortcutMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitizeShortcuts(JSON.parse(raw)) : DEFAULT_SHORTCUTS
  } catch {
    // No storage (tests, private mode) or unreadable data: use the defaults.
    return DEFAULT_SHORTCUTS
  }
}

function save(map: ShortcutMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage unavailable; the change still applies for this session.
  }
}

export const useShortcuts = create<{ map: ShortcutMap }>()(() => ({ map: load() }))

/** Rebinds an action and persists it. Returns the action that lost the key, if any. */
export function setShortcut(action: ShortcutAction, key: string | null): ShortcutAction | null {
  const { map, displaced } = assignKey(useShortcuts.getState().map, action, key)
  useShortcuts.setState({ map })
  save(map)
  return displaced
}

export function resetShortcuts(): void {
  useShortcuts.setState({ map: DEFAULT_SHORTCUTS })
  save(DEFAULT_SHORTCUTS)
}

export function actionForKey(key: string): ShortcutAction | null {
  const k = normalizeKey(key)
  if (!k) return null
  const map = useShortcuts.getState().map
  return SHORTCUT_ORDER.find((action) => map[action] === k) ?? null
}
