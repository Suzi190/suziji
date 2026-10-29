<script setup>
/** 微信 · 列表：会话搜索 + 置顶优先 + 未读角标 */
import { computed, ref } from 'vue'
import { timeLabel, toneGradient } from './shared'

const props = defineProps({
  chats: { type: Array, required: true },
})

const emit = defineEmits(['open', 'add'])

const keyword = ref('')

const lastOf = (chat) => (chat.messages?.length ? chat.messages[chat.messages.length - 1] : null)

const list = computed(() => {
  const kw = keyword.value.trim()
  const source = kw
    ? props.chats.filter(
        (chat) => chat.name.includes(kw) || (lastOf(chat)?.text ?? '').includes(kw),
      )
    : props.chats.slice()

  return source.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return (lastOf(b)?.at ?? 0) - (lastOf(a)?.at ?? 0)
  })
})

function preview(chat) {
  const last = lastOf(chat)
  if (!last) return chat.persona ? '还没开始聊天' : '打个招呼吧'
  const text = (last.text || '…').replace(/\s+/g, ' ').slice(0, 48)
  if (chat.unread) return chat.unread > 1 ? `[${chat.unread} 条] ${text}` : text
  return last.role === 'me' ? `我：${text}` : text
}
</script>

<template>
  <div class="wx-screen">
    <!-- 顶部：搜索 + 新好友 -->
    <header class="list-head">
      <label class="search">
        <span class="i-ph-magnifying-glass icon" />
        <input v-model="keyword" class="search-input" placeholder="搜索会话 / 聊天内容" />
        <button v-if="keyword" class="clear" @click="keyword = ''">
          <span class="i-ph-x" />
        </button>
      </label>
      <button class="wx-btn sm" @click="emit('add')">
        <span class="i-ph-plus" />
        <span>新好友</span>
      </button>
    </header>

    <!-- 会话列表 -->
    <div class="wx-body list-body">
      <button
        v-for="chat in list"
        :key="chat.id"
        class="wx-row"
        @click="emit('open', chat)"
      >
        <span class="wx-avatar" :style="toneGradient(chat.tone)">{{ chat.name.slice(0, 1) }}</span>
        <span class="wx-main">
          <span class="wx-top">
            <span class="wx-name">{{ chat.name }}</span>
            <span class="wx-time">{{ timeLabel(lastOf(chat)?.at) }}</span>
          </span>
          <span class="wx-bottom">
            <span class="wx-preview">{{ preview(chat) }}</span>
            <span v-if="chat.unread" class="wx-badge">
              {{ chat.unread > 99 ? '99+' : chat.unread }}
            </span>
            <span v-else-if="chat.pinned" class="pin i-ph-push-pin-fill" />
          </span>
        </span>
      </button>

      <p v-if="!list.length" class="wx-empty">
        <span class="glyph i-ph-chats-circle" />
        <span>{{ keyword ? '没有找到相关会话' : '还没有好友，点右上角「新好友」认识一个' }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.list-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 8);
  padding: calc(var(--u) * 10) calc(var(--u) * 14) calc(var(--u) * 8);
}

.search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: calc(var(--u) * 6);
  height: calc(var(--u) * 32);
  padding: 0 calc(var(--u) * 10);
  border-radius: calc(var(--u) * 11);
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.8);
}

.search .icon {
  flex: none;
  font-size: calc(var(--u) * 14);
  color: var(--c-text-faint);
}

.search-input {
  flex: 1;
  min-width: 0;
  font-size: calc(var(--u) * 12);
  color: var(--c-text);
  outline: none;
  background: transparent;
  border: 0;
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
  width: calc(var(--u) * 15);
  height: calc(var(--u) * 15);
  border-radius: 50%;
  font-size: calc(var(--u) * 9);
  color: #fff;
  background: rgba(124, 101, 112, 0.3);
}

.list-body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 1);
  padding: calc(var(--u) * 2) calc(var(--u) * 10) calc(var(--u) * 14);
}

.pin {
  flex: none;
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
}
</style>
