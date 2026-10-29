<script setup>
/**
 * 图标上下文菜单（长按图标后原地松手呼出）
 * 打开 / 重命名 / 移到另一页 / 从桌面移除
 */
import { computed } from 'vue'
import { useDesktopStore } from '@/stores/desktop'

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  pageIndex: { type: Number, required: true },
  pages: { type: Number, default: 2 },
})

defineEmits(['select', 'close'])

const desktop = useDesktopStore()

const items = computed(() => {
  const list = [
    { action: 'open', label: '打开', icon: 'i-ph-arrow-up-right' },
    { action: 'rename', label: '重命名', icon: 'i-ph-pencil-simple' },
  ]
  for (let index = 0; index < props.pages; index++) {
    if (index === props.pageIndex) continue
    list.push({
      action: `move:${index}`,
      label: `移到第 ${index + 1} 页`,
      icon: 'i-ph-arrows-out-line-horizontal',
    })
  }
  list.push({ action: 'remove', label: '从桌面移除', icon: 'i-ph-trash', danger: true })
  return list
})

const style = computed(() => {
  const unit = desktop.unit
  const width = 138 * unit
  const height = (items.value.length * 34 + 14) * unit
  const maxW = desktop.metrics.width
  const maxH = desktop.metrics.height
  return {
    width: `${width}px`,
    left: `${Math.max(0, Math.min(props.x, maxW - width))}px`,
    top: `${Math.max(0, Math.min(props.y, maxH - height))}px`,
  }
})
</script>

<template>
  <div class="menu-mask" @pointerdown.stop @click.self="$emit('close')">
    <div class="menu" :style="style">
      <button
        v-for="item in items"
        :key="item.action"
        class="item"
        :class="{ danger: item.danger }"
        @click.stop="$emit('select', item.action)"
      >
        <span class="icon" :class="item.icon" />
        <span class="label">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.menu-mask {
  position: absolute;
  inset: 0;
  z-index: 50;
}

.menu {
  position: absolute;
  padding: calc(var(--u) * 6);
  border-radius: calc(var(--u) * 16);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(calc(var(--u) * 20)) saturate(1.2);
  -webkit-backdrop-filter: blur(calc(var(--u) * 20)) saturate(1.2);
  animation: menu-in 0.14s ease-out;
}

@keyframes menu-in {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.item {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 8);
  width: 100%;
  height: calc(var(--u) * 30);
  padding: 0 calc(var(--u) * 8);
  border-radius: calc(var(--u) * 10);
  font-size: calc(var(--u) * 12);
  color: var(--c-text);
  text-align: left;
}

.item:active {
  background: rgba(247, 168, 190, 0.16);
}

.item.danger {
  color: #c9738a;
}

.icon {
  font-size: calc(var(--u) * 13);
  opacity: 0.75;
}

.label {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
