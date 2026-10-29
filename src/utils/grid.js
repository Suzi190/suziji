/**
 * 桌面网格常量与坐标换算
 * ------------------------------------------------------------
 * 设计画布 432 × 958（与 UI 稿 864 × 1916 @2x 一致）
 *
 * 数值全部量自 UI 稿（第一页.jpg / 第二页.jpg，2x 图逐像素扫描）：
 *   左右内边距 20、顶部 22
 *   单元格 75.5，横向间距 30（4 列 → 4×75.5 + 3×30 = 392，正好 432 - 20×2）
 *   竖向间距 40（7 行 → 7×75.5 + 6×40 ≈ 768，和稿子里图标排布一致）
 * 桌面元素一律用「设计像素」存储，渲染时乘以 --u 换算成设备像素
 */

export const CANVAS = { w: 432, h: 958 }
export const GRID = {
  cols: 4,
  rows: 7,
  padX: 20, // 左右内边距
  top: 34, // 顶部内边距（状态栏 26 + 8 呼吸）
  gapX: 30, // 横向间距
  gapY: 40, // 竖向间距
  areaH: 768, // 网格区高度（7 行 × 75.5 + 6 × 40）
}

/** 单列宽 / 单行高（设计像素） */
export const CELL_W = (CANVAS.w - GRID.padX * 2 - GRID.gapX * (GRID.cols - 1)) / GRID.cols // 75.5
export const CELL_H = (GRID.areaH - GRID.gapY * (GRID.rows - 1)) / GRID.rows // ≈ 75.43
export const PITCH_X = CELL_W + GRID.gapX
export const PITCH_Y = CELL_H + GRID.gapY

export const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

/** cell → 设计像素矩形（相对网格区左上角） */
export function cellToRect(cell) {
  return {
    left: cell.x * PITCH_X,
    top: cell.y * PITCH_Y,
    width: cell.w * CELL_W + (cell.w - 1) * GRID.gapX,
    height: cell.h * CELL_H + (cell.h - 1) * GRID.gapY,
  }
}

/** 矩形覆盖的所有格子 key */
export function rectKeys(rect, { skip = [] } = {}) {
  const keys = []
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const key = `${x},${y}`
      if (!skip.includes(key)) keys.push(key)
    }
  }
  return keys
}

/** 建立占用表：Map<'x,y', { kind:'widget'|'icon', id }> */
export function buildOccupancy(page, { ignore } = {}) {
  const map = new Map()
  for (const widget of page.widgets) {
    if (ignore === widget.id) continue
    for (const key of rectKeys(widget.cell)) {
      map.set(key, { kind: 'widget', id: widget.id })
    }
  }
  for (const icon of page.icons) {
    if (ignore === icon.appId) continue
    map.set(`${icon.cell.x},${icon.cell.y}`, { kind: 'icon', id: icon.appId })
  }
  return map
}

/** 目标区域是否空闲（返回冲突项） */
export function findConflicts(page, cell, { ignoreWidget, ignoreIcon } = {}) {
  const occ = buildOccupancy(page, { ignore: ignoreWidget ?? ignoreIcon })
  const conflicts = []
  for (const key of rectKeys(cell)) {
    const hit = occ.get(key)
    if (hit) conflicts.push({ key, ...hit })
  }
  return conflicts
}

/** 按阅读顺序列出空闲格子 */
export function freeCells(page, { ignoreWidget } = {}) {
  const occ = buildOccupancy(page, { ignore: ignoreWidget })
  const out = []
  for (let y = 0; y < GRID.rows; y++) {
    for (let x = 0; x < GRID.cols; x++) {
      if (!occ.has(`${x},${y}`)) out.push({ x, y })
    }
  }
  return out
}

/** 指针像素坐标 → 网格坐标（用于拖拽落点） */
export function pointToCell(px, py, size, metrics) {
  const { pitchX, pitchY, colW, rowH } = metrics
  const gapX = metrics.gapX ?? GRID.gapX
  const gapY = metrics.gapY ?? GRID.gapY
  const w = size?.w ?? 1
  const h = size?.h ?? 1
  const x = Math.round((px - (w * colW + (w - 1) * gapX) / 2) / pitchX)
  const y = Math.round((py - (h * rowH + (h - 1) * gapY) / 2) / pitchY)
  return {
    x: clamp(x, 0, GRID.cols - w),
    y: clamp(y, 0, GRID.rows - h),
  }
}
