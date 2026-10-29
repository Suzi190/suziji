<script setup>
/**
 * 图片位（桌面装饰图）
 * ------------------------------------------------------------
 * - 空位显示磨砂白底 + 淡淡的加号，点一下就能选图
 * - 选图后等比压缩存进 IndexedDB，只把 key 存进布局
 * - 有图时长按（或右键）可清除，避免误触
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { getImageURL, putImage } from '@/utils/storage'
import { compressImage, newImageKey } from '@/utils/image'

const props = defineProps({
  modelValue: { type: String, default: null },
  shape: { type: String, default: 'square' }, // square | circle
  radius: { type: Number, default: 22 },
  editable: { type: Boolean, default: true },
  tone: { type: String, default: 'solid' }, // solid | soft
})

const emit = defineEmits(['update:modelValue'])

const url = ref('')
const busy = ref(false)
const inputEl = ref(null)
let objectURL = ''
let token = 0

async function sync(key) {
  const current = ++token
  if (objectURL) {
    URL.revokeObjectURL(objectURL)
    objectURL = ''
  }
  url.value = ''
  if (!key) return
  const next = await getImageURL(key)
  if (current !== token) {
    if (next) URL.revokeObjectURL(next)
    return
  }
  objectURL = next
  url.value = next
}

watch(() => props.modelValue, sync, { immediate: true })

onBeforeUnmount(() => {
  token++
  if (objectURL) URL.revokeObjectURL(objectURL)
})

function openPicker() {
  if (!props.editable || busy.value) return
  inputEl.value?.click()
}

async function onChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  busy.value = true
  try {
    const blob = await compressImage(file)
    const key = newImageKey()
    await putImage(key, blob)
    emit('update:modelValue', key)
  } catch (err) {
    console.warn('[image-slot] 图片保存失败', err)
  } finally {
    busy.value = false
  }
}

function clear() {
  if (!props.editable || !props.modelValue) return
  emit('update:modelValue', null)
}

defineExpose({ openPicker, clear })
</script>

<template>
  <div
    class="image-slot"
    :class="[`is-${shape}`, `tone-${tone}`, { 'has-image': !!url }]"
    :style="{ '--slot-radius': `calc(var(--u) * ${radius})` }"
    role="button"
    :aria-label="url ? '更换图片' : '添加图片'"
    @pointerdown.stop
    @click.stop="openPicker"
    @contextmenu.prevent.stop="clear"
  >
    <img v-if="url" :src="url" alt="" draggable="false" />
    <span v-else class="plus i-ph-plus" />
    <button v-if="url && editable" class="remove i-ph-x" aria-label="移除图片" @click.stop="clear" />
    <input ref="inputEl" class="hidden" type="file" accept="image/*" @change="onChange" />
  </div>
</template>

<style scoped>
.image-slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--slot-radius);
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background 0.2s ease;
}

/*
 * 柔白：首页中两块 2×2 图区用这个调子。
 * 白度要明显高于外层卡片（.hero 是 0.42），否则两块会糊进背景、看着像一片空白
 */
.image-slot.tone-soft {
  background: rgba(255, 255, 255, 0.85);
  border-color: rgba(255, 255, 255, 0.9);
}

.image-slot.is-circle {
  border-radius: 999px;
}

.image-slot.has-image {
  background: rgba(255, 255, 255, 0.2);
}

.image-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.plus {
  font-size: calc(var(--u) * 16);
  color: rgba(124, 101, 112, 0.26);
}

.remove {
  position: absolute;
  top: calc(var(--u) * 4);
  right: calc(var(--u) * 4);
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 18);
  height: calc(var(--u) * 18);
  border-radius: 999px;
  font-size: calc(var(--u) * 10);
  color: rgba(124, 101, 112, 0.7);
  background: rgba(255, 255, 255, 0.86);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.image-slot:hover .remove {
  opacity: 1;
}

.hidden {
  display: none;
}
</style>
