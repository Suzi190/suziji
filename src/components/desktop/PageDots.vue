<script setup>
/**
 * 页面指示点
 */
defineProps({
  count: { type: Number, default: 2 },
  current: { type: Number, default: 0 },
})

defineEmits(['select'])
</script>

<template>
  <div class="dots">
    <button
      v-for="index in count"
      :key="index"
      class="dot"
      :class="{ active: index - 1 === current }"
      :aria-label="`第 ${index} 页`"
      @click="$emit('select', index - 1)"
    />
  </div>
</template>

<style scoped>
.dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--u) * 5);
  height: calc(var(--u) * 18);
}

.dot {
  width: calc(var(--u) * 5);
  height: calc(var(--u) * 5);
  border-radius: 999px;
  background: rgba(124, 101, 112, 0.22);
  transition:
    width 0.22s ease,
    background 0.22s ease;
}

.dot.active {
  width: calc(var(--u) * 14);
  background: rgba(124, 101, 112, 0.45);
}
</style>
