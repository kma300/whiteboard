import { connectorGeometry } from './connectors'
import { isBox } from './types'
import type { ConnectorEnd, Item, Items, Vec } from './types'
import { newId } from './ids'

/**
 * Items to copy for `ids`: the items themselves, children of selected frames, and connectors
 * between them. A selected connector whose attached item is not copied keeps that end as a
 * free point where it currently sits.
 */
export function collectForCopy(ids: string[], items: Items): Item[] {
  const chosen = new Set(ids.filter((id) => items[id]))
  const frames = new Set([...chosen].filter((id) => items[id]?.type === 'frame'))
  if (frames.size) {
    for (const it of Object.values(items)) {
      if (isBox(it) && it.frameId && frames.has(it.frameId)) chosen.add(it.id)
    }
  }
  for (const it of Object.values(items)) {
    if (it.type !== 'connector' || chosen.has(it.id)) continue
    const s = it.start.kind === 'point' || chosen.has(it.start.itemId)
    const e = it.end.kind === 'point' || chosen.has(it.end.itemId)
    const touches =
      (it.start.kind === 'item' && chosen.has(it.start.itemId)) ||
      (it.end.kind === 'item' && chosen.has(it.end.itemId))
    if (s && e && touches) chosen.add(it.id)
  }
  const out: Item[] = []
  for (const id of chosen) {
    const it = items[id]
    if (it.type !== 'connector') {
      out.push(it)
      continue
    }
    const g = connectorGeometry(it, items)
    const detach = (end: ConnectorEnd, at: Vec | undefined): ConnectorEnd =>
      end.kind === 'item' && !chosen.has(end.itemId) && at ? { kind: 'point', ...at } : end
    out.push({ ...it, start: detach(it.start, g?.start), end: detach(it.end, g?.end) })
  }
  return out
}

/**
 * Copies `source` with fresh ids, shifted by `offset`. Group ids and connector attachments are
 * remapped onto the copies. Connectors attached to items outside `source` are dropped.
 */
export function cloneItems(source: Item[], offset: Vec, zStart: number): Item[] {
  const idMap = new Map(source.map((it) => [it.id, newId()]))
  const groupMap = new Map<string, string>()
  const remapGroup = (g: string | undefined) => {
    if (!g) return undefined
    let next = groupMap.get(g)
    if (!next) {
      next = newId()
      groupMap.set(g, next)
    }
    return next
  }
  const remapEnd = (end: ConnectorEnd): ConnectorEnd | null => {
    if (end.kind === 'point') return { kind: 'point', x: end.x + offset.x, y: end.y + offset.y }
    const id = idMap.get(end.itemId)
    return id ? { ...end, itemId: id } : null
  }
  const out: Item[] = []
  const sorted = [...source].sort((a, b) => a.z - b.z)
  sorted.forEach((it, i) => {
    const id = idMap.get(it.id) ?? newId()
    const z = zStart + i
    if (it.type === 'connector') {
      const start = remapEnd(it.start)
      const end = remapEnd(it.end)
      if (start && end) out.push({ ...it, id, z, start, end, groupId: remapGroup(it.groupId) })
      return
    }
    out.push({
      ...it,
      id,
      z,
      x: it.x + offset.x,
      y: it.y + offset.y,
      groupId: remapGroup(it.groupId),
      frameId: it.frameId ? (idMap.get(it.frameId) ?? it.frameId) : undefined,
    })
  })
  return out
}
