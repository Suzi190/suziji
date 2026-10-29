<script setup>
/**
 * 微信 · 聊天详情：气泡 / 时间条 / 表情面板 / 流式光标
 * 只负责界面与本地草稿，AI 请求与持久化由 Wechat.vue 统一处理
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getImageURL } from '@/utils/storage'
import { stampLabel, toneGradient } from './shared'
import ChatSettings from './ChatSettings.vue'
import ChatSearch from './ChatSearch.vue'

const props = defineProps({
  chat: { type: Object, required: true },
  streaming: { type: Boolean, default: false },
  emojis: { type: Array, default: () => [] },
  bubble: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['back', 'send', 'stop', 'remove', 'notice', 'settings', 'unblock', 'toggle-wb'])

const draft = ref('')
const emojiOpen = ref(false)
const voiceMode = ref(false)
const scroller = ref(null)
const inputEl = ref(null)

/** 聊天设置抽屉 / 查找浮层 */
const settingsOpen = ref(false)
const searchOpen = ref(false)
/** 从查找结果跳过来时，被点中的那条消息闪一下 */
const hitId = ref('')
/** 自定义背景（相册图）的 objectURL */
const bgUrl = ref('')
let bgObjectURL = ''
let bgToken = 0
let hitTimer = null

/** 渐变背景直接铺在 room 上；图片背景另起一层 <img> */
const bgStyle = computed(() =>
  props.chat.bg?.type === 'grad' ? { background: props.chat.bg.value } : null,
)

async function syncBg(bg) {
  const token = ++bgToken
  if (bgObjectURL) {
    URL.revokeObjectURL(bgObjectURL)
    bgObjectURL = ''
  }
  bgUrl.value = ''
  if (!bg || bg.type !== 'image' || !bg.value) return
  const url = await getImageURL(bg.value)
  if (token !== bgToken) {
    if (url) URL.revokeObjectURL(url)
    return
  }
  bgObjectURL = url
  bgUrl.value = url
}

watch(
  () => [props.chat.bg?.type, props.chat.bg?.value].join('|'),
  () => syncBg(props.chat.bg),
  { immediate: true },
)

/** 超过 5 分钟的相邻消息之间插一条时间条 */
const views = computed(() =>
  props.chat.messages.map((msg, index) => {
    const prev = props.chat.messages[index - 1]
    return { ...msg, showTime: !prev || msg.at - prev.at > 5 * 60 * 1000 }
  }),
)

const canSend = computed(() => draft.value.trim().length > 0)

const themeClass = computed(() => [
  `theme-${props.bubble?.theme ?? 'sakura'}`,
  `rad-${props.bubble?.radius ?? 'md'}`,
])

function syncHeight() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function scrollToBottom(smooth = false) {
  const el = scroller.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

function send() {
  const text = draft.value.trim()
  if (!text || props.streaming) return
  draft.value = ''
  emojiOpen.value = false
  emit('send', text)
  nextTick(syncHeight)
}

function toggleEmoji() {
  emojiOpen.value = !emojiOpen.value
  if (!emojiOpen.value) return
  nextTick(() => scrollToBottom(true))
}

function pickEmoji(char) {
  draft.value += char
  nextTick(() => {
    syncHeight()
    inputEl.value?.focus()
  })
}

function toggleVoice() {
  voiceMode.value = !voiceMode.value
  emojiOpen.value = false
  if (!voiceMode.value) nextTick(() => inputEl.value?.focus())
}

/** 右上角「⋯」：先收表情面板，再开设置抽屉 */
function openSettings() {
  emojiOpen.value = false
  settingsOpen.value = true
}

function openSearch() {
  settingsOpen.value = false
  searchOpen.value = true
}

/** 从查找结果跳回对话：滚到那条消息并闪一下高亮 */
function jumpTo(id) {
  searchOpen.value = false
  hitId.value = id
  nextTick(() => {
    const el = scroller.value?.querySelector(`[data-mid="${id}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    clearTimeout(hitTimer)
    hitTimer = setTimeout(() => {
      hitId.value = ''
    }, 1800)
  })
}

/** 消息或流式文本变化时贴底 */
watch(
  () => props.chat.messages.map((msg) => `${msg.text?.length ?? 0}${msg.at ?? ''}`).join('|'),
  () => nextTick(() => scrollToBottom()),
)

watch(
  () => props.chat.id,
  () => {
    // 换人聊天时不要把上一位的草稿带过去
    draft.value = ''
    emojiOpen.value = false
    nextTick(() => scrollToBottom())
  },
)

watch(
  () => draft.value,
  () => nextTick(syncHeight),
)

onMounted(() => nextTick(() => scrollToBottom()))

onBeforeUnmount(() => {
  bgToken++
  if (bgObjectURL) URL.revokeObjectURL(bgObjectURL)
  clearTimeout(hitTimer)
})
</script>

<template>
  <div
    class="wx-screen room"
    :class="[themeClass, { 'has-bg': !!bgUrl, 'is-blocked': chat.blocked }]"
    :style="bgStyle"
  >
    <img v-if="bgUrl" class="room-bg" :src="bgUrl" alt="" draggable="false" />

    <!-- 子头部 -->
    <header class="wx-subhead">
      <button class="wx-back" @click="emit('back')">
        <span class="i-ph-caret-left" />
      </button>
      <span class="wx-avatar sm" :style="toneGradient(chat.tone)">{{ chat.name.slice(0, 1) }}</span>
      <span class="head-main">
        <span class="wx-subtitle">{{ chat.name }}</span>
        <span class="head-sub">{{ streaming ? '正在输入…' : chat.blocked ? '已拉黑' : '在线' }}</span>
      </span>
      <button class="wx-back" aria-label="聊天设置" @click="openSettings">
        <span class="i-ph-dots-three" />
      </button>
    </header>

    <!-- 消息区 -->
    <div ref="scroller" class="wx-body msg-body">
      <template v-for="msg in views" :key="msg.id">
        <p v-if="msg.showTime" class="timebar">{{ stampLabel(msg.at) }}</p>
        <div
          class="msg"
          :class="[msg.role === 'me' ? 'me' : 'ai', { hit: hitId === msg.id }]"
          :data-mid="msg.id"
        >
          <span
            v-if="msg.role === 'ai' && bubble?.showAvatar !== false"
            class="wx-avatar xs bubble-avatar"
            :style="toneGradient(chat.tone)"
          >
            {{ chat.name.slice(0, 1) }}
          </span>
          <p class="bubble" :class="{ error: msg.error }">
            {{ msg.text }}
            <span v-if="streaming && msg.role === 'ai' && msg === views[views.length - 1]" class="caret" />
          </p>
        </div>
      </template>

      <p v-if="!chat.messages.length" class="wx-empty">
        <span class="glyph i-ph-chat-circle-dots" />
        <span>和 {{ chat.name }} 说点什么吧</span>
      </p>
    </div>

    <!-- 表情面板 -->
    <div v-if="emojiOpen && !chat.blocked" class="emoji-panel">
      <button v-for="(char, index) in emojis" :key="`${char}-${index}`" class="emoji" @click="pickEmoji(char)">
        {{ char }}
      </button>
      <p v-if="!emojis.length" class="emoji-empty">表情包是空的，去「我 → 表情包」加几个</p>
    </div>

    <!-- 输入栏（拉黑后换成下面的提示条） -->
    <footer v-if="!chat.blocked" class="composer">
      <button class="c-icon" @click="toggleVoice">
        <span v-if="!voiceMode" class="i-ph-microphone" />
        <span v-else class="i-ph-keyboard" />
      </button>

      <div class="c-input">
        <textarea
          v-if="!voiceMode"
          ref="inputEl"
          v-model="draft"
          class="composer-input"
          rows="1"
          placeholder="说点什么…"
          @keydown.enter.exact.prevent="send"
        />
        <button v-else class="voice-bar" @click="emit('notice', '语音消息在阶段 3 接入')">按住 说话</button>
      </div>

      <button v-if="!voiceMode" class="c-icon" @click="toggleEmoji">
        <span v-if="!emojiOpen" class="i-ph-smiley" />
        <span v-else class="i-ph-keyboard" />
      </button>

      <button
        class="send"
        :class="streaming ? 'is-stop' : ''"
        :disabled="voiceMode || (!streaming && !canSend)"
        @click="streaming ? emit('stop') : send()"
      >
        {{ streaming ? '停止' : '发送' }}
      </button>
    </footer>

    <div v-else class="blocked-bar">
      <span class="blocked-icon i-ph-prohibit" />
      <span class="blocked-text">已拉黑「{{ chat.name }}」，无法发送消息</span>
      <button class="unblock" @click="emit('unblock')">解除</button>
    </div>

    <!-- 查找聊天记录（浮层） -->
    <ChatSearch
      v-if="searchOpen"
      :chat-name="chat.name"
      :messages="chat.messages"
      @close="searchOpen = false"
      @jump="jumpTo"
    />

    <!-- 聊天设置（底部抽屉） -->
    <ChatSettings
      v-if="settingsOpen"
      :chat="chat"
      @close="settingsOpen = false"
      @update="emit('settings', $event)"
      @toggle-wb="emit('toggle-wb', $event)"
      @search="openSearch"
      @remove="emit('remove')"
      @notice="emit('notice', $event)"
    />
  </div>
</template>

<style scoped>
/* ---------- 聊天背景 ---------- */
.room {
  position: relative;
}

.room-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

/* 图片背景上压一层浅色，气泡和文字才看得清 */
.room.has-bg .msg-body {
  background: linear-gradient(rgba(255, 250, 252, 0.42), rgba(255, 250, 252, 0.5));
}

.room > .wx-subhead,
.room > .msg-body,
.room > .emoji-panel,
.room > .composer,
.room > .blocked-bar {
  position: relative;
  z-index: 1;
}

/* 从查找结果跳过来的那条消息闪一下 */
.msg.hit .bubble {
  outline: calc(var(--u) * 2) solid rgba(226, 140, 166, 0.55);
  outline-offset: calc(var(--u) * 1);
}

/* ---------- 拉黑提示条 ---------- */
.blocked-bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 7);
  padding: calc(var(--u) * 9) calc(var(--u) * 12) calc(var(--u) * 10);
  border-top: 1px solid rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.72);
}

.blocked-icon {
  flex: none;
  font-size: calc(var(--u) * 14);
  color: #c8737f;
}

.blocked-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: calc(var(--u) * 11);
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--c-text-soft);
}

.unblock {
  flex: none;
  height: calc(var(--u) * 26);
  padding: 0 calc(var(--u) * 12);
  border-radius: 999px;
  font-size: calc(var(--u) * 11);
  color: #fff;
  background: linear-gradient(135deg, #f7a8be, #e28ca6);
}

/* ---------- 子头部 ---------- */
.head-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 1);
}

.head-sub {
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-faint);
}

/* ---------- 气泡主题（可在「我 → 聊天气泡」切换） ---------- */
.room.theme-sakura {
  --me-bg: linear-gradient(135deg, #fbd3de, #f3b3c6);
  --me-color: #6b4350;
  --ai-bg: rgba(255, 255, 255, 0.94);
  --ai-color: var(--c-text);
}

.room.theme-milk {
  --me-bg: linear-gradient(135deg, #fbe9d7, #f0cfae);
  --me-color: #6d5137;
  --ai-bg: rgba(255, 255, 255, 0.94);
  --ai-color: var(--c-text);
}

.room.theme-graphite {
  --me-bg: linear-gradient(135deg, #b7b0bb, #8b8390);
  --me-color: #fff;
  --ai-bg: rgba(255, 255, 255, 0.9);
  --ai-color: var(--c-text);
}

.room.rad-sm {
  --r: calc(var(--u) * 6);
  --r-tail: calc(var(--u) * 2);
}

.room.rad-md {
  --r: calc(var(--u) * 15);
  --r-tail: calc(var(--u) * 5);
}

.room.rad-lg {
  --r: calc(var(--u) * 21);
  --r-tail: calc(var(--u) * 8);
}

/* ---------- 消息区 ---------- */
.msg-body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 9);
  padding: calc(var(--u) * 10) calc(var(--u) * 12) calc(var(--u) * 16);
}

.timebar {
  align-self: center;
  margin: calc(var(--u) * 4) 0;
  padding: calc(var(--u) * 2) calc(var(--u) * 9);
  border-radius: 999px;
  font-size: calc(var(--u) * 9);
  color: var(--c-text-faint);
  background: rgba(255, 255, 255, 0.6);
}

.msg {
  display: flex;
  align-items: flex-end;
  gap: calc(var(--u) * 6);
  max-width: 100%;
}

.msg.me {
  flex-direction: row-reverse;
}

.bubble-avatar {
  margin-bottom: calc(var(--u) * 2);
}

.bubble {
  position: relative;
  max-width: 76%;
  margin: 0;
  padding: calc(var(--u) * 8) calc(var(--u) * 11);
  border-radius: var(--r);
  font-size: calc(var(--u) * 12.5);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ai-color);
  background: var(--ai-bg);
}

.msg.me .bubble {
  color: var(--me-color);
  background: var(--me-bg);
  border-top-right-radius: var(--r-tail);
}

.msg.ai .bubble {
  border-top-left-radius: var(--r-tail);
}

.bubble.error {
  color: #b06b74;
  background: rgba(255, 255, 255, 0.86);
  border: 1px dashed rgba(200, 115, 127, 0.5);
  font-size: calc(var(--u) * 11.5);
}

.caret {
  display: inline-block;
  width: calc(var(--u) * 5);
  height: calc(var(--u) * 13);
  margin-left: calc(var(--u) * 2);
  vertical-align: -1px;
  border-radius: calc(var(--u) * 1.5);
  background: currentColor;
  opacity: 0.65;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  to {
    opacity: 0;
  }
}

/* ---------- 表情面板 ---------- */
.emoji-panel {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: calc(var(--u) * 6);
  max-height: calc(var(--u) * 132);
  padding: calc(var(--u) * 10) calc(var(--u) * 12);
  overflow-y: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.55);
}

.emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 30);
  height: calc(var(--u) * 30);
  border-radius: calc(var(--u) * 9);
  font-size: calc(var(--u) * 16);
  background: rgba(255, 255, 255, 0.86);
}

.emoji:active {
  transform: scale(0.92);
}

.emoji-empty {
  width: 100%;
  margin: 0;
  padding: calc(var(--u) * 12) 0;
  font-size: calc(var(--u) * 11);
  text-align: center;
  color: var(--c-text-faint);
}

/* ---------- 输入栏 ---------- */
.composer {
  display: flex;
  flex: none;
  align-items: flex-end;
  gap: calc(var(--u) * 7);
  padding: calc(var(--u) * 8) calc(var(--u) * 10) calc(var(--u) * 9);
  border-top: 1px solid rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.62);
}

.c-icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 28);
  height: calc(var(--u) * 32);
  font-size: calc(var(--u) * 17);
  color: var(--c-text-soft);
}

.c-input {
  flex: 1;
  min-width: 0;
}

.composer-input {
  display: block;
  width: 100%;
  max-height: calc(var(--u) * 86);
  padding: calc(var(--u) * 7) calc(var(--u) * 11);
  border-radius: calc(var(--u) * 15);
  border: 1px solid rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.94);
  font-family: inherit;
  font-size: calc(var(--u) * 12.5);
  line-height: 1.5;
  color: var(--c-text);
  outline: none;
  resize: none;
  overflow-y: auto;
  -webkit-user-select: text;
  user-select: text;
}

.composer-input::placeholder {
  color: var(--c-text-faint);
}

.voice-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: calc(var(--u) * 34);
  border-radius: calc(var(--u) * 15);
  font-size: calc(var(--u) * 12);
  color: var(--c-text-soft);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.95);
}

.send {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  height: calc(var(--u) * 32);
  padding: 0 calc(var(--u) * 13);
  border-radius: 999px;
  font-size: calc(var(--u) * 12);
  color: #fff;
  background: linear-gradient(135deg, #f7a8be, #e28ca6);
  transition: transform 0.14s ease;
}

.send:active {
  transform: scale(0.96);
}

.send.is-stop {
  color: #c8737f;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(200, 115, 127, 0.45);
}

.send[disabled] {
  opacity: 0.45;
  transform: none;
  background: rgba(124, 101, 112, 0.18);
  color: #fff;
  border: 0;
}
</style>
