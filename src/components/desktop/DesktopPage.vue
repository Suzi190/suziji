<script setup>
/**
 * 单页桌面：网格容器 + 小组件 + 图标 + 落点预览 + 图标菜单
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useDesktopStore } from '@/stores/desktop'
import { freeCells } from '@/utils/grid'
import { APP_MAP } from '@/apps/registry'
import WidgetBox from '@/components/widget/WidgetBox.vue'
import DesktopIcon from './DesktopIcon.vue'
import IconContextMenu from './IconContextMenu.vue'

const props = defineProps({
  page: { type: Object, required: true },
  index: { type: Number, required: true },
})

const desktop = useDesktopStore()
const gridEl = ref(null)
const { width, height } = useElementSize(gridEl)

// 只用第一页的实测尺寸推算网格，两页几何完全一致
watch(
  [width, height],
  ([w, h]) => {
    if (props.index === 0) desktop.setGridSize(w, h)
  },
  { immediate: true },
)

// 同上：首帧直接量一次，避免 ResizeObserver 回调到来前用设计稿兜底尺寸渲染
onMounted(() => {
  if (props.index !== 0) return
  const rect = gridEl.value?.getBoundingClientRect()
  if (rect?.width && rect?.height) desktop.setGridSize(rect.width, rect.height)
})

// ---------- 拖拽落点预览 ----------
const preview = computed(() => {
  const drop = desktop.dropPreview
  return drop && drop.page === props.index ? drop : null
})

const previewStyle = computed(() => {
  const drop = preview.value
  if (!drop) return null
  const { colW, rowH, gapX, gapY, pitchX, pitchY } = desktop.metrics
  const { w, h } = drop
  return {
    left: `${drop.cell.x * pitchX}px`,
    top: `${drop.cell.y * pitchY}px`,
    width: `${w * colW + (w - 1) * gapX}px`,
    height: `${h * rowH + (h - 1) * gapY}px`,
  }
})

// ---------- 图标长按菜单 ----------
const menu = ref(null)

function onIconHold({ appId, event }) {
  const rect = gridEl.value?.getBoundingClientRect()
  if (!rect) return
  menu.value = {
    appId,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

// ---------- 重命名 ----------
const renaming = ref(null)
const renameInput = ref(null)

async function startRename(appId) {
  const icon = props.page.icons.find((item) => item.appId === appId)
  renaming.value = { appId, name: icon?.customName || APP_MAP[appId]?.name || '' }
  menu.value = null
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

function applyRename() {
  if (!renaming.value) return
  desktop.renameIcon(renaming.value.appId, renaming.value.name)
  renaming.value = null
}

// ---------- 菜单动作 ----------
function onMenuSelect(action) {
  const appId = menu.value?.appId
  if (!appId) return

  if (action === 'open') {
    desktop.openApp(appId)
    menu.value = null
    return
  }
  if (action === 'rename') {
    startRename(appId)
    return
  }
  if (action === 'remove') {
    desktop.removeIcon(props.index, appId)
    menu.value = null
    return
  }
  if (action.startsWith('move:')) {
    const target = Number(action.split(':')[1])
    const targetPage = desktop.pages[target]
    const free = targetPage ? freeCells(targetPage) : []
    if (free.length) {
      desktop.moveIcon({ fromPage: props.index, appId, toPage: target, cell: free[0] })
    }
    menu.value = null
  }
}
</script>

<template>
  <div class="page">
    <div ref="gridEl" class="grid">
      <WidgetBox
        v-for="widget in page.widgets"
        :key="widget.id"
        :widget="widget"
        :page-index="index"
        :grid-el="gridEl"
      />

      <DesktopIcon
        v-for="icon in page.icons"
        :key="icon.appId"
        :icon="icon"
        :page-index="index"
        :grid-el="gridEl"
        @hold="onIconHold"
      />

      <div
        v-if="previewStyle"
        class="drop-preview"
        :class="{ ok: preview.ok }"
        :style="previewStyle"
      />

      <IconContextMenu
        v-if="menu"
        :x="menu.x"
        :y="menu.y"
        :pages="desktop.pages.length"
        :page-index="index"
        @select="onMenuSelect"
        @close="menu = null"
      />
    </div>

    <!-- 重命名弹层 -->
    <div v-if="renaming" class="dialog-mask" @pointerdown.stop @click.self="renaming = null">
      <div class="dialog">
        <p class="dialog-title">重命名图标</p>
        <input
          ref="renameInput"
          v-model="renaming.name"
          class="dialog-input"
          maxlength="12"
          placeholder="输入新名称"
          @keydown.enter.prevent="applyRename"
        />
        <div class="dialog-actions">
          <button class="btn" @click="renaming = null">取消</button>
          <button class="btn primary" @click="applyRename">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  position: relative;
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  /* 顶部 34：让大组件完全落在状态栏（26）下方，不再和时间重叠 */
  padding: calc(var(--u) * 34) calc(var(--u) * 20) 0;
  scroll-snap-align: center;
  scroll-snap-stop: always;
}

/* 固定设计高度（7 行 × 75.5 + 6 × 40），屏幕更矮时才压缩，避免最后一行被裁掉 */
.grid {
  position: relative;
  width: 100%;
  height: min(calc(var(--u) * 768), 100%);
}

/* 拖拽落点提示：可放置 = 主题色描边，不可放置 = 灰描边 */
.drop-preview {
  position: absolute;
  z-index: 20;
  border-radius: calc(var(--u) * 24);
  background: rgba(255, 255, 255, 0.16);
  border: 1px dashed rgba(124, 101, 112, 0.28);
  pointer-events: none;
  transition:
    left 0.12s ease,
    top 0.12s ease,
    width 0.12s ease,
    height 0.12s ease;
}

.drop-preview.ok {
  background: rgba(247, 168, 190, 0.16);
  border-color: rgba(226, 140, 166, 0.55);
}

.dialog-mask {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--u) * 24);
  background: rgba(255, 223, 234, 0.42);
  backdrop-filter: blur(calc(var(--u) * 8));
  -webkit-backdrop-filter: blur(calc(var(--u) * 8));
}

.dialog {
  width: 100%;
  max-width: calc(var(--u) * 300);
  padding: calc(var(--u) * 18);
  border-radius: calc(var(--u) * 26);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.dialog-title {
  margin: 0 0 calc(var(--u) * 12);
  font-size: calc(var(--u) * 14);
  font-weight: 600;
  color: var(--c-text);
}

.dialog-input {
  width: 100%;
  height: calc(var(--u) * 38);
  padding: 0 calc(var(--u) * 12);
  border-radius: calc(var(--u) * 12);
  border: 1px solid rgba(247, 168, 190, 0.4);
  background: rgba(255, 249, 251, 0.9);
  outline: none;
  font-size: calc(var(--u) * 13);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--u) * 8);
  margin-top: calc(var(--u) * 14);
}

.btn {
  height: calc(var(--u) * 30);
  padding: 0 calc(var(--u) * 14);
  border-radius: 999px;
  font-size: calc(var(--u) * 12);
  color: var(--c-text-soft);
  background: rgba(247, 168, 190, 0.12);
}

.btn.primary {
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}
</style>

