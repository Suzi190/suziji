/**
 * 生成 PWA 图标（纯 Node 手写 PNG，不依赖任何图形库）
 * ------------------------------------------------------------
 * 画面：粉色渐变底 + 居中白色磨砂圆角方块 + 方块内一条粉色小胶囊
 * 输出：public/icons/{icon-192,icon-512,maskable-512}.png
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// ---------- 最小 PNG 编码器 ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePNG(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 绘制 ----------
const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => c1.map((v, i) => lerp(v, c2[i], t))

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width
  const bottom = top + height
  if (x < left || x > right || y < top || y > bottom) return false
  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}

function render(size, { pad = 0 } = {}) {
  const px = Buffer.alloc(size * size * 4)
  const S = size
  const inner = S * (1 - pad * 2)
  const offset = S * pad

  // 卡片尺寸（相对内框）
  const cardW = inner * 0.56
  const cardH = inner * 0.56
  const cardX = offset + (inner - cardW) / 2
  const cardY = offset + (inner - cardH) / 2
  const cardR = cardW * 0.26

  // 胶囊条
  const barW = cardW * 0.52
  const barH = cardH * 0.14
  const barX = cardX + (cardW - barW) / 2
  const barY = cardY + cardH * 0.62
  const barR = barH / 2

  // 小圆点（镜头 / home）
  const dotR = cardH * 0.075
  const dotX = cardX + cardW / 2
  const dotY = cardY + cardH * 0.3

  const top = [255, 241, 246]
  const bottom = [251, 203, 219]
  const accent = [247, 168, 190]

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const t = y / (S - 1)
      let color = mix(top, bottom, t)

      // 左上角柔光
      const dx = (x - S * 0.22) / S
      const dy = (y - S * 0.12) / S
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 3.1)
      color = mix(color, [255, 255, 255], glow * 0.55)

      // 白色磨砂卡片
      if (insideRoundedRect(x, y, cardX, cardY, cardW, cardH, cardR)) {
        const shade = 0.68 + 0.28 * (1 - (y - cardY) / cardH)
        color = mix(color, [255, 255, 255], Math.min(1, shade))
      }
      // 卡片内小圆点
      if ((x - dotX) ** 2 + (y - dotY) ** 2 <= dotR ** 2) {
        color = mix(color, accent, 0.55)
      }
      // 卡片内胶囊条
      if (insideRoundedRect(x, y, barX, barY, barW, barH, barR)) {
        color = mix(color, accent, 0.42)
      }

      px[i] = Math.round(color[0])
      px[i + 1] = Math.round(color[1])
      px[i + 2] = Math.round(color[2])
      px[i + 3] = 255
    }
  }
  return encodePNG(S, S, px)
}

const outDir = 'public/icons'
fs.mkdirSync(outDir, { recursive: true })

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  // maskable：四周留出安全区
  ['maskable-512.png', 512, { pad: 0.12 }],
]

for (const [name, size, options] of targets) {
  const file = path.join(outDir, name)
  fs.writeFileSync(file, render(size, options))
  console.log('生成', file, `${size}x${size}`)
}
