<script setup>
/**
 * 状态栏：时间 + 信号 / WiFi / 电量
 * 悬浮在壁纸与 App 页面之上（z 高于窗口层），指针穿透，不挡交互
 */
import { computed } from 'vue'
import { useNow } from '@vueuse/core'
import { useDesktopStore } from '@/stores/desktop'

const desktop = useDesktopStore()
const now = useNow({ interval: 20000 })

const time = computed(() =>
  new Date(now.value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }),
)
</script>

<template>
  <div v-if="desktop.settings.statusBar" class="status-bar">
    <span class="time">{{ time }}</span>
    <span class="icons">
      <span class="i-ph-cell-signal-full" />
      <span class="i-ph-wifi-high" />
      <span class="i-ph-battery-full" />
    </span>
  </div>
</template>

<style scoped>
.status-bar {
  position: absolute;
  inset: 0 0 auto 0;
  /* 高于窗口层（20）：App 全屏时时间和电量也要露出来 */
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: calc(var(--u) * 26);
  padding: 0 calc(var(--u) * 26);
  pointer-events: none;
  color: var(--c-text-soft);
}

.time {
  font-size: calc(var(--u) * 12);
  font-weight: 600;
  letter-spacing: calc(var(--u) * 0.2);
  font-variant-numeric: tabular-nums;
}

.icons {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 4);
  font-size: calc(var(--u) * 13);
}
</style>
