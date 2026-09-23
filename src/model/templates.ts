import { createConnector, createFrame, createShape, createSticky, createText } from './factories'
import { STICKY_COLORS } from './palette'
import type { FrameItem, Item, Items, StickyItem } from './types'

export type TemplateKind = 'blank' | 'kanban' | 'retro' | 'brainstorm'

export const TEMPLATES: { kind: TemplateKind; name: string; description: string }[] = [
  { kind: 'blank', name: 'Blank board', description: 'Start from an empty canvas' },
  { kind: 'kanban', name: 'Kanban', description: 'To do, in progress, done' },
  { kind: 'retro', name: 'Retrospective', description: 'What went well, what to improve' },
  { kind: 'brainstorm', name: 'Brainstorm', description: 'One idea, many branches' },
]

const color = (name: string) => STICKY_COLORS.find((c) => c.name === name)?.value ?? '#FFF3A3'

const STICKY = 160

/** A column frame with stickies laid out two per row inside it. */
function column(
  x: number,
  title: string,
  notes: string[],
  fill: string,
  z: { next: number },
): Item[] {
  const frame: FrameItem = createFrame({ x, y: 0, w: 380, h: 720 }, title, z.next++)
  const stickies: StickyItem[] = notes.map((text, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const sticky = createSticky(
      { x: x + 20 + STICKY / 2 + col * (STICKY + 20), y: 30 + STICKY / 2 + row * (STICKY + 20) },
      fill,
      z.next++,
    )
    return {
      ...sticky,
      w: STICKY,
      h: STICKY,
      x: sticky.x + (sticky.w - STICKY) / 2,
      y: sticky.y + (sticky.h - STICKY) / 2,
      text,
      frameId: frame.id,
    }
  })
  return [frame, ...stickies]
}

function toItems(list: Item[]): Items {
  const items: Items = {}
  for (const it of list) items[it.id] = it
  return items
}

export function templateItems(kind: TemplateKind): Items {
  const z = { next: 1 }
  switch (kind) {
    case 'blank':
      return {}
    case 'kanban':
      return toItems([
        ...column(
          0,
          'To do',
          ['Write the brief', 'Collect references', 'Plan the kickoff'],
          color('Yellow'),
          z,
        ),
        ...column(420, 'In progress', ['Draft the flows', 'Review copy'], color('Blue'), z),
        ...column(840, 'Done', ['Pick a name'], color('Green'), z),
      ])
    case 'retro':
      return toItems([
        ...column(0, 'What went well', ['Shipped on time', 'Great pairing'], color('Green'), z),
        ...column(
          420,
          'What could be better',
          ['Too many meetings', 'Late feedback'],
          color('Pink'),
          z,
        ),
        ...column(840, 'Action items', ['Protect focus time'], color('Blue'), z),
      ])
    case 'brainstorm': {
      const center = createShape({ x: -120, y: -70, w: 240, h: 140 }, 'ellipse', z.next++)
      const hub = {
        ...center,
        text: 'Big idea',
        fill: color('Violet'),
        strokeWidth: 0,
        fontSize: 28,
        bold: true,
      }
      const ideas = [
        'Who is it for?',
        'Why now?',
        'How it works',
        'Risks',
        'First step',
        'Wild card',
      ]
      const fills = ['Yellow', 'Orange', 'Pink', 'Blue', 'Cyan', 'Green']
      const list: Item[] = [hub]
      ideas.forEach((text, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / ideas.length
        const at = { x: Math.cos(angle) * 420, y: Math.sin(angle) * 300 }
        const sticky = { ...createSticky(at, color(fills[i]), z.next++), text }
        const side =
          Math.abs(at.x) > Math.abs(at.y) * 1.2
            ? at.x > 0
              ? 'left'
              : 'right'
            : at.y > 0
              ? 'top'
              : 'bottom'
        const hubSide =
          side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'top' ? 'bottom' : 'top'
        const link = createConnector(
          { kind: 'item', itemId: hub.id, side: hubSide },
          { kind: 'item', itemId: sticky.id, side },
          'curved',
          z.next++,
        )
        list.push(sticky, { ...link, endArrow: 'none', stroke: '#8A8A85' })
      })
      const title = {
        ...createText({ x: -200, y: -520 }, z.next++),
        w: 400,
        text: 'Brainstorm',
        fontSize: 40,
        bold: true,
        align: 'center' as const,
      }
      list.push(title)
      return toItems(list)
    }
  }
}
