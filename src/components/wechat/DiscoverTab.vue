<script setup>
/**
 * 微信 · 发现：入口页（朋友圈 / 公众号）→ 各自的子页
 * 数据只读展示，点赞会在本地记录
 */
import { computed, ref } from 'vue'
import { momentLabel, toneGradient } from './shared'

const props = defineProps({
  moments: { type: Array, default: () => [] },
  official: { type: Array, default: () => [] },
  chats: { type: Array, default: () => [] },
})

const emit = defineEmits(['like', 'notice'])

/** '' | 'moments' | 'official' */
const view = ref('')

const latestMoment = computed(() => props.moments[0] ?? null)
const unreadOfficial = computed(() => props.official.filter((item) => item.unread).length)

function openMoments() {
  if (!props.moments.length) {
    emit('notice', '朋友圈还是空的')
    return
  }
  view.value = 'moments'
}

function openOfficial() {
  if (!props.official.length) {
    emit('notice', '还没有关注公众号')
    return
  }
  view.value = 'official'
}
</script>

<template>
  <div class="wx-screen">
    <!-- 入口页 -->
    <template v-if="!view">
      <header class="dc-head">
        <span class="dc-title">发现</span>
      </header>

      <div class="wx-body dc-body">
        <div class="wx-card">
          <button class="wx-cell entry" @click="openMoments">
            <span class="wx-cell-icon">
              <span class="i-ph-images" />
            </span>
            <span class="wx-cell-label">
              朋友圈
              <span class="entry-sub">
                {{ latestMoment ? `${latestMoment.author}：${latestMoment.text.slice(0, 14)}…` : '还没有动态' }}
              </span>
            </span>
            <span class="thumbs">
              <span
                v-for="chat in chats.slice(0, 3)"
                :key="chat.id"
                class="wx-avatar xs"
                :style="toneGradient(chat.tone)"
              >
                {{ chat.name.slice(0, 1) }}
              </span>
            </span>
            <span class="wx-chevron i-ph-caret-right" />
          </button>

          <button class="wx-cell entry" @click="openOfficial">
            <span class="wx-cell-icon">
              <span class="i-ph-megaphone" />
            </span>
            <span class="wx-cell-label">
              公众号
              <span class="entry-sub">{{ official.length ? `已关注 ${official.length} 个` : '还没有关注' }}</span>
            </span>
            <span v-if="unreadOfficial" class="wx-badge">{{ unreadOfficial }}</span>
            <span class="wx-chevron i-ph-caret-right" />
          </button>
        </div>

        <p class="wx-note">朋友圈 / 公众号目前是展示位，内容在阶段 3 接 AI 生成，先看结构。</p>
      </div>
    </template>

    <!-- 朋友圈 -->
    <template v-else-if="view === 'moments'">
      <header class="wx-subhead">
        <button class="wx-back" @click="view = ''">
          <span class="i-ph-caret-left" />
        </button>
        <span class="wx-subtitle">朋友圈</span>
      </header>

      <div class="wx-body feed">
        <article v-for="item in moments" :key="item.id" class="post">
          <div class="post-head">
            <span class="wx-avatar sm" :style="toneGradient(item.tone)">{{ item.author.slice(0, 1) }}</span>
            <span class="post-main">
              <span class="post-name">{{ item.author }}</span>
              <span class="post-time">{{ momentLabel(item.at) }}</span>
            </span>
          </div>
          <p class="post-text">{{ item.text }}</p>
          <div class="post-foot">
            <span class="post-tag">{{ item.tag }}</span>
            <button class="like" :class="item.liked ? 'on' : ''" @click="emit('like', item.id)">
              <span v-if="item.liked" class="i-ph-heart-fill" />
              <span v-else class="i-ph-heart" />
              <span>{{ item.likes }}</span>
            </button>
          </div>
        </article>

        <p v-if="!moments.length" class="wx-empty">
          <span class="glyph i-ph-images" />
          <span>朋友圈还没有动态</span>
        </p>
      </div>
    </template>

    <!-- 公众号 -->
    <template v-else>
      <header class="wx-subhead">
        <button class="wx-back" @click="view = ''">
          <span class="i-ph-caret-left" />
        </button>
        <span class="wx-subtitle">公众号</span>
      </header>

      <div class="wx-body feed">
        <div class="wx-card">
          <button
            v-for="item in official"
            :key="item.id"
            class="wx-row"
            @click="emit('notice', '公众号文章在阶段 3 接入')"
          >
            <span class="wx-avatar" :style="toneGradient(item.tone)">{{ item.name.slice(0, 1) }}</span>
            <span class="wx-main">
              <span class="wx-top">
                <span class="wx-name">{{ item.name }}</span>
                <span class="wx-time">{{ item.time }}</span>
              </span>
              <span class="wx-preview">{{ item.latest }}</span>
            </span>
            <span v-if="item.unread" class="wx-badge">{{ item.unread }}</span>
          </button>
        </div>

        <p v-if="!official.length" class="wx-empty">
          <span class="glyph i-ph-megaphone" />
          <span>还没有关注公众号</span>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dc-head {
  display: flex;
  flex: none;
  align-items: center;
  padding: calc(var(--u) * 10) calc(var(--u) * 14) calc(var(--u) * 8);
}

.dc-title {
  font-size: calc(var(--u) * 15);
  font-weight: 600;
  color: var(--c-text);
}

.dc-body {
  padding: calc(var(--u) * 2) calc(var(--u) * 14) calc(var(--u) * 16);
}

.entry {
  gap: calc(var(--u) * 11);
  padding: calc(var(--u) * 12);
}

.entry-sub {
  display: block;
  margin-top: calc(var(--u) * 2);
  font-size: calc(var(--u) * 10);
  font-weight: 400;
  color: var(--c-text-faint);
}

.thumbs {
  display: flex;
  flex: none;
  gap: calc(var(--u) * 3);
}

/* ---------- 朋友圈 ---------- */
.feed {
  padding: calc(var(--u) * 10) calc(var(--u) * 14) calc(var(--u) * 16);
}

.post {
  margin-bottom: calc(var(--u) * 10);
  padding: calc(var(--u) * 12);
  border-radius: calc(var(--u) * 16);
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.62);
}

.post-head {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 9);
}

.post-main {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 2);
}

.post-name {
  font-size: calc(var(--u) * 12.5);
  font-weight: 600;
  color: var(--c-text);
}

.post-time {
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-faint);
}

.post-text {
  margin: calc(var(--u) * 9) 0 0;
  font-size: calc(var(--u) * 12);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--c-text);
}

.post-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: calc(var(--u) * 10);
}

.post-tag {
  padding: calc(var(--u) * 2) calc(var(--u) * 8);
  border-radius: 999px;
  font-size: calc(var(--u) * 9.5);
  color: #c07e92;
  background: rgba(247, 168, 190, 0.16);
}

.like {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 4);
  padding: calc(var(--u) * 3) calc(var(--u) * 9);
  border-radius: 999px;
  font-size: calc(var(--u) * 10.5);
  color: var(--c-text-soft);
  background: rgba(255, 255, 255, 0.8);
}

.like.on {
  color: #d8879f;
  background: rgba(247, 168, 190, 0.2);
}

.feed .wx-card {
  padding: calc(var(--u) * 3);
}
</style>
