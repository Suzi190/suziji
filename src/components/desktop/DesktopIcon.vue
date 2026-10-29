<script setup>
/**
 * 桌面图标：可长按拖拽排序
 * 轻点 = 打开 App；长按 450ms 抬起 = 呼出菜单；长按后拖动 = 移动 / 交换
 */
import { computed, ref } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import { getApp } from '@/apps/registry'
import { useDragGrid } from '@/composables/useDragGrid'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  icon: { type: Object, required: true },
  pageIndex: { type: Number, required: true },
  gridEl: { type: Object, default: null },
})

const emit = defineEmits(['hold'])

const desktop = useDesktopStore()
const app = computed(() => getApp(props.icon.appId))
const el = ref(null)

const cell = computed(() => ({ x: props.icon.cell.x, y: props.icon.cell.y }))
const size = computed(() => ({ w: 1, h: 1 }))

const { boxStyle, isActive } = useDragGrid({
  kind: 'icon',
  pageIndex: props.pageIndex,
  id: props.icon.appId,
  cell,
  size,
  gridEl: () => props.gridEl,
  target: el,
  onTap: () => desktop.openApp(props.icon.appId),
  onHold: (event) => emit('hold', { appId: props.icon.appId, event }),
})

const label = computed(() => props.icon.customName || app.value?.name || '')
</script>

<template>
  <div
    v-if="app"
    ref="el"
    class="desktop-icon"
    :class="{ 'is-active': isActive, 'has-label': desktop.settings.showLabels }"
    :style="boxStyle"
    @contextmenu.prevent
  >
    <div class="tile">
      <AppIcon :app="app" />
    </div>
    <span v-if="desktop.settings.showLabels" class="label">{{ label }}</span>
  </div>
</template>

<style scoped>
.desktop-icon {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--u) * 4);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.tile {
  /* 与 Dock 图标共用 --icon-size，桌面上下一视觉一致 */
  flex: none;
  width: var(--icon-size);
  height: var(--icon-size);
}

/* 打开「显示图标名称」时只收紧行距，图标本身不缩小 */
.desktop-icon.has-label {
  gap: calc(var(--u) * 3);
  justify-content: flex-start;
  padding-top: calc(var(--u) * 2);
}

.desktop-icon.is-active {
  z-index: 30;
}

.desktop-icon.is-active .tile > :deep(.app-icon) {
  transform: scale(1.08);
  box-shadow: var(--shadow-drag);
}

.label {
  font-size: calc(var(--u) * 11);
  line-height: 1.2;
  color: var(--c-text-soft);
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
