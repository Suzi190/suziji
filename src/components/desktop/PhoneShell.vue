<script setup>
/**
 * 手机外壳
 * ------------------------------------------------------------
 * PC：居中显示 432 × 958 的手机框（等比缩放，永不出现滚动条）
 * 手机浏览器 / PWA：铺满全屏，圆角归零，等效原生
 * 通过实测宽度写入 store.unit，所有像素尺寸都由设计像素换算而来
 */
import { onMounted, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useDesktopStore } from '@/stores/desktop'
import { CANVAS } from '@/utils/grid'
import Wallpaper from './Wallpaper.vue'
import StatusBar from './StatusBar.vue'
import DesktopPages from './DesktopPages.vue'
import DockBar from './DockBar.vue'
import WindowLayer from '@/components/window/WindowLayer.vue'

const desktop = useDesktopStore()
const phoneEl = ref(null)
const { width } = useElementSize(phoneEl)

watch(
  width,
  (value) => {
    if (value > 0) desktop.setUnit(value / CANVAS.w)
  },
  { immediate: true },
)

// ResizeObserver 要等下一次绘制才回调，首帧这段空窗期里 CSS 的 --u 已是终值、
// store.unit 还是旧值（默认 1），图标会先按错误尺寸闪一下。
// 挂载时直接量一次真实宽度（getBoundingClientRect 不依赖绘制），把这个窗口抹平。
onMounted(() => {
  const measured = phoneEl.value?.getBoundingClientRect().width ?? 0
  if (measured > 0) desktop.setUnit(measured / CANVAS.w)
})
</script>

<template>
  <div class="stage">
    <div ref="phoneEl" class="phone">
      <Wallpaper />
      <StatusBar />
      <DesktopPages />
      <DockBar />
      <WindowLayer />
    </div>
  </div>
</template>

<style scoped>
.stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}

.phone {
  /* 以宽度为基准：432 × 958（比例 0.451） */
  --phone-w: min(432px, 100vw, calc(100dvh * 0.451));
  --u: calc(var(--phone-w) / 432);
  /* 桌面图标 / Dock 图标共用的方块尺寸：必须跟着 --u 走，所以声明在 .phone 里 */
  --icon-size: calc(var(--u) * 58);

  position: relative;
  display: flex;
  flex-direction: column;
  width: var(--phone-w);
  height: calc(var(--phone-w) * 2.2176);
  overflow: hidden;
  border-radius: calc(var(--u) * 46);
  background: var(--c-bg);
  isolation: isolate;
  /* PC 上给手机框一圈极淡的边，和背景区分开（静态无投影） */
  outline: 1px solid rgba(255, 255, 255, 0.5);
}

/* 手机 / 窄屏：真正的全屏，无圆角无边框 */
@media (max-width: 640px), (pointer: coarse) and (max-width: 900px) {
  .stage {
    height: 100dvh;
  }

  .phone {
    --phone-w: 100vw;
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
    outline: none;
  }
}
</style>
