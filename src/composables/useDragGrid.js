/**
 * 桌面网格拖拽（图标 / 小组件共用）
 * ------------------------------------------------------------
 * 基于 @vueuse/core 的 useDraggable 实现，不手写原生拖拽：
 * 1. 长按 450ms 才进入拖拽（单击 = 打开 App / 编辑）
 * 2. 拖拽范围限制在网格容器内（containerElement）
 * 3. 松手时按「四舍五入」吸附到最近的格子，并回写 store
 * 4. 落点不合法时，用 180ms 缓动动画回弹到原位
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDraggable } from '@vueuse/core'
import { useDesktopStore } from '@/stores/desktop'
import { pointToCell } from '@/utils/grid'

const LONG_PRESS_MS = 450
const MOVE_TOLERANCE = 8

export function useDragGrid({
  kind,
  pageIndex,
  id,
  cell,
  size,
  gridEl,
  target,
  handle,
  onTap,
  onHold,
}) {
  const store = useDesktopStore()
  /**
   * 网格度量：Pinia 会把 setup store 里返回的 computed 自动解包成普通对象，
   * 所以这里必须每次实时读取（函数取值），不能缓存成快照，否则改尺寸 / 旋转屏幕后不更新。
   */
  const metrics = () => store.metrics

  /** 网格 DOM 元素（父组件通过 props 传进来，可能是函数 / ref / 元素） */
  const gridNode = () => {
    const raw = typeof gridEl === 'function' ? gridEl() : gridEl
    return raw?.value ?? raw ?? null
  }

  /** 横向分页容器，用于「在图标上左右滑也能翻页」 */
  const pagerNode = () => gridNode()?.closest('.scroller') ?? null

  const armed = ref(false) // 长按已触发 → 可以移动
  const moved = ref(0) // 按下后的最大位移，用于区分点击
  const snapping = ref(false) // 吸附动画进行中

  let pressTimer = null
  let startPoint = null
  let pagerStart = null
  let paged = false

  const originOf = (c) => {
    const { pitchX, pitchY } = metrics()
    return { x: c.x * pitchX, y: c.y * pitchY }
  }

  function clearPress() {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
  }

  /** 触碰反馈 */
  function haptic() {
    if (store.settings.haptics && typeof navigator.vibrate === 'function') navigator.vibrate(10)
  }

  function startPress() {
    clearPress()
    pressTimer = setTimeout(() => {
      armed.value = true
      store.dragging = { kind, id, page: pageIndex }
      haptic()
    }, LONG_PRESS_MS)
  }

  /** 落点预览：给页面上的高亮格子用 */
  function updatePreview(pos) {
    const drop = pointToCell(pos.x, pos.y, size.value, metrics())
    store.dropPreview = {
      page: pageIndex,
      kind,
      cell: drop,
      w: size.value.w,
      h: size.value.h,
      ok: store.canDrop({ kind, pageIndex, id, cell: drop }),
    }
  }

  /** 松手吸附（left/top 过渡动画） */
  function snapTo(origin) {
    const el = target.value
    if (!el) return
    snapping.value = true
    el.style.transition = `left ${store.settings.animation ? 180 : 0}ms cubic-bezier(.2,.8,.2,1), top ${
      store.settings.animation ? 180 : 0
    }ms cubic-bezier(.2,.8,.2,1)`
    position.value = { ...origin }
    setTimeout(() => {
      if (el) el.style.transition = ''
      snapping.value = false
    }, 200)
  }

  const { position, isDragging } = useDraggable(target, {
    handle,
    // 传函数让 useDraggable 每次取值都能拿到最新的网格元素（首帧可能还没挂载）
    containerElement: () => gridNode() ?? undefined,
    preventDefault: true,
    capture: false,
    initialValue: originOf(cell.value),

    onStart(_pos, event) {
      armed.value = false
      moved.value = 0
      paged = false
      startPoint = { x: event.clientX, y: event.clientY }
      pagerStart = { left: pagerNode()?.scrollLeft ?? 0 }
      startPress()
    },

    onMove(_pos, event) {
      const distance = Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y)
      moved.value = Math.max(moved.value, distance)

      // 未长按：保持原位，只统计位移；位移过大则取消长按（视作滑动）
      if (!armed.value) {
        if (moved.value > MOVE_TOLERANCE) clearPress()

        // 左右滑 → 手动带动分页容器（图标铺满屏幕，靠 touch-action: none 接管手势）
        const pager = pagerNode()
        const dx = event.clientX - startPoint.x
        const dy = event.clientY - startPoint.y
        if (pager && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          paged = true
          pager.scrollLeft = pagerStart.left - dx
        }

        position.value = originOf(cell.value)
        return
      }
      updatePreview(position.value)
    },

    onEnd(_pos, event) {
      clearPress()
      const wasArmed = armed.value
      armed.value = false
      store.dragging = null
      store.dropPreview = null

      // 轻点：交给业务（打开 App / 编辑文字）
      if (!wasArmed) {
        const distance = startPoint
          ? Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y)
          : 0
        if (paged) {
          const pager = pagerNode()
          if (pager) {
            pager.scrollTo({
              left: Math.round(pager.scrollLeft / pager.clientWidth) * pager.clientWidth,
              behavior: store.settings.animation ? 'smooth' : 'auto',
            })
          }
        } else if (distance <= MOVE_TOLERANCE) {
          onTap?.(event)
        }
        snapTo(originOf(cell.value))
        return
      }

      // 长按后原地松手 = 呼出上下文（改名 / 移除）
      if (moved.value <= MOVE_TOLERANCE + 4) {
        onHold?.(event)
        snapTo(originOf(cell.value))
        return
      }

      const drop = pointToCell(position.value.x, position.value.y, size.value, metrics())
      const ok =
        kind === 'icon'
          ? store.moveIcon({ fromPage: pageIndex, appId: id, toPage: pageIndex, cell: drop })
          : store.moveWidget({ pageIndex, widgetId: id, cell: drop })

      // 落点成功 → 吸附到目标格；失败 → 回弹原位
      const targetCell = ok ? { ...cell.value, x: drop.x, y: drop.y } : cell.value
      snapTo(originOf(targetCell))
    },
  })

  // 布局变化（换格 / 旋转屏幕 / 窗口尺寸变化）时同步元素位置
  watch(
    [cell, () => metrics()],
    () => {
      if (isDragging.value || snapping.value) return
      position.value = originOf(cell.value)
    },
    { deep: true, immediate: true },
  )

  onBeforeUnmount(clearPress)

  /** 元素的绝对定位样式（像素） */
  const boxStyle = computed(() => {
    const { colW, rowH, gapX, gapY } = metrics()
    return {
      left: `${position.value.x}px`,
      top: `${position.value.y}px`,
      width: `${size.value.w * colW + (size.value.w - 1) * gapX}px`,
      height: `${size.value.h * rowH + (size.value.h - 1) * gapY}px`,
    }
  })

  return {
    boxStyle,
    position,
    armed,
    isDragging,
    isActive: computed(() => armed.value && isDragging.value),
  }
}
