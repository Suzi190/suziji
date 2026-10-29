<script setup>
/**
 * 桌面小组件容器
 * ------------------------------------------------------------
 * 负责绝对定位 + 长按拖拽（按格子吸附、被压到的图标会被挤出重排），
 * 具体长什么样交给 widgets/* 里的组件。
 */
import { computed, ref } from 'vue'
import { useDragGrid } from '@/composables/useDragGrid'
import HeroWidget from './widgets/HeroWidget.vue'
import Hero2Widget from './widgets/Hero2Widget.vue'
import PillWidget from './widgets/PillWidget.vue'
import PhotoWidget from './widgets/PhotoWidget.vue'

const WIDGETS = {
  hero: HeroWidget,
  hero2: Hero2Widget,
  pill: PillWidget,
  photo: PhotoWidget,
}

const props = defineProps({
  widget: { type: Object, required: true },
  pageIndex: { type: Number, required: true },
  gridEl: { type: Object, default: null },
})

const el = ref(null)
const cell = computed(() => props.widget.cell)
const comp = computed(() => WIDGETS[props.widget.type] ?? null)

const { boxStyle, isActive } = useDragGrid({
  kind: 'widget',
  pageIndex: props.pageIndex,
  id: props.widget.id,
  cell,
  size: cell,
  gridEl: () => props.gridEl,
  target: el,
})
</script>

<template>
  <div
    v-if="comp"
    ref="el"
    class="widget-box"
    :class="{ 'is-active': isActive }"
    :style="boxStyle"
    @contextmenu.prevent
  >
    <component :is="comp" :cfg="widget.props ?? {}" :widget-id="widget.id" />
  </div>
</template>

<style scoped>
.widget-box {
  position: absolute;
  z-index: 1;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  border-radius: calc(var(--u) * 24);
  transition: box-shadow 0.18s ease;
}

.widget-box.is-active {
  z-index: 40;
  box-shadow: var(--shadow-drag);
}
</style>
