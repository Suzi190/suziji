<script setup>
/**
 * 第二页大组件（4 × 4）
 * 内部是 4 行网格，和桌面网格同构：
 *   第 1 行：横幅图
 *   第 2~3 行：三张等大的竖图并排
 *   第 4 行：手写体标语
 */
import { computed } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import ImageSlot from '../parts/ImageSlot.vue'
import EditableText from '../parts/EditableText.vue'

const props = defineProps({
  cfg: { type: Object, default: () => ({}) },
  widgetId: { type: String, required: true },
})

const desktop = useDesktopStore()
const set = (patch) => desktop.setWidgetProps(props.widgetId, patch)

const photos = computed(() => props.cfg.photos ?? [null, null, null])

function setPhoto(index, value) {
  const next = [...photos.value]
  next[index] = value
  set({ photos: next })
}
</script>

<template>
  <div class="hero2">
    <div class="banner">
      <ImageSlot
        tone="soft"
        :radius="18"
        :model-value="cfg.banner"
        @update:model-value="(value) => set({ banner: value })"
      />
    </div>

    <div class="gallery">
      <div v-for="(photo, index) in photos.slice(0, 3)" :key="index" class="cell">
        <ImageSlot
          tone="solid"
          :radius="6"
          :model-value="photo"
          @update:model-value="(value) => setPhoto(index, value)"
        />
      </div>
    </div>

    <div class="slogan">
      <EditableText
        align="center"
        placeholder="写点什么吧"
        :model-value="cfg.slogan ?? ''"
        @update:model-value="(value) => set({ slogan: value })"
      />
    </div>
  </div>
</template>

<style scoped>
/* 与桌面网格同构的 4 行网格：横幅 1 行、三图 2 行、标语 1 行 */
.hero2 {
  display: grid;
  grid-template-rows: repeat(4, 1fr);
  gap: calc(var(--u) * 20);
  width: 100%;
  height: 100%;
  padding: calc(var(--u) * 20);
  border-radius: calc(var(--u) * 24);
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(calc(var(--u) * 18)) saturate(1.12);
  -webkit-backdrop-filter: blur(calc(var(--u) * 18)) saturate(1.12);
}

.banner {
  grid-row: 1;
  min-height: 0;
}

/* 三张一模一样的竖图并排：等宽等高，左右与横幅对齐 */
.gallery {
  grid-row: 2 / span 2;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: calc(var(--u) * 9);
  min-height: 0;
}

.cell {
  width: 100%;
  height: 90%;
}

.slogan {
  grid-row: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Cormorant Garamond', Georgia, 'Songti SC', serif;
  font-style: italic;
  font-size: calc(var(--u) * 24);
  letter-spacing: calc(var(--u) * 0.8);
  color: rgba(124, 101, 112, 0.55);
}
</style>
