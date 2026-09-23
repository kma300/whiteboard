import { createImage } from '../model/factories'
import type { Item, Vec } from '../model/types'
import * as B from '../store/boardStore'

const MAX_STORED_PX = 1600
const MAX_PLACED_SIZE = 480

interface LoadedImage {
  src: string
  w: number
  h: number
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 300 })
    img.onerror = () => reject(new Error('Image failed to load'))
    img.src = src
  })
}

/** Loads an image file, downscaling it so boards stay small. */
async function loadImage(file: File): Promise<LoadedImage> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_STORED_PX / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    return { src: canvas.toDataURL(type, 0.9), w, h }
  } catch {
    // Formats createImageBitmap cannot decode (SVG, for example) are embedded as they are.
    const src = await readAsDataUrl(file)
    return { src, ...(await naturalSize(src)) }
  }
}

/** Adds image files to the board, centered on `at`. Non-image files are ignored. */
export async function insertImages(files: File[], at: Vec): Promise<void> {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) return
  const results = await Promise.allSettled(images.map(loadImage))
  const loaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (!loaded.length || !B.useBoard.getState().boardId) return
  let z = B.nextZ()
  const items: Item[] = loaded.map((img, i) => {
    const scale = Math.min(1, MAX_PLACED_SIZE / Math.max(img.w, img.h))
    const w = img.w * scale
    const h = img.h * scale
    return createImage({ x: at.x - w / 2 + i * 24, y: at.y - h / 2 + i * 24, w, h }, img.src, z++)
  })
  B.setTool('select')
  B.beginTx()
  B.addItems(items)
  B.refreshFrames(items.map((it) => it.id))
  B.commitTx()
}
