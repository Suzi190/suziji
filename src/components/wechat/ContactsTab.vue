<script setup>
/**
 * 微信 · 通讯录：好友列表 + 添加好友 + 编辑智能体（人设 / 头像色）
 * 好友数据与「列表」是同一份 chats，避免两处不同步
 */
import { computed, ref, watch } from 'vue'
import { TONES, toneGradient } from './shared'

const props = defineProps({
  chats: { type: Array, required: true },
  /** 从「列表」点新好友时递增，用来打开新建表单（每次点击都要生效） */
  createTick: { type: Number, default: 0 },
})

const emit = defineEmits(['create', 'update', 'remove', 'open', 'notice'])

const editing = ref(null)
const error = ref('')

const sorted = computed(() => [...props.chats].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')))

const isNew = computed(() => editing.value !== null && !editing.value.id)

function startCreate() {
  error.value = ''
  editing.value = { id: null, name: '', persona: '', tone: 'rose' }
}

function startEdit(chat) {
  error.value = ''
  editing.value = { id: chat.id, name: chat.name, persona: chat.persona ?? '', tone: chat.tone ?? 'rose' }
}

function cancel() {
  editing.value = null
  error.value = ''
}

function save() {
  const form = editing.value
  if (!form) return
  const name = form.name.trim()
  if (!name) {
    error.value = '先给好友起个名字'
    return
  }
  const payload = { name, persona: form.persona.trim(), tone: form.tone }
  if (form.id) emit('update', form.id, payload)
  else emit('create', payload)
  editing.value = null
  error.value = ''
}

function removeFriend() {
  const form = editing.value
  if (!form?.id) return
  if (!window.confirm(`删除「${form.name}」后聊天记录也会一起清掉，确定吗？`)) return
  emit('remove', form.id)
  editing.value = null
}

function goChat() {
  const form = editing.value
  if (!form?.id) return
  const chat = props.chats.find((item) => item.id === form.id)
  if (chat) emit('open', chat)
  editing.value = null
}

watch(
  () => props.createTick,
  (tick) => {
    if (tick > 0) startCreate()
  },
)
</script>

<template>
  <div class="wx-screen">
    <!-- 好友列表 -->
    <template v-if="!editing">
      <header class="ct-head">
        <span class="ct-title">通讯录</span>
        <span class="ct-count">{{ sorted.length }} 位好友</span>
        <button class="wx-btn sm" @click="startCreate">
          <span class="i-ph-user-plus" />
          <span>添加好友</span>
        </button>
      </header>

      <div class="wx-body ct-body">
        <p class="wx-note">点好友可以编辑它的「人设」和头像色，人设决定 AI 怎么说话。</p>

        <div class="wx-card">
          <button v-for="chat in sorted" :key="chat.id" class="wx-row" @click="startEdit(chat)">
            <span class="wx-avatar" :style="toneGradient(chat.tone)">{{ chat.name.slice(0, 1) }}</span>
            <span class="wx-main">
              <span class="wx-top">
                <span class="wx-name">{{ chat.name }}</span>
                <span v-if="chat.pinned" class="pin i-ph-push-pin-fill" />
              </span>
              <span class="wx-preview persona">{{ chat.persona || '还没写人设，点一下就能编辑' }}</span>
            </span>
            <span class="wx-chevron i-ph-caret-right" />
          </button>
        </div>

        <p v-if="!sorted.length" class="wx-empty">
          <span class="glyph i-ph-address-book" />
          <span>通讯录是空的，点上面「添加好友」创建一个智能体</span>
        </p>
      </div>
    </template>

    <!-- 新建 / 编辑表单 -->
    <template v-else>
      <header class="wx-subhead">
        <button class="wx-back" @click="cancel">
          <span class="i-ph-caret-left" />
        </button>
        <span class="wx-subtitle">{{ isNew ? '添加好友' : '编辑智能体' }}</span>
        <button v-if="!isNew" class="wx-back" @click="removeFriend">
          <span class="i-ph-trash" />
        </button>
      </header>

      <div class="wx-body form-body">
        <div class="preview">
          <span class="wx-avatar lg" :style="toneGradient(editing.tone)">
            {{ (editing.name || '?').slice(0, 1) }}
          </span>
          <div class="preview-main">
            <p class="preview-name">{{ editing.name || '新的好友' }}</p>
            <p class="preview-tip">{{ isNew ? '创建后会出现在「列表」里' : '改完保存即可生效' }}</p>
          </div>
        </div>

        <div class="wx-field">
          <span class="wx-field-label">名字</span>
          <input v-model="editing.name" class="wx-input" maxlength="16" placeholder="比如：阿萤" />
        </div>

        <div class="wx-field">
          <span class="wx-field-label">人设（AI 的性格、说话方式、和你的关系）</span>
          <textarea
            v-model="editing.persona"
            class="wx-textarea"
            maxlength="600"
            placeholder="比如：你是阿萤，我的高中同学，说话简短、爱用语气词，偶尔会害羞。不要提起你是 AI。"
          />
          <span class="counter">{{ editing.persona.length }}/600</span>
        </div>

        <div class="wx-field">
          <span class="wx-field-label">头像颜色</span>
          <div class="tone-list">
            <button
              v-for="tone in TONES"
              :key="tone.id"
              class="tone"
              :class="editing.tone === tone.id ? 'on' : ''"
              :style="toneGradient(tone.id)"
              @click="editing.tone = tone.id"
            />
          </div>
        </div>

        <p v-if="error" class="err">{{ error }}</p>

        <div class="form-actions">
          <button class="wx-btn block" @click="save">{{ isNew ? '创建并开始聊天' : '保存修改' }}</button>
          <button v-if="!isNew" class="wx-btn ghost block" @click="goChat">
            <span class="i-ph-chat-circle-dots" />
            <span>去聊天</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ct-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 8);
  padding: calc(var(--u) * 10) calc(var(--u) * 14) calc(var(--u) * 8);
}

.ct-title {
  flex: 1;
  font-size: calc(var(--u) * 15);
  font-weight: 600;
  color: var(--c-text);
}

.ct-count {
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
}

.ct-body {
  padding: calc(var(--u) * 2) calc(var(--u) * 14) calc(var(--u) * 16);
}

.ct-body .wx-card {
  padding: calc(var(--u) * 3);
}

.persona {
  font-size: calc(var(--u) * 10.5);
}

.pin {
  flex: none;
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
}

/* ---------- 表单 ---------- */
.form-body {
  padding: calc(var(--u) * 14) calc(var(--u) * 16) calc(var(--u) * 20);
}

.preview {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 12);
  margin-bottom: calc(var(--u) * 16);
  padding: calc(var(--u) * 12);
  border-radius: calc(var(--u) * 16);
  background: rgba(255, 255, 255, 0.6);
}

.preview-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 3);
}

.preview-name {
  margin: 0;
  overflow: hidden;
  font-size: calc(var(--u) * 14);
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--c-text);
}

.preview-tip {
  margin: 0;
  font-size: calc(var(--u) * 10.5);
  color: var(--c-text-faint);
}

.counter {
  align-self: flex-end;
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-faint);
}

.tone-list {
  display: flex;
  gap: calc(var(--u) * 9);
}

.tone {
  width: calc(var(--u) * 26);
  height: calc(var(--u) * 26);
  border-radius: calc(var(--u) * 9);
  border: calc(var(--u) * 2) solid transparent;
  transition: transform 0.14s ease;
}

.tone.on {
  border-color: rgba(255, 255, 255, 0.95);
  transform: scale(1.08);
}

.err {
  margin: 0 0 calc(var(--u) * 8);
  font-size: calc(var(--u) * 11);
  color: #c8737f;
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 9);
  margin-top: calc(var(--u) * 4);
}
</style>
