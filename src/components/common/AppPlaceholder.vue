<script setup>
/**
 * App 占位页（S0–S3 阶段用）
 * 统一展示 App 名称、说明、所属阶段，后续逐个替换成真实功能
 */
import { computed } from 'vue'
import { getApp } from '@/apps/registry'

const props = defineProps({
  appId: { type: String, required: true },
})

const app = computed(() => getApp(props.appId))
</script>

<template>
  <div v-if="app" class="placeholder">
    <span class="glyph" :class="app.icon" />
    <h2 class="name">{{ app.name }}</h2>
    <p class="desc">{{ app.desc }}</p>
    <span class="badge">阶段 {{ app.phase }} · 建设中</span>
  </div>
</template>

<style scoped>
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--u) * 8);
  min-height: 100%;
  padding: calc(var(--u) * 28);
  text-align: center;
}

.glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 58);
  height: calc(var(--u) * 58);
  margin-bottom: calc(var(--u) * 4);
  border-radius: calc(var(--u) * 18);
  font-size: calc(var(--u) * 28);
  /* 和桌面图标同一套语言：无色磨砂 + 浅灰图形 */
  color: rgba(118, 110, 116, 0.55);
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.name {
  margin: 0;
  font-family: 'Cormorant Garamond', Georgia, 'Songti SC', serif;
  font-size: calc(var(--u) * 20);
  letter-spacing: calc(var(--u) * 0.6);
  color: var(--c-text);
}

.desc {
  max-width: calc(var(--u) * 240);
  margin: 0;
  font-size: calc(var(--u) * 12);
  line-height: 1.7;
  color: var(--c-text-soft);
}

.badge {
  margin-top: calc(var(--u) * 6);
  padding: calc(var(--u) * 4) calc(var(--u) * 12);
  border-radius: 999px;
  font-size: calc(var(--u) * 10);
  letter-spacing: calc(var(--u) * 0.6);
  color: var(--c-text-faint);
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.8);
}
</style>
