<script setup>
/**
 * 横向分页容器（两页，可滑动 / 可点指示点翻页）
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useElementSize, useScroll } from '@vueuse/core'
import { useDesktopStore } from '@/stores/desktop'
import DesktopPage from './DesktopPage.vue'
import PageDots from './PageDots.vue'

const desktop = useDesktopStore()
const scroller = ref(null)
const { width } = useElementSize(scroller)
const { x } = useScroll(scroller)
const current = ref(0)

watch([x, width], ([scrollLeft, w]) => {
  if (!w) return
  const index = Math.round(scrollLeft / w)
  current.value = Math.min(desktop.pages.length - 1, Math.max(0, index))
})

function goTo(index) {
  const el = scroller.value
  if (!el || !width.value) return
  el.scrollTo({ left: index * width.value, behavior: 'smooth' })
}

// PC 端鼠标滚轮 → 横向翻页（两页都没有纵向滚动内容，不冲突）
function onWheel(event) {
  const el = scroller.value
  if (!el || desktop.dragging) return
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  if (!delta || el.scrollWidth <= el.clientWidth) return
  event.preventDefault()
  el.scrollLeft += delta
}

onMounted(() => scroller.value?.addEventListener('wheel', onWheel, { passive: false }))
onBeforeUnmount(() => scroller.value?.removeEventListener('wheel', onWheel))
</script>

<template>
  <div class="pages">
    <div
      ref="scroller"
      class="scroller no-scrollbar"
      :class="{ 'is-dragging': !!desktop.dragging }"
    >
      <DesktopPage
        v-for="(page, index) in desktop.pages"
        :key="page.id"
        :page="page"
        :index="index"
      />
    </div>
    <PageDots :count="desktop.pages.length" :current="current" @select="goTo" />
  </div>
</template>

<style scoped>
.pages {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.scroller {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

/* 拖拽时锁定横向滚动，避免吸附动画和拖拽打架 */
.scroller.is-dragging {
  overflow-x: hidden;
  scroll-snap-type: none;
}
</style>
