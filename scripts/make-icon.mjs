// Renders the app icon to build/icon.png (1024x1024 RGBA) with no dependencies.
// Run with: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const S = 1024
// Premultiplied RGBA, 0..1.
const px = new Float64Array(S * S * 4)

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

/** Coverage of a rounded rect at a pixel center, with `soft` pixels of edge feathering. */
function coverage(x, y, rect, soft) {
  const { x: rx, y: ry, w, h, r } = rect
  const qx = Math.abs(x - (rx + w / 2)) - (w / 2 - r)
  const qy = Math.abs(y - (ry + h / 2)) - (h / 2 - r)
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  return Math.min(1, Math.max(0, 0.5 - d / soft))
}

function paint(rect, color, { alpha = 1, soft = 1 } = {}) {
  const pad = soft * 2 + 2
  const x0 = Math.max(0, Math.floor(rect.x - pad))
  const x1 = Math.min(S, Math.ceil(rect.x + rect.w + pad))
  const y0 = Math.max(0, Math.floor(rect.y - pad))
  const y1 = Math.min(S, Math.ceil(rect.y + rect.h + pad))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const a = coverage(x + 0.5, y + 0.5, rect, soft) * alpha
      if (a <= 0) continue
      const [r, g, b] = typeof color === 'function' ? color(x, y) : color
      const i = (y * S + x) * 4
      px[i] = r * a + px[i] * (1 - a)
      px[i + 1] = g * a + px[i + 1] * (1 - a)
      px[i + 2] = b * a + px[i + 2] * (1 - a)
      px[i + 3] = a + px[i + 3] * (1 - a)
    }
  }
}

const top = hex('#4C7BFF')
const bottom = hex('#2B53DB')
const gradient = (_x, y) => {
  const t = Math.min(1, Math.max(0, (y - 100) / 824))
  return top.map((c, k) => c + (bottom[k] - c) * t)
}

// macOS icon grid: an 824px body with a 185px corner radius, centered on the canvas.
paint({ x: 100, y: 112, w: 824, h: 824, r: 185 }, [0, 0, 0], { alpha: 0.18, soft: 28 })
paint({ x: 100, y: 100, w: 824, h: 824, r: 185 }, gradient)

const note = (x, y, color) => {
  paint({ x: x + 6, y: y + 18, w: 320, h: 320, r: 26 }, [0, 0, 0], { alpha: 0.22, soft: 26 })
  paint({ x, y, w: 320, h: 320, r: 22 }, hex(color))
}
note(248, 250, '#FFF3A3')
note(456, 454, '#FFC6DE')

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = rgba[i + 3]
      const o = row + 1 + x * 4
      for (let k = 0; k < 3; k++) raw[o + k] = a > 0 ? Math.round((rgba[i + k] / a) * 255) : 0
      raw[o + 3] = Math.round(a * 255)
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png(S, S, px))
console.log('Wrote build/icon.png')
