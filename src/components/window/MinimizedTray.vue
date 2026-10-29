<script setup>
/**
 * 最小化窗口托盘：悬浮在 Dock 上方，点一下恢复
 */
import { computed } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import { getApp } from '@/apps/registry'

const desktop = useDesktopStore()

const items = computed(() =>
  desktop.minimizedWindows
    .map(([appId]) => ({ appId, app: getApp(appId) }))
    .filter((item) => !!item.app),
)
</script>

<template>
  <div v-if="items.length" class="tray">
    <button
      v-for="item in items"
      :key="item.appId"
      class="chip"
      :style="{ '--accent': item.app.accent }"
      @click="desktop.restoreApp(item.appId)"
    >
      <span class="glyph" :class="item.app.icon" />
      <span class="name">{{ item.app.name }}</span>
      <span class="i-ph-arrow-up-right close" @click.stop="desktop.closeApp(item.appId)" />
    </button>
  </div>
</template>

<style scoped>
.tray {
  position: absolute;
  right: calc(var(--u) * 16);
  bottom: calc(var(--u) * 106);
  left: calc(var(--u) * 16);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: calc(var(--u) * 8);
  pointer-events: none;
}

.chip {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 6);
  height: calc(var(--u) * 30);
  padding: 0 calc(var(--u) * 10);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(calc(var(--u) * 16));
  -webkit-backdrop-filter: blur(calc(var(--u) * 16));
  font-size: calc(var(--u) * 11);
  color: var(--c-text);
  pointer-events: auto;
}

.glyph {
  font-size: calc(var(--u) * 13);
  color: color-mix(in srgb, var(--accent) 85%, #6f5a66);
}

.close {
  font-size: calc(var(--u) * 11);
  opacity: 0.45;
}
</style>
