<script setup>
/**
 * 第二页小图卡（2 × 2）：白色图片区 + 下方可写字
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
  <div class="photo-card">
    <div class="frame">
      <ImageSlot
        tone="solid"
        :radius="24"
        :model-value="cfg.image"
        @update:model-value="(value) => set({ image: value })"
      />
    </div>
    <div class="caption">
      <EditableText
        align="left"
        placeholder="记录点什么"
        :model-value="cfg.text ?? ''"
        @update:model-value="(value) => set({ text: value })"
      />
    </div>
  </div>
</template>

<style scoped>
.photo-card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 10);
  width: 100%;
  height: 100%;
  padding: calc(var(--u) * 10);
  border-radius: calc(var(--u) * 26);
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(calc(var(--u) * 16)) saturate(1.1);
  -webkit-backdrop-filter: blur(calc(var(--u) * 16)) saturate(1.1);
}

/* 图片区占 2/3，下方留给手写文字（对齐 UI 稿 128 / 200） */
.frame {
  flex: none;
  height: 72%;
}

.caption {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 calc(var(--u) * 4);
  font-family: 'Cormorant Garamond', Georgia, 'Songti SC', serif;
  font-style: italic;
  font-size: calc(var(--u) * 15);
  color: rgba(124, 101, 112, 0.55);
}
</style>
