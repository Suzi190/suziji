<script setup>
/**
 * 微信 · 我：我的资料（user 人设）/ 表情包 / 聊天气泡 / 微信钱包
 * 所有改动通过事件交给 Wechat.vue 落盘，组件本身不碰 localStorage
 */
import { computed, ref } from 'vue'
import { toneGradient } from './shared'

const props = defineProps({
  profile: { type: Object, required: true },
  bubble: { type: Object, required: true },
  emojis: { type: Array, default: () => [] },
  wallet: { type: Object, default: () => ({ balance: 0, records: [] }) },
})

const emit = defineEmits(['update-profile', 'update-bubble', 'add-emoji', 'remove-emoji', 'notice'])

/** '' | 'persona' | 'emojis' | 'bubble' | 'wallet' */
const view = ref('')

const form = ref({ name: '', signature: '', userPersona: '' })
const newEmoji = ref('')
const emojiError = ref('')

const THEMES = [
  { id: 'sakura', name: '樱粉', color: 'linear-gradient(135deg,#fbd3de,#f3b3c6)' },
  { id: 'milk', name: '奶杏', color: 'linear-gradient(135deg,#fbe9d7,#f0cfae)' },
  { id: 'graphite', name: '石墨', color: 'linear-gradient(135deg,#b7b0bb,#8b8390)' },
]

const RADIUS = [
  { id: 'sm', name: '小' },
  { id: 'md', name: '中' },
  { id: 'lg', name: '大' },
]

const themeName = computed(() => THEMES.find((item) => item.id === props.bubble.theme)?.name ?? '樱粉')

function openPersona() {
  form.value = {
    name: props.profile.name ?? '',
    signature: props.profile.signature ?? '',
    userPersona: props.profile.userPersona ?? '',
  }
  view.value = 'persona'
}

function savePersona() {
  emit('update-profile', {
    name: form.value.name.trim() || '我',
    signature: form.value.signature.trim(),
    userPersona: form.value.userPersona.trim(),
  })
  view.value = ''
  emit('notice', '已保存，之后的对话都会带上你的设定')
}

function addEmoji() {
  const char = newEmoji.value.trim()
  if (!char) {
    emojiError.value = '先输入一个表情'
    return
  }
  if (props.emojis.includes(char)) {
    emojiError.value = '这个表情已经有了'
    return
  }
  emit('add-emoji', char)
  newEmoji.value = ''
  emojiError.value = ''
}
</script>

<template>
  <div class="wx-screen">
    <!-- 我的主页 -->
    <template v-if="!view">
      <div class="wx-body me-body">
        <section class="profile" @click="openPersona">
          <span class="wx-avatar lg" :style="toneGradient(profile.tone)">
            {{ (profile.name || '我').slice(0, 1) }}
          </span>
          <div class="profile-main">
            <p class="profile-name">{{ profile.name || '我' }}</p>
            <p class="profile-sign">{{ profile.signature || '点这里写下你的签名' }}</p>
          </div>
          <span class="profile-edit i-ph-pencil-simple" />
        </section>

        <p class="wx-note">
          「AI 人设」写的是你自己的身份，会作为系统提示带给所有 AI 好友，让它们知道你是谁。
        </p>

        <div class="wx-card">
          <button class="wx-cell" @click="view = 'emojis'">
            <span class="wx-cell-icon"><span class="i-ph-smiley" /></span>
            <span class="wx-cell-label">表情包</span>
            <span class="wx-cell-value">{{ emojis.length }} 个</span>
            <span class="wx-chevron i-ph-caret-right" />
          </button>
          <button class="wx-cell" @click="view = 'bubble'">
            <span class="wx-cell-icon"><span class="i-ph-chat-teardrop" /></span>
            <span class="wx-cell-label">聊天气泡</span>
            <span class="wx-cell-value">{{ themeName }}</span>
            <span class="wx-chevron i-ph-caret-right" />
          </button>
          <button class="wx-cell" @click="view = 'wallet'">
            <span class="wx-cell-icon"><span class="i-ph-wallet" /></span>
            <span class="wx-cell-label">微信钱包</span>
            <span class="wx-cell-value">¥ {{ Number(wallet.balance ?? 0).toFixed(2) }}</span>
            <span class="wx-chevron i-ph-caret-right" />
          </button>
          <button class="wx-cell" @click="openPersona">
            <span class="wx-cell-icon"><span class="i-ph-user-circle" /></span>
            <span class="wx-cell-label">AI 人设（我）</span>
            <span class="wx-cell-value">{{ profile.userPersona ? '已设置' : '未设置' }}</span>
            <span class="wx-chevron i-ph-caret-right" />
          </button>
        </div>
      </div>
    </template>

    <!-- 我的人设 -->
    <template v-else-if="view === 'persona'">
      <header class="wx-subhead">
        <button class="wx-back" @click="view = ''">
          <span class="i-ph-caret-left" />
        </button>
        <span class="wx-subtitle">我的资料 · AI 人设</span>
      </header>

      <div class="wx-body panel">
        <div class="wx-field">
          <span class="wx-field-label">昵称</span>
          <input v-model="form.name" class="wx-input" maxlength="12" placeholder="我" />
        </div>
        <div class="wx-field">
          <span class="wx-field-label">签名</span>
          <input v-model="form.signature" class="wx-input" maxlength="30" placeholder="一句话介绍自己" />
        </div>
        <div class="wx-field">
          <span class="wx-field-label">我的人设（会注入每一段 AI 对话）</span>
          <textarea
            v-model="form.userPersona"
            class="wx-textarea tall"
            maxlength="600"
            placeholder="比如：我叫小栗，20 岁，喜欢安静和猫，说话温和；在这个世界里是一名书店店员。"
          />
          <span class="counter">{{ form.userPersona.length }}/600</span>
        </div>
        <button class="wx-btn block" @click="savePersona">保存</button>
      </div>
    </template>

    <!-- 表情包 -->
    <template v-else-if="view === 'emojis'">
      <header class="wx-subhead">
        <button class="wx-back" @click="view = ''">
          <span class="i-ph-caret-left" />
        </button>
        <span class="wx-subtitle">表情包</span>
        <span class="head-count">{{ emojis.length }} 个</span>
      </header>

      <div class="wx-body panel">
        <p class="wx-note">这些表情会出现在聊天输入框的表情面板里，点「×」可以删掉。</p>

        <div class="emoji-grid">
          <div v-for="(char, index) in emojis" :key="`${char}-${index}`" class="emoji-cell">
            <span class="emoji-char">{{ char }}</span>
            <button class="emoji-del" @click="removeEmoji(index)">
              <span class="i-ph-x" />
            </button>
          </div>
        </div>

        <p v-if="!emojis.length" class="wx-empty">
          <span class="glyph i-ph-smiley" />
          <span>表情包空了，在下面加一个</span>
        </p>

        <div class="add-emoji">
          <input
            v-model="newEmoji"
            class="wx-input"
            maxlength="6"
            placeholder="输入一个表情，比如 🌙"
            @keydown.enter.exact.prevent="addEmoji"
          />
          <button class="wx-btn sm" @click="addEmoji">
            <span class="i-ph-plus" />
            <span>添加</span>
          </button>
        </div>
        <p v-if="emojiError" class="err">{{ emojiError }}</p>
      </div>
    </template>

    <!-- 聊天气泡 -->
    <template v-else-if="view === 'bubble'">
      <header class="wx-subhead">
        <button class="wx-back" @click="view = ''">
          <span class="i-ph-caret-left" />
        </button>
        <span class="wx-subtitle">聊天气泡</span>
      </header>

      <div class="wx-body panel">
        <p class="wx-note">先看效果，右边这条会跟着变。</p>

        <div class="bubble-demo" :class="[`theme-${bubble.theme}`, `rad-${bubble.radius}`]">
          <div class="demo-row ai">
            <span class="demo-bubble">今天的风很轻，你在做什么？</span>
          </div>
          <div class="demo-row me">
            <span class="demo-bubble">在改一个很小的东西。</span>
          </div>
        </div>

        <div class="wx-field">
          <span class="wx-field-label">配色</span>
          <div class="wx-chips">
            <button
              v-for="item in THEMES"
              :key="item.id"
              class="wx-chip swatch"
              :class="bubble.theme === item.id ? 'on' : ''"
              @click="emit('update-bubble', { theme: item.id })"
            >
              <span class="dot" :style="{ background: item.color }" />
              {{ item.name }}
            </button>
          </div>
        </div>

        <div class="wx-field">
          <span class="wx-field-label">圆角</span>
          <div class="wx-seg">
            <button
              v-for="item in RADIUS"
              :key="item.id"
              :class="bubble.radius === item.id ? 'on' : ''"
              @click="emit('update-bubble', { radius: item.id })"
            >
              {{ item.name }}
            </button>
          </div>
        </div>

        <div class="wx-card switch-row">
          <span class="wx-cell-label">显示对方头像</span>
          <button
            class="wx-switch"
            :class="bubble.showAvatar ? 'on' : ''"
            @click="emit('update-bubble', { showAvatar: !bubble.showAvatar })"
          />
        </div>
      </div>
    </template>

    <!-- 钱包 -->
    <template v-else>
      <header class="wx-subhead">
        <button class="wx-back" @click="view = ''">
          <span class="i-ph-caret-left" />
        </button>
        <span class="wx-subtitle">微信钱包</span>
      </header>

      <div class="wx-body panel">
        <div class="balance">
          <span class="balance-label">零钱</span>
          <span class="balance-num">¥ {{ Number(wallet.balance ?? 0).toFixed(2) }}</span>
          <span class="balance-tip">这里的钱是虚构的，只用来做剧情道具</span>
        </div>

        <p class="wx-sec-title">最近记录</p>
        <div class="wx-card">
          <div v-for="item in wallet.records" :key="item.id" class="wx-cell record">
            <span class="wx-cell-icon"><span class="i-ph-receipt" /></span>
            <span class="wx-cell-label">
              {{ item.title }}
              <span class="record-time">{{ item.time }}</span>
            </span>
            <span class="amount" :class="item.amount >= 0 ? 'in' : 'out'">
              {{ item.amount >= 0 ? '+' : '' }}{{ item.amount.toFixed(2) }}
            </span>
          </div>
        </div>

        <p class="wx-note">阶段 3 会接「给好友转红包 / 记账」，现在只有展示。</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.me-body {
  padding: calc(var(--u) * 8) calc(var(--u) * 14) calc(var(--u) * 16);
}

/* ---------- 我的资料卡 ---------- */
.profile {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 12);
  margin-bottom: calc(var(--u) * 12);
  padding: calc(var(--u) * 14) calc(var(--u) * 13);
  border-radius: calc(var(--u) * 18);
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.62);
}

.profile-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 4);
}

.profile-name {
  margin: 0;
  font-size: calc(var(--u) * 15);
  font-weight: 600;
  color: var(--c-text);
}

.profile-sign {
  margin: 0;
  overflow: hidden;
  font-size: calc(var(--u) * 10.5);
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--c-text-faint);
}

.profile-edit {
  flex: none;
  font-size: calc(var(--u) * 14);
  color: var(--c-text-faint);
}

/* ---------- 子页面板 ---------- */
.panel {
  padding: calc(var(--u) * 12) calc(var(--u) * 16) calc(var(--u) * 20);
}

.tall {
  min-height: calc(var(--u) * 120);
}

.counter {
  align-self: flex-end;
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-faint);
}

.head-count {
  flex: none;
  padding-right: calc(var(--u) * 4);
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
}

.err {
  margin: calc(var(--u) * 6) 0 0;
  font-size: calc(var(--u) * 11);
  color: #c8737f;
}

/* ---------- 表情包 ---------- */
.emoji-grid {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 8);
  margin-bottom: calc(var(--u) * 12);
}

.emoji-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 38);
  height: calc(var(--u) * 38);
  border-radius: calc(var(--u) * 11);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.95);
}

.emoji-char {
  font-size: calc(var(--u) * 18);
  line-height: 1;
}

.emoji-del {
  position: absolute;
  top: calc(var(--u) * -4);
  right: calc(var(--u) * -4);
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 15);
  height: calc(var(--u) * 15);
  border-radius: 50%;
  font-size: calc(var(--u) * 9);
  color: #fff;
  background: rgba(124, 101, 112, 0.55);
}

.add-emoji {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 8);
}

/* ---------- 气泡预览 ---------- */
.bubble-demo {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 9);
  margin-bottom: calc(var(--u) * 16);
  padding: calc(var(--u) * 14) calc(var(--u) * 12);
  border-radius: calc(var(--u) * 16);
  background: linear-gradient(160deg, rgba(255, 240, 244, 0.9), rgba(255, 255, 255, 0.6));
}

.bubble-demo.theme-sakura {
  --me-bg: linear-gradient(135deg, #fbd3de, #f3b3c6);
  --me-color: #6b4350;
}

.bubble-demo.theme-milk {
  --me-bg: linear-gradient(135deg, #fbe9d7, #f0cfae);
  --me-color: #6d5137;
}

.bubble-demo.theme-graphite {
  --me-bg: linear-gradient(135deg, #b7b0bb, #8b8390);
  --me-color: #fff;
}

.bubble-demo.rad-sm {
  --r: calc(var(--u) * 6);
  --r-tail: calc(var(--u) * 2);
}

.bubble-demo.rad-md {
  --r: calc(var(--u) * 15);
  --r-tail: calc(var(--u) * 5);
}

.bubble-demo.rad-lg {
  --r: calc(var(--u) * 21);
  --r-tail: calc(var(--u) * 8);
}

.demo-row {
  display: flex;
}

.demo-row.me {
  justify-content: flex-end;
}

.demo-bubble {
  max-width: 78%;
  padding: calc(var(--u) * 7) calc(var(--u) * 10);
  border-radius: var(--r);
  font-size: calc(var(--u) * 11.5);
  line-height: 1.6;
  color: var(--c-text);
  background: rgba(255, 255, 255, 0.95);
}

.demo-row.ai .demo-bubble {
  border-top-left-radius: var(--r-tail);
}

.demo-row.me .demo-bubble {
  color: var(--me-color);
  background: var(--me-bg);
  border-top-right-radius: var(--r-tail);
}

.swatch {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 5);
}

.dot {
  width: calc(var(--u) * 12);
  height: calc(var(--u) * 12);
  border-radius: calc(var(--u) * 4);
}

.switch-row {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 10);
  padding: calc(var(--u) * 11) calc(var(--u) * 12);
}

/* ---------- 钱包 ---------- */
.balance {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 4);
  margin-bottom: calc(var(--u) * 18);
  padding: calc(var(--u) * 20) calc(var(--u) * 16);
  border-radius: calc(var(--u) * 18);
  background: linear-gradient(140deg, #fbe3e9, #f3c6cf 60%, #e8b3bf);
}

.balance-label {
  font-size: calc(var(--u) * 10.5);
  color: rgba(107, 67, 80, 0.7);
}

.balance-num {
  font-size: calc(var(--u) * 26);
  font-weight: 600;
  letter-spacing: calc(var(--u) * 0.4);
  color: #6b4350;
}

.balance-tip {
  font-size: calc(var(--u) * 9.5);
  color: rgba(107, 67, 80, 0.6);
}

.record-time {
  display: block;
  margin-top: calc(var(--u) * 2);
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-faint);
}

.amount {
  flex: none;
  font-size: calc(var(--u) * 12);
  font-weight: 600;
}

.amount.in {
  color: #7fa08c;
}

.amount.out {
  color: #b06b74;
}
</style>
