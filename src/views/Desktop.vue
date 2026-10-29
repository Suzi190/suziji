<script setup>
/**
 * 桌面首页（Desktop = 应用首页）
 * ?app=wechat 之类的深链会直接打开对应窗口（后续通知点击用得上）
 * 用 watch 而不是 onMounted：SPA 已经打开时点通知只改 hash、不会重新挂载组件，
 * 只有持续监听 query 才能保证第二次点同一个链接也生效。
 */
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import PhoneShell from '@/components/desktop/PhoneShell.vue'
import { useDesktopStore } from '@/stores/desktop'

const desktop = useDesktopStore()
const route = useRoute()

watch(
  () => route.query.app,
  (appId) => {
    if (typeof appId === 'string' && appId) desktop.openApp(appId)
  },
  { immediate: true },
)
</script>

<template>
  <PhoneShell />
</template>
