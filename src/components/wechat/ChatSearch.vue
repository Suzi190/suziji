<script setup>
/**
 * 微信 · 查找聊天记录（聊天设置 →「查找聊天记录」打开的浮层）
 * ------------------------------------------------------------
 * 只在当前会话里搜；点结果会回到聊天页并滚到那条消息（由 ChatRoom 负责定位）
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { stampLabel } from './shared'

const props = defineProps({
  chatName: { type: String, default: '' },
  messages: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'jump'])

/** 一次最多列这么多条，免得聊天很长时滚不完 */
const MAX = 80

const keyword = ref('')
const inputEl = ref(null)
const word = computed(() => keyword.value.trim())

const hits = computed(() => {
  const kw = word.value.toLowerCase()
  if (!kw) return []
  return props.messages.filter((msg) => String(msg.text || '').toLowerCase().includes(kw))
})

const results = computed(() => hits.value.slice(-MAX).reverse())

/** 把命中的片段拆出来，模板里用 <mark> 高亮 */
function parts(text) {
  const kw = word.value
  const source = String(text ?? '')
  if (!kw) return [{ text: source, hit: false }]
  const lower = kw.toLowerCase()
  const out = []
  let rest = source
  while (rest) {
    const at = rest.toLowerCase().indexOf(lower)
    if (at < 0) {
      out.push({ text: rest, hit: false })
      break
    }
    if (at > 0) out.push({ text: rest.slice(0, at), hit: false })
    out.push({ text: rest.slice(at, at + kw.length), hit: true })
    rest = rest.slice(at + kw.length)
  }
  return out
}

onMounted(() => nextTick(() => inputEl.value?.focus()))
</script>

<template>
  <div class="search-layer">
    <header class="wx-subhead">
      <button class="wx-back" aria-label="返回聊天" @click="emit('close')">
        <span class="i-ph-caret-left" />
      </button>
      <label class="search">
        <span class="search-icon i-ph-magnifying-glass" />
        <input ref="inputEl" v-model="keyword" class="search-input" placeholder="搜索聊天记录" />
        <button v-if="keyword" class="clear" aria-label="清空" @click="keyword = ''">
          <span class="i-ph-x" />
        </button>
      </label>
    </header>

    <div class="wx-body result-body no-scrollbar">
      <p v-if="!word" class="wx-empty">
        <span class="glyph i-ph-magnifying-glass" />
        <span>输入关键词，搜索和「{{ chatName }}」的聊天</span>
      </p>

      <p v-else-if="!hits.length" class="wx-empty">
        <span class="glyph i-ph-chat-circle-dots" />
        <span>没有找到包含「{{ word }}」的消息</span>
      </p>

      <template v-else>
        <p class="count">
          找到 {{ hits.length }} 条{{ hits.length > MAX ? `，只显示最近 ${MAX} 条` : '' }}
        </p>

        <button v-for="msg in results" :key="msg.id" class="hit" @click="emit('jump', msg.id)">
          <span class="hit-top">
            <span class="hit-who">{{ msg.role === 'me' ? '我' : chatName }}</span>
            <span class="hit-time">{{ stampLabel(msg.at) }}</span>
          </span>
          <span class="hit-text">
            <template v-for="(part, index) in parts(msg.text)" :key="index">
              <mark v-if="part.hit">{{ part.text }}</mark>
              <span v-else>{{ part.text }}</span>
            </template>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.search-layer {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: flex;
  flex-direction: column;
  background: rgba(255, 250, 252, 0.99);
}

.search {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: calc(var(--u) * 5);
  height: calc(var(--u) * 28);
  padding: 0 calc(var(--u) * 8);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.98);
}

.search-icon {
  flex: none;
  font-size: calc(var(--u) * 13);
  color: var(--c-text-faint);
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: calc(var(--u) * 11.5);
  color: var(--c-text);
  outline: none;
  -webkit-user-select: text;
  user-select: text;
}

.search-input::placeholder {
  color: var(--c-text-faint);
}

.clear {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 18);
  height: calc(var(--u) * 18);
  border-radius: 999px;
  font-size: calc(var(--u) * 9);
  color: var(--c-text-soft);
  background: rgba(124, 101, 112, 0.1);
}

.result-body {
  padding: calc(var(--u) * 8) calc(var(--u) * 12) calc(var(--u) * 16);
}

.count {
  margin: 0 0 calc(var(--u) * 8);
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
}

.hit {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 4);
  width: 100%;
  margin-bottom: calc(var(--u) * 7);
  padding: calc(var(--u) * 9) calc(var(--u) * 11);
  border-radius: calc(var(--u) * 12);
  text-align: left;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.95);
}

.hit:active {
  transform: scale(0.99);
}

.hit-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--u) * 8);
}

.hit-who {
  font-size: calc(var(--u) * 10.5);
  font-weight: 600;
  color: #b3717f;
}

.hit-time {
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-faint);
}

.hit-text {
  font-size: calc(var(--u) * 12);
  line-height: 1.6;
  word-break: break-word;
  color: var(--c-text);
}

mark {
  padding: 0 calc(var(--u) * 1);
  border-radius: calc(var(--u) * 3);
  color: #8a4c5c;
  background: rgba(247, 168, 190, 0.5);
}
</style>
