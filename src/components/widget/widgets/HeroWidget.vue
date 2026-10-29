<script setup>
/**
 * 首页大组件（4 × 5）
 * 内部按参考稿的比例分四段（不是等分网格）：
 *   顶栏 22% │ 中间两个 2×2 图区自适应 │ 五个小圆 50 │ 标语 28
 * 容器高度变了只让中间图区伸缩，其余段高固定，比例保持不变
 */
import { computed } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import ImageSlot from '../parts/ImageSlot.vue'
import MiniCalendar from '../parts/MiniCalendar.vue'
import EditableText from '../parts/EditableText.vue'

const props = defineProps({
  cfg: { type: Object, default: () => ({}) },
  widgetId: { type: String, required: true },
})

const desktop = useDesktopStore()
const set = (patch) => desktop.setWidgetProps(props.widgetId, patch)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const stamp = computed(() => {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${MONTHS[now.getMonth()]}./${hh}:${mm}`
})

const avatars = computed(() => props.cfg.avatars ?? [null, null])
const photos = computed(() => props.cfg.photos ?? [null, null, null, null, null])

function setAvatar(index, value) {
  const next = [...avatars.value]
  next[index] = value
  set({ avatars: next })
}

function setPhoto(index, value) {
  const next = [...photos.value]
  next[index] = value
  set({ photos: next })
}
</script>

<template>
  <div class="hero">
    <div class="top">
      <div class="avatars">
        <div v-for="(avatar, index) in avatars.slice(0, 2)" :key="index" class="avatar">
          <ImageSlot
            shape="circle"
            tone="solid"
            :radius="999"
            :model-value="avatar"
            @update:model-value="(value) => setAvatar(index, value)"
          />
        </div>
      </div>
      <span class="stamp">{{ stamp }}</span>
    </div>

    <div class="mid">
      <div class="photo">
        <ImageSlot
          tone="soft"
          :radius="20"
          :model-value="cfg.photo"
          @update:model-value="(value) => set({ photo: value })"
        />
        <div class="sticker">
          <ImageSlot
            tone="solid"
            :radius="10"
            :model-value="cfg.sticker"
            @update:model-value="(value) => set({ sticker: value })"
          />
        </div>
      </div>
      <div class="calendar">
        <MiniCalendar />
      </div>
    </div>

    <div class="circles">
      <div v-for="(photo, index) in photos.slice(0, 5)" :key="index" class="circle">
        <ImageSlot
          shape="circle"
          tone="solid"
          :radius="999"
          :model-value="photo"
          @update:model-value="(value) => setPhoto(index, value)"
        />
      </div>
    </div>

    <div class="slogan">
      <EditableText
        align="center"
        placeholder="写一句今天的心情"
        :model-value="cfg.slogan ?? ''"
        @update:model-value="(value) => set({ slogan: value })"
      />
    </div>
  </div>
</template>

<style scoped>
/*
 * 4×5 的竖向节奏（组件 392 × 537）：
 * 顶栏 20% → 34 空隙 → 两个 2×2 图区（只比正方略长）→ 32 空隙 → 五圆 56 → 18 空隙 → 标语 28
 * 只有中间图区跟着高度伸缩，其余段高与空隙固定；空隙给足，不做成紧凑的一条条
 * 空隙额外用 min(…, cqh) 兜底：卡片被压扁时（如 375×667）自动收窄，中间图区不至于被挤没
 */
.hero {
  container-type: size;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: calc(var(--u) * 8) calc(var(--u) * 10) calc(var(--u) * 18);
  border-radius: calc(var(--u) * 24);
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(calc(var(--u) * 18)) saturate(1.12);
  -webkit-backdrop-filter: blur(calc(var(--u) * 18)) saturate(1.12);
}

/* 顶栏：厚但不抢中间图区的空间 */
.top {
  flex: none;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 10);
  height: 20%;
  padding: 0 calc(var(--u) * 12);
  border-radius: calc(var(--u) * 18);
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.72);
}

.avatars {
  display: flex;
  align-items: center;
  flex: none;
}

.avatar {
  flex: none;
  width: calc(var(--u) * 56);
  height: calc(var(--u) * 56);
}

.avatar + .avatar {
  margin-left: calc(var(--u) * 8);
}

.stamp {
  margin-left: auto;
  font-family: 'Cormorant Garamond', Georgia, 'Songti SC', serif;
  font-style: italic;
  font-size: calc(var(--u) * 26);
  letter-spacing: calc(var(--u) * 0.4);
  color: rgba(124, 101, 112, 0.46);
  white-space: nowrap;
}

/* 中间：两块规格写的是「两个 2×2」，所以做成近乎等大的两块（稿子 1.1 : 1）
 * 高度只比正方形略长一点，剩下的高度都给上下空隙，不做成又长又挤的窄条 */
.mid {
  flex: 1;
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: calc(var(--u) * 8);
  margin-top: min(calc(var(--u) * 34), 6.3cqh);
  min-height: 0;
}

.photo,
.calendar {
  position: relative;
  min-width: 0;
  min-height: 0;
}

/* 左上角小方图：稿子里约占照片宽度的 1/4 */
.sticker {
  position: absolute;
  top: calc(var(--u) * 10);
  left: calc(var(--u) * 10);
  width: calc(var(--u) * 46);
  height: calc(var(--u) * 46);
}

/* 五个装饰圆：铺满整行，直径 56（组件宽的 14%，稿子是 15.4%） */
.circles {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: calc(var(--u) * 56);
  margin-top: min(calc(var(--u) * 32), 6cqh);
  padding: 0 calc(var(--u) * 2);
}

.circle {
  flex: none;
  width: calc(var(--u) * 56);
  height: calc(var(--u) * 56);
}

.slogan {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(var(--u) * 28);
  margin-top: min(calc(var(--u) * 18), 3.4cqh);
  font-family: 'Cormorant Garamond', Georgia, 'Songti SC', serif;
  font-style: italic;
  font-size: calc(var(--u) * 24);
  letter-spacing: calc(var(--u) * 1);
  color: rgba(124, 101, 112, 0.5);
}
</style>
