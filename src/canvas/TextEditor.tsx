import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { setItemText, stopEditing } from '../store/boardStore'

interface Props {
  id: string
  value: string
  style: CSSProperties
  /** Grow the textarea to fit its content (sticky, shape, and text items). */
  autoGrow?: boolean
}

/**
 * In-place editor. A textarea keeps the caret stable when the font size changes while typing,
 * which a contentEditable would not.
 */
export function TextEditor({ id, value, style, autoGrow = true }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !autoGrow) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  })

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      spellCheck
      className="wb-text wb-editor"
      style={style}
      onChange={(e) => setItemText(id, e.target.value)}
      onBlur={() => stopEditing()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          stopEditing()
        }
      }}
    />
  )
}
