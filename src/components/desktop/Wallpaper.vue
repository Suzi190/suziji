<script setup>
/**
 * 桌面壁纸：支持内置渐变 / 用户上传图（IndexedDB 存 objectURL）
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import { getImageURL } from '@/utils/storage'
import { getWallpaper } from '@/utils/wallpapers'

const desktop = useDesktopStore()
const imageURL = ref('')

// 上传的壁纸：从 IndexedDB 取出 objectURL
watch(
  () => desktop.wallpaper,
  async (value) => {
    if (imageURL.value) {
      URL.revokeObjectURL(imageURL.value)
      imageURL.value = ''
    }
    if (value?.type === 'image' && value.imageKey) {
      imageURL.value = await getImageURL(value.imageKey)
    }
  },
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  if (imageURL.value) URL.revokeObjectURL(imageURL.value)
})

const style = computed(() => {
  if (desktop.wallpaper?.type === 'image' && imageURL.value) {
    return {
      backgroundImage: `url(${imageURL.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return { backgroundImage: getWallpaper(desktop.wallpaper?.value).css }
})
</script>

<template>
  <div class="wallpaper" :style="style" />
</template>

<style scoped>
.wallpaper {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-color: var(--c-bg);
  background-repeat: no-repeat;
  transition: background-image 0.3s ease;
}
</style>
