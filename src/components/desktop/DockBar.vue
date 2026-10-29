<script setup>
/**
 * 底部 Dock（两页共享，固定 4 个 App）
 */
import { computed } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import { getApp } from '@/apps/registry'
import AppIcon from '@/components/common/AppIcon.vue'

const desktop = useDesktopStore()
const apps = computed(() => desktop.dock.map((id) => getApp(id)).filter(Boolean))
</script>

<template>
  <div class="dock-wrap">
    <div class="dock">
      <button
        v-for="app in apps"
        :key="app.id"
        class="dock-item"
        :aria-label="app.name"
        @click="desktop.openApp(app.id)"
      >
        <AppIcon :app="app" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.dock-wrap {
  position: relative;
  z-index: 3;
  padding: 0 calc(var(--u) * 20) calc(var(--u) * 22);
}

.dock {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--u) * 28);
  height: calc(var(--u) * 84);
  padding: 0 calc(var(--u) * 20);
  border-radius: calc(var(--u) * 28);
  background: rgba(255, 255, 255, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(calc(var(--u) * 20)) saturate(1.16);
  -webkit-backdrop-filter: blur(calc(var(--u) * 20)) saturate(1.16);
}

/* 与桌面图标共用 --icon-size：一排四个（个数固定，不随截图参考增减） */
.dock-item {
  flex: none;
  width: var(--icon-size);
  height: var(--icon-size);
  transition: transform 0.16s ease;
}

.dock-item:active {
  transform: scale(0.94);
}
</style>
