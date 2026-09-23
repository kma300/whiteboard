let counter = 0

/** Short unique id. Works outside secure contexts, unlike crypto.randomUUID. */
export function newId(): string {
  counter = (counter + 1) % 1296
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8) +
    counter.toString(36).padStart(2, '0')
  )
}
