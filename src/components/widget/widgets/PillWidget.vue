<script setup>
/**
 * 第二页胶囊条（4 × 1）：左边圆形图 + 右边可编辑文字
 */
import { useDesktopStore } from '@/stores/desktop'
import ImageSlot from '../parts/ImageSlot.vue'
import EditableText from '../parts/EditableText.vue'

const props = defineProps({
  cfg: { type: Object, default: () => ({}) },
  widgetId: { type: String, required: true },
})

const desktop = useDesktopStore()
const set = (patch) => desktop.setWidgetProps(props.widgetId, patch)
</script>

<template>
  <div class="pill-wrap">
    <div class="pill">
      <div class="dot">
        <ImageSlot
          shape="circle"
          tone="solid"
          :radius="999"
          :model-value="cfg.image"
          @update:model-value="(value) => set({ image: value })"
        />
      </div>
      <div class="text">
        <EditableText
          align="center"
          placeholder="想写点什么"
          :model-value="cfg.text ?? ''"
          @update:model-value="(value) => set({ text: value })"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 4×1 胶囊条：只占一行的 76%，两侧留白，避免显得又粗又胖 */
.pill-wrap {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
}

.pill {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 14);
  width: 100%;
  height: 76%;
  padding: 0 calc(var(--u) * 12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.46);
  border: 1px solid rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(calc(var(--u) * 18)) saturate(1.14);
  -webkit-backdrop-filter: blur(calc(var(--u) * 18)) saturate(1.14);
}

/* 圆形图片位：高度决定直径，确保正圆 */
.dot {
  flex: none;
  height: 74%;
  aspect-ratio: 1 / 1;
}

.text {
  flex: 1;
  min-width: 0;
  padding-right: calc(var(--u) * 16);
  font-family: 'Cormorant Garamond', Georgia, 'Songti SC', serif;
  font-style: italic;
  font-size: calc(var(--u) * 21);
  letter-spacing: calc(var(--u) * 0.4);
  color: rgba(124, 101, 112, 0.6);
}
</style>
