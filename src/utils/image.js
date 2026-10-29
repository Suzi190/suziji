/**
 * 图片处理小工具
 * ------------------------------------------------------------
 * 用户上传的图片先等比压缩再存 IndexedDB：
 * 既省空间，也避免超大图拖慢桌面渲染
 */

/** 读取文件 → 等比缩放到最长边 max → JPEG Blob（失败则原样返回） */
export async function compressImage(file, { max = 1400, quality = 0.85 } = {}) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('请选择图片文件')
  if (typeof createImageBitmap !== 'function') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    return blob ?? file
  } catch (err) {
    console.warn('[image] 压缩失败，使用原图', err)
    return file
  }
}

/** 生成不重复的图片资源 key */
export const newImageKey = () =>
  `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
