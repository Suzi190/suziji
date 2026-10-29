<script setup>
/**
 * App 图标外观（纯视觉）：无色磨砂玻璃方块 + 浅灰图标
 * ------------------------------------------------------------
 * 不上任何主题色：玻璃只做「吸背景 + 去饱和」，图形统一浅灰，
 * 这样十几个图标并排也不会把粉色桌面搅花。
 * 桌面图标和 Dock 图标共用，保证两处视觉一致。
 */
defineProps({
  app: { type: Object, required: true },
})
</script>

<template>
  <span class="app-icon">
    <span class="glyph" :class="app.icon" />
  </span>
</template>

<style scoped>
.app-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: calc(var(--u) * 14);
  border: 1px solid rgba(255, 255, 255, 0.62);
  /* 无色磨砂：半透明白 + 背景去饱和，只剩灰调，不带任何色相 */
  background: linear-gradient(
    158deg,
    rgba(255, 255, 255, 0.72) 0%,
    rgba(255, 255, 255, 0.46) 100%
  );
  backdrop-filter: blur(calc(var(--u) * 13)) saturate(0.35);
  -webkit-backdrop-filter: blur(calc(var(--u) * 13)) saturate(0.35);
  color: rgba(118, 110, 116, 0.55);
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}

.glyph {
  position: relative;
  z-index: 1;
  font-size: calc(var(--u) * 26);
}
</style>
