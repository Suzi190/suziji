<script setup>
/**
 * 窗口层：全屏 App 层
 * ------------------------------------------------------------
 * App 现在整屏打开，同一时间只显示层级最高的那一个；
 * 关掉它，桌面上「下面那个」App 会顶上来（类似真机的返回栈）。
 * 层本身指针穿透（pointer-events: none），由 App 页面自己开启交互。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import AppWindow from './AppWindow.vue'
import MinimizedTray from './MinimizedTray.vue'

const desktop = useDesktopStore()

/** 前台 App：已打开、未最小化的窗口里层级最高的一个 */
const top = computed(() => {
  const list = desktop.openWindows.filter(([, win]) => !win.minimized)
  return list.length ? list[list.length - 1] : null
})

/** PC 上按 Esc 直接回桌面（手机上用顶部返回 / 底部 Home 条） */
function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (top.value) desktop.closeApp(top.value[0])
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="window-layer">
    <AppWindow v-if="top" :key="top[0]" :app-id="top[0]" :win="top[1]" />
    <MinimizedTray />
  </div>
</template>

<style scoped>
.window-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
}
</style>
