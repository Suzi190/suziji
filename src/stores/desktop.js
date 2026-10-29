/**
 * 桌面状态仓库
 * ------------------------------------------------------------
 * 负责：
 * 1. 两页布局（图标 / 小组件 / Dock）与壁纸、系统设置
 * 2. 拖拽落点的合法性判断与「交换 / 挤出重排」算法
 * 3. App 全屏页面的开、关、最小化、层级
 * 4. 全部状态持久化到 localStorage（刷新 / 重启自动还原）
 *
 * 约定：所有坐标、尺寸都使用「设计像素」（画布 432 × 958），
 *      渲染时乘以 --u 换算成设备像素，跨设备布局一致。
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { DOCK_IDS, getApp } from '@/apps/registry'
import { CANVAS, GRID, buildOccupancy, findConflicts, rectKeys } from '@/utils/grid'
import { loadJSON, saveJSON } from '@/utils/storage'

const STORAGE_KEY = 'vphone.desktop.v1'
/**
 * 3：首页大组件固定 4×5（宽 4 格 × 高 5 格），图标回到第 5 / 6 行
 *    （v2 曾试过 4×4，高度不够、五个小圆被迫缩小，已回退）
 */
const LAYOUT_VERSION = 3

/** 默认布局：完全对齐 UI 稿 */
function defaultLayout() {
  return {
    version: LAYOUT_VERSION,
    wallpaper: { type: 'gradient', value: 'rose' },
    settings: {
      showLabels: false, // 图标文字（UI 稿默认不显示）
      haptics: true, // 震动反馈
      animation: true, // 桌面动效
      statusBar: true, // 顶部状态栏浮层
    },
    pages: [
      // ===== 第 1 页 =====
      {
        id: 'p1',
        widgets: [
          {
            id: 'w-hero',
            type: 'hero',
            cell: { x: 0, y: 0, w: 4, h: 5 },
            props: {
              avatars: [null, null],
              photo: null,
              sticker: null,
              photos: [null, null, null, null, null],
              slogan: 'Happy every day',
            },
          },
        ],
        icons: [
          { appId: 'wechat', cell: { x: 0, y: 5 } },
          { appId: 'mall', cell: { x: 1, y: 5 } },
          { appId: 'academy', cell: { x: 2, y: 5 } },
          { appId: 'forum', cell: { x: 3, y: 5 } },
          { appId: 'textgame', cell: { x: 0, y: 6 } },
          { appId: 'douyin', cell: { x: 1, y: 6 } },
          { appId: 'twitter', cell: { x: 2, y: 6 } },
          { appId: 'couple', cell: { x: 3, y: 6 } },
        ],
      },
      // ===== 第 2 页 =====
      {
        id: 'p2',
        widgets: [
          {
            id: 'w-hero2',
            type: 'hero2',
            cell: { x: 0, y: 0, w: 4, h: 4 },
            props: {
              banner: null,
              photos: [null, null, null],
              slogan: 'Happy happy every day.',
            },
          },
          {
            id: 'w-pill',
            type: 'pill',
            cell: { x: 0, y: 4, w: 4, h: 1 },
            props: { image: null, text: 'Want to eat cake' },
          },
          {
            id: 'w-photo',
            type: 'photo',
            cell: { x: 0, y: 5, w: 2, h: 2 },
            props: { image: null, text: '记录每一个好天气' },
          },
        ],
        icons: [
          { appId: 'bureau', cell: { x: 2, y: 5 } },
          { appId: 'game', cell: { x: 3, y: 5 } },
          { appId: 'tarot', cell: { x: 2, y: 6 } },
          { appId: 'memo', cell: { x: 3, y: 6 } },
        ],
      },
    ],
    dock: [...DOCK_IDS],
    windows: {},
  }
}

/**
 * 窗口状态归一化
 * ------------------------------------------------------------
 * App 已改成整屏打开，历史存档里的 x / y / w / h 全部作废；
 * 同时把打开状态复位成「关闭」，刷新后回到桌面，而不是卡在某个 App 里
 */
function normalizeWindows(saved) {
  const out = {}
  if (!saved || typeof saved !== 'object') return out
  for (const [appId, win] of Object.entries(saved)) {
    if (!win || !getApp(appId)) continue
    out[appId] = { open: false, minimized: false, z: Number(win.z) || 0 }
  }
  return out
}

/**
 * 老存档升级（→ v3）
 * ------------------------------------------------------------
 * v1：本来就是 4×5 + 图标在第 5 / 6 行，只补版本号
 * v2：那一版把首页大组件错压成 4×4、图标整体上移了一行，这里还原回 4×5
 * 只改几何，壁纸 / 设置 / 各组件里已选的图片和文字全部保留
 */
function migrateLayout(saved) {
  const version = Number(saved.version) || 1
  const pages = (saved.pages ?? []).map((page) => ({ ...page }))
  const first = pages[0]
  // 只有 v2 需要还原来：它的首页大组件是 4 行
  if (version === 2 && first) {
    if (Array.isArray(first.widgets)) {
      first.widgets = first.widgets.map((widget) =>
        widget?.type === 'hero' && (widget.cell?.h ?? 0) < 5
          ? { ...widget, cell: { ...widget.cell, h: 5 } }
          : widget,
      )
    }
    if (Array.isArray(first.icons)) {
      first.icons = first.icons.map((icon) =>
        (icon?.cell?.y ?? 0) >= 4
          ? {
              ...icon,
              // 顶到网格最后一行就不再往下推，避免溢出 7 行
              cell: { ...icon.cell, y: Math.min(icon.cell.y + 1, GRID.rows - 1) },
            }
          : icon,
      )
    }
  }
  return { ...saved, version: LAYOUT_VERSION, pages }
}

/** 合并存档与默认布局，容错处理（版本升级 / 数据损坏 / 新增 App） */
function restoreLayout() {
  const base = defaultLayout()
  let saved = loadJSON(STORAGE_KEY, null)
  if (!saved) return base
  if ((Number(saved.version) || 1) < LAYOUT_VERSION) {
    saved = migrateLayout(saved)
    // 迁移结果立刻落盘：避免每次启动都重复迁移
    saveJSON(STORAGE_KEY, saved)
  }
  if (Number(saved.version) !== LAYOUT_VERSION) return base
  try {
    return {
      ...base,
      ...saved,
      settings: { ...base.settings, ...(saved.settings ?? {}) },
      wallpaper: { ...base.wallpaper, ...(saved.wallpaper ?? {}) },
      windows: normalizeWindows(saved.windows),
      dock: Array.isArray(saved.dock) && saved.dock.length ? saved.dock : base.dock,
      pages: base.pages.map((page, index) => {
        const item = saved.pages?.[index]
        if (!item) return page
        const widgets = (item.widgets ?? []).filter((w) =>
          base.pages.some((p) => p.widgets.some((d) => d.type === w.type)),
        )
        const icons = (item.icons ?? []).filter((icon) => !!getApp(icon.appId))
        return {
          ...page,
          widgets: widgets.length ? widgets : page.widgets,
          icons: icons.length ? icons : page.icons,
        }
      }),
    }
  } catch (err) {
    console.warn('[desktop] 存档解析失败，回退默认布局', err)
    return base
  }
}

export const useDesktopStore = defineStore('desktop', () => {
  // ---------------- state ----------------
  /** 1 设计像素 = 多少设备像素（PhoneShell 负责写入） */
  const unit = ref(1)
  const layout = ref(restoreLayout())
  const zSeed = ref(
    Object.values(layout.value.windows ?? {}).reduce((max, win) => Math.max(max, win.z ?? 0), 10),
  )
  /** 当前正在拖拽的元素，用于拖拽态样式与全局锁定 */
  const dragging = ref(null)
  /** 拖拽中的落点预览 { page, cell, ok, kind } */
  const dropPreview = ref(null)
  /** 网格区实测尺寸（设备像素），由 DesktopPage 写入，保证任意屏幕比例都精确对齐 */
  const gridSize = ref({ w: 0, h: 0 })

  // ---------------- getters ----------------
  const pages = computed(() => layout.value.pages)
  const dock = computed(() => layout.value.dock)
  const windows = computed(() => layout.value.windows)
  const settings = computed(() => layout.value.settings)
  const wallpaper = computed(() => layout.value.wallpaper)

  /** 网格渲染所需的像素尺寸（优先使用实测值） */
  const metrics = computed(() => {
    const gapX = GRID.gapX * unit.value
    const gapY = GRID.gapY * unit.value
    const width = gridSize.value.w || (CANVAS.w - GRID.padX * 2) * unit.value
    const height = gridSize.value.h || GRID.areaH * unit.value
    const colW = (width - gapX * (GRID.cols - 1)) / GRID.cols
    const rowH = (height - gapY * (GRID.rows - 1)) / GRID.rows
    return {
      colW,
      rowH,
      gapX,
      gapY,
      width,
      height,
      pitchX: colW + gapX,
      pitchY: rowH + gapY,
    }
  })

  /** 已打开的窗口（按层级升序，最后渲染在最上层） */
  const openWindows = computed(() =>
    Object.entries(layout.value.windows)
      .filter(([, win]) => win?.open)
      .sort((a, b) => (a[1].z ?? 0) - (b[1].z ?? 0)),
  )

  const minimizedWindows = computed(() =>
    Object.entries(layout.value.windows).filter(([, win]) => win?.open && win?.minimized),
  )

  // ---------------- 基础 ----------------
  function setUnit(next) {
    if (!Number.isFinite(next) || next <= 0) return
    unit.value = next
  }

  function setGridSize(w, h) {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
    if (gridSize.value.w === w && gridSize.value.h === h) return
    gridSize.value = { w, h }
  }

  function setSetting(key, value) {
    layout.value.settings[key] = value
  }

  function setWallpaper(patch) {
    layout.value.wallpaper = { ...layout.value.wallpaper, ...patch }
  }

  function resetLayout() {
    layout.value = defaultLayout()
    zSeed.value = 10
  }

  // ---------------- 拖拽：图标 ----------------
  /**
   * 移动图标：空格直接移动；落在其他图标上则交换；落在组件上则拒绝
   */
  function moveIcon({ fromPage, appId, toPage, cell }) {
    const from = pages.value[fromPage]
    const to = pages.value[toPage]
    if (!from || !to) return false
    const icon = from.icons.find((item) => item.appId === appId)
    if (!icon) return false

    const occupancy = buildOccupancy(to, { ignore: appId })
    const hit = occupancy.get(`${cell.x},${cell.y}`)
    if (hit?.kind === 'widget') return false

    if (hit?.kind === 'icon') {
      const other = to.icons.find((item) => item.appId === hit.id)
      if (!other) return false
      if (fromPage === toPage) {
        other.cell = { ...icon.cell }
      } else {
        // 跨页交换：对方回到本图标原来的位置
        to.icons = to.icons.filter((item) => item.appId !== other.appId)
        from.icons.push({ ...other, cell: { ...icon.cell } })
      }
    }

    from.icons = from.icons.filter((item) => item.appId !== appId)
    to.icons.push({ ...icon, cell: { x: cell.x, y: cell.y } })
    return true
  }

  /** 图标改名（仅影响桌面显示） */
  function renameIcon(appId, name) {
    for (const page of pages.value) {
      const icon = page.icons.find((item) => item.appId === appId)
      if (icon) {
        icon.customName = name?.trim() || undefined
        return true
      }
    }
    return false
  }

  /** 从桌面移除图标（设置页「恢复默认布局」可还原） */
  function removeIcon(pageIndex, appId) {
    const page = pages.value[pageIndex]
    if (!page) return false
    page.icons = page.icons.filter((item) => item.appId !== appId)
    return true
  }

  /** 试算落点是否合法（拖拽中的高亮预览用） */
  function canDrop({ kind, pageIndex, id, cell }) {
    const page = pages.value[pageIndex]
    if (!page) return false
    if (kind === 'icon') {
      const occupancy = buildOccupancy(page, { ignore: id })
      const hit = occupancy.get(`${cell.x},${cell.y}`)
      return hit?.kind !== 'widget'
    }
    const widget = page.widgets.find((item) => item.id === id)
    if (!widget) return false
    const next = { ...widget.cell, x: cell.x, y: cell.y }
    const conflicts = findConflicts(page, next, { ignoreWidget: id })
    if (conflicts.some((item) => item.kind === 'widget')) return false
    const nextKeys = new Set(rectKeys(next))
    const freedCount = rectKeys(widget.cell).filter((key) => !nextKeys.has(key)).length
    return conflicts.filter((item) => item.kind === 'icon').length <= freedCount
  }

  // ---------------- 拖拽：小组件 ----------------
  /**
   * 移动小组件：目标区域必须没有其他组件；
   * 若压到图标，则把图标「挤出」到组件腾出的空位里（放不下就整体回弹）
   */
  function moveWidget({ pageIndex, widgetId, cell }) {
    const page = pages.value[pageIndex]
    const widget = page?.widgets.find((item) => item.id === widgetId)
    if (!widget) return false

    const prev = { ...widget.cell }
    const next = { ...prev, x: cell.x, y: cell.y }
    const conflicts = findConflicts(page, next, { ignoreWidget: widgetId })
    if (conflicts.some((item) => item.kind === 'widget')) return false

    const iconsHit = conflicts.filter((item) => item.kind === 'icon')
    const nextKeys = new Set(rectKeys(next))
    const freed = rectKeys(prev)
      .filter((key) => !nextKeys.has(key))
      .map((key) => {
        const [x, y] = key.split(',').map(Number)
        return { x, y }
      })
    if (iconsHit.length > freed.length) return false

    widget.cell = next
    iconsHit.forEach((hit, index) => {
      const icon = page.icons.find((item) => item.appId === hit.id)
      if (icon) icon.cell = { ...freed[index] }
    })
    return true
  }

  function setWidgetProps(widgetId, patch) {
    for (const page of pages.value) {
      const widget = page.widgets.find((item) => item.id === widgetId)
      if (widget) {
        widget.props = { ...widget.props, ...patch }
        return true
      }
    }
    return false
  }

  // ---------------- App 全屏页面 ----------------
  function openApp(appId) {
    const app = getApp(appId)
    if (!app) return
    const win = layout.value.windows[appId]
    if (win) {
      win.open = true
      win.minimized = false
      win.z = ++zSeed.value
      return
    }
    layout.value.windows[appId] = { open: true, minimized: false, z: ++zSeed.value }
  }

  function closeApp(appId) {
    const win = layout.value.windows[appId]
    if (!win) return
    win.open = false
    win.minimized = false
  }

  function minimizeApp(appId) {
    const win = layout.value.windows[appId]
    if (!win) return
    win.minimized = true
  }

  function restoreApp(appId) {
    const win = layout.value.windows[appId]
    if (!win) return
    win.open = true
    win.minimized = false
    win.z = ++zSeed.value
  }

  function focusApp(appId) {
    const win = layout.value.windows[appId]
    if (!win) return
    // 已经在最上层就不重复抬升，避免无意义的写入与持久化
    const maxZ = Object.values(layout.value.windows).reduce(
      (max, item) => Math.max(max, item?.z ?? 0),
      0,
    )
    zSeed.value = Math.max(zSeed.value, maxZ)
    if (win.z >= maxZ) {
      win.z = maxZ
      return
    }
    win.z = ++zSeed.value
  }

  // ---------------- 持久化 ----------------
  let saveTimer = null
  watch(
    layout,
    (value) => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => saveJSON(STORAGE_KEY, value), 250)
    },
    { deep: true },
  )

  return {
    // state
    unit,
    layout,
    dragging,
    dropPreview,
    gridSize,
    // getters
    pages,
    dock,
    windows,
    settings,
    wallpaper,
    metrics,
    openWindows,
    minimizedWindows,
    // actions
    setUnit,
    setGridSize,
    setSetting,
    setWallpaper,
    resetLayout,
    moveIcon,
    renameIcon,
    removeIcon,
    moveWidget,
    canDrop,
    setWidgetProps,
    openApp,
    closeApp,
    minimizeApp,
    restoreApp,
    focusApp,
  }
})
