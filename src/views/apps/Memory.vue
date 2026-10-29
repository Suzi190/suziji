<script setup>
/**
 * 记忆 App · 传统总结版
 * ------------------------------------------------------------
 * 做三件事：
 * 1. 看：每个会话一本记忆册，一条条带等级（★★★ 关键 / ★★ 重要 / ★ 次要）
 * 2. 整理：把「还没整理过」的聊天交给 AI 压成条目，说同一件事的自动合并强化
 * 3. 改：点星星调轻重、点文字直接改、删错的、手动补记
 *
 * 数据分工（别搞混）：
 * - 记忆条目、整理进度 → stores/memory.js（vphone.memory.v1）
 * - 聊天记录、记忆开关/轮数 → 微信的 vphone.wechat.v2，这里只读不写
 * 所以本页不提供「记忆开关」，要在微信「⋯ → 聊天记忆」里开。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { describeError } from '@/api/openaiStream'
import { MEMORY_LEVELS, kindName, summarizeChat } from '@/api/memory'
import { useAIConfigStore } from '@/stores/aiConfig'
import { MEMORY_INJECT_MAX, useMemoryStore } from '@/stores/memory'
import { readChats, readProfile } from '@/utils/chatSource'
import { timeLabel, toneGradient } from '@/components/wechat/shared'

const ai = useAIConfigStore()
const memory = useMemoryStore()

/** 会话快照：进页面读一次，整理完再读（微信那边可能刚聊完） */
const chats = ref(readChats())
const profile = ref(readProfile())

/** 空字符串 = 停在列表；否则是正在看的会话 id */
const openId = ref('')
const busy = ref(false)
const busyLabel = ref('')
const toast = ref('')
let toastTimer = null
let controller = null

/** 手动补记的草稿 */
const draft = ref({ text: '', level: 2, kind: 'fact', when: '' })
/** 正在行内编辑的条目 id */
const editId = ref('')
const editText = ref('')

const rows = computed(() =>
  chats.value.map((chat) => ({
    chat,
    stats: memory.stats(chat.id),
    lastAt: memory.bookOf(chat.id)?.lastAt || 0,
    pending: pendingOf(chat),
    enabled: chat.memory.enabled,
    rounds: chat.memory.rounds,
  })),
)

const open = computed(() => chats.value.find((chat) => chat.id === openId.value) ?? null)
const book = computed(() => memory.bookOf(openId.value))
const openStats = computed(() => memory.stats(openId.value))
const covered = computed(() => book.value?.coveredCount ?? 0)
const totalMessages = computed(() => open.value?.messages.length ?? 0)
const percent = computed(() => {
  if (!totalMessages.value) return 0
  return Math.min(100, Math.round((covered.value / totalMessages.value) * 100))
})

/** 记忆册里的条目：等级高的在前，同级新的在前 */
const items = computed(() => {
  const list = memory.bookOf(openId.value)?.items ?? []
  return [...list].sort((a, b) => b.level - a.level || b.at - a.at)
})

const pending = computed(() => (open.value ? pendingOf(open.value) : 0))

/** 还有几条我发的消息没整理（口径和 store 一致：都按原始下标算） */
function pendingOf(chat) {
  return chat.messages
    .slice(coveredIndexOf(chat))
    .filter((msg) => msg.role === 'me' && !msg.error && msg.text.trim()).length
}

function coveredIndexOf(chat) {
  const raw = memory.bookOf(chat.id)?.coveredCount ?? 0
  return Math.max(0, Math.min(raw, chat.messages.length))
}

/** 三档在 stats 里的字段名（core / important / minor） */
function statKey(level) {
  if (level === 3) return 'core'
  if (level === 2) return 'important'
  return 'minor'
}

function markOf(level) {
  return MEMORY_LEVELS.find((item) => item.id === level)?.mark ?? '★★'
}

function levelName(level) {
  return MEMORY_LEVELS.find((item) => item.id === level)?.name ?? '重要'
}

function statusText(row) {
  if (!row.enabled) return '记忆未开启 · 去微信「⋯ → 聊天记忆」打开'
  if (!row.stats.total) return `满 ${row.rounds} 轮自动整理 · 现在还没记下任何事`
  if (row.pending >= row.rounds) return `已记 ${row.stats.total} 条 · 有 ${row.pending} 条新消息等着整理`
  return `已记 ${row.stats.total} 条 · 还有 ${row.pending} 条没整理`
}

const progressNote = computed(() => {
  const chat = open.value
  if (!chat) return ''
  if (!chat.memory.enabled) {
    return '记忆开关现在是关的：聊天时不会带上记忆，也不会自动整理。去微信「⋯ → 聊天记忆」打开。'
  }
  if (busy.value) return busyLabel.value
  if (pending.value >= chat.memory.rounds) {
    return `已经攒够 ${chat.memory.rounds} 轮了，你下次在微信里收到回复后会自动整理。`
  }
  return `满 ${chat.memory.rounds} 轮自动整理（还差 ${chat.memory.rounds - pending.value} 条你发的消息）`
})

/**
 * 每次聊天会带进去几条记忆
 * 条数在微信「⋯ → 聊天记忆 → 携带条数」里定，这里只读来显示，避免两边各说一套
 */
const carryMax = computed(() => open.value?.memory?.injectMax ?? MEMORY_INJECT_MAX)

const carryNote = computed(() => {
  if (!carryMax.value) {
    return '聊天时不携带记忆（只整理）· 想带进去就去微信「⋯ → 聊天记忆」把携带条数调大'
  }
  if (!openStats.value.total) return `还没有记忆可带 · 最多带 ${carryMax.value} 条`
  const carried = Math.min(carryMax.value, openStats.value.total)
  return `每次聊天带 ${carried} 条（★★★ 优先，同级先带最近提到的）· 可在微信「⋯ → 聊天记忆」调整`
})

function flash(text) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2200)
}

/** 重新读一遍微信的会话快照（只读，不改微信数据） */
function refreshChats() {
  chats.value = readChats()
  profile.value = readProfile()
}

// ---------------- 列表 ↔ 详情 ----------------
function openChat(chat) {
  openId.value = chat.id
  draft.value = { text: '', level: 2, kind: 'fact', when: '' }
  editId.value = ''
  refreshChats()
}

function back() {
  if (controller) controller.abort()
  openId.value = ''
  editId.value = ''
}

// ---------------- 整理 ----------------
/**
 * 让 AI 整理一段聊天
 * @param {'pending'|'all'} mode pending=只整理新消息（默认）/ all=从头再来一遍
 */
async function summarize(mode = 'pending') {
  const chat = open.value
  if (!chat || busy.value) return
  if (!ai.isConfigured) {
    flash('还没配置 AI 接口：桌面打开「设置」，填接口地址和模型后保存')
    return
  }

  const from = mode === 'all' ? 0 : coveredIndexOf(chat)
  const total = chat.messages.length
  if (from >= total) {
    flash('没有新的聊天记录了，等聊几句再回来')
    return
  }

  busy.value = true
  busyLabel.value = mode === 'all' ? '从头整理中…' : '整理新消息中…'
  controller = new AbortController()
  try {
    const result = await summarizeChat({
      config: ai.config,
      session: { id: chat.id, name: chat.name, messages: chat.messages },
      items: memory.collect(chat.id, { max: 40 }),
      fromIndex: from,
      userName: profile.value.name || '我',
      extraPrompt: chat.memory.prompt,
      signal: controller.signal,
    })
    const info = memory.absorb(chat.id, {
      name: chat.name,
      items: result.items,
      coveredCount: total,
    })
    if (info.added || info.merged) {
      flash(`记下 ${info.added} 条 · 补全 ${info.merged} 条`)
    } else {
      flash('这次没发现值得记的事')
    }
    refreshChats()
  } catch (err) {
    const detail = describeError(err)
    flash(/取消|abort/i.test(detail) ? '已停止整理' : `整理失败：${detail}`)
  } finally {
    busy.value = false
    busyLabel.value = ''
    controller = null
  }
}

// ---------------- 编改条目 ----------------
/** 点星星换等级：★ → ★★ → ★★★ → ★ */
function cycle(item) {
  const next = memory.cycleLevel(openId.value, item.id)
  if (next) flash(`已设为「${levelName(next.level)}」`)
}

function startEdit(item) {
  editId.value = item.id
  editText.value = item.text
}

function saveEdit() {
  const text = editText.value.trim()
  if (!text) {
    flash('内容不能是空的')
    return
  }
  memory.updateItem(openId.value, editId.value, { text })
  editId.value = ''
  flash('已改好')
}

function cancelEdit() {
  editId.value = ''
}

function removeItem(item) {
  if (!window.confirm(`删掉这条记忆？\n\n${item.text}`)) return
  memory.removeItem(openId.value, item.id)
  if (editId.value === item.id) editId.value = ''
}

function addManual() {
  const text = draft.value.text.trim()
  if (!text) {
    flash('先写点什么')
    return
  }
  const item = memory.addItem(openId.value, { ...draft.value, text })
  if (!item) {
    flash('这条没加上，换个说法试试')
    return
  }
  draft.value = { text: '', level: 2, kind: 'fact', when: '' }
  flash(`已补记一条（${levelName(item.level)}）`)
}

function clearAll() {
  const chat = open.value
  if (!chat) return
  if (!window.confirm(`清空「${chat.name}」的全部记忆？整理进度也会归零，不能恢复。`)) return
  memory.clearBook(chat.id)
  flash('已清空')
}

onBeforeUnmount(() => {
  if (controller) controller.abort()
  controller = null
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="mem">
    <!-- ==================== 列表 ==================== -->
    <template v-if="!openId">
      <header class="head">
        <div class="head-main">
          <h1 class="head-title">记忆</h1>
          <p class="head-sub">AI 记得你的事，按轻重排好</p>
        </div>
        <div class="head-badge">
          <span class="head-num">{{ memory.totalItems }}</span>
          <span class="head-unit">条</span>
        </div>
      </header>

      <!-- 三档说明：第一次进来就知道星星代表什么 -->
      <div class="legend glass">
        <div v-for="lv in MEMORY_LEVELS" :key="lv.id" class="legend-row" :data-level="lv.id">
          <span class="legend-mark">{{ lv.mark }}</span>
          <span class="legend-name">{{ lv.name }}</span>
          <span class="legend-desc">{{ lv.desc }}</span>
        </div>
      </div>

      <p v-if="!rows.length" class="empty">
        还没有聊天记录。<br />去微信和谁聊几句，再回来整理记忆。
      </p>

      <div v-else class="list">
        <button
          v-for="row in rows"
          :key="row.chat.id"
          class="card glass"
          @click="openChat(row.chat)"
        >
          <span class="avatar" :style="toneGradient(row.chat.tone)">
            {{ row.chat.name.slice(0, 1) }}
          </span>
          <span class="card-main">
            <span class="card-top">
              <span class="card-name">{{ row.chat.name }}</span>
              <span v-if="row.stats.total" class="card-count">{{ row.stats.total }} 条</span>
              <span v-else class="card-count off">空</span>
            </span>
            <span class="card-status">{{ statusText(row) }}</span>
            <span class="card-meta">
              <span v-if="row.lastAt" class="card-time">上次整理 {{ timeLabel(row.lastAt) }}</span>
              <span v-else class="card-time">还没整理过</span>
              <span v-if="row.stats.core" class="card-pill" data-level="3">
                {{ row.stats.core }} 关键
              </span>
              <span v-if="row.stats.important" class="card-pill" data-level="2">
                {{ row.stats.important }} 重要
              </span>
            </span>
          </span>
          <span class="i-ph-caret-right card-arrow" />
        </button>
      </div>

      <p class="tip">
        记忆只存在这台设备本地，不会上传。记忆开关和整理轮数在
        微信 → 聊天右上角「⋯」→ 聊天记忆 里改。
      </p>
    </template>

    <!-- ==================== 详情 ==================== -->
    <template v-else>
      <div class="top">
        <button class="back" aria-label="返回记忆列表" @click="back">
          <span class="i-ph-caret-left" />
        </button>
        <div class="top-main">
          <span class="top-name">{{ open?.name }}</span>
          <span class="top-sub">{{ openStats.total }} 条记忆 · 关键 {{ openStats.core }}</span>
        </div>
        <button class="run" :disabled="busy" @click="summarize('pending')">
          <span :class="busy ? 'i-ph-circle-notch spin' : 'i-ph-sparkle'" />
          <span class="run-text">{{ busy ? '整理中' : '整理' }}</span>
        </button>
      </div>

      <!-- 整理进度：让用户知道 AI 读到哪了 -->
      <section class="progress glass">
        <div class="progress-head">
          <span class="progress-label">整理进度</span>
          <span class="progress-value">{{ covered }} / {{ totalMessages }} 条</span>
        </div>
        <div class="bar"><span class="bar-fill" :style="{ width: percent + '%' }" /></div>
        <p class="progress-note" :class="{ warn: !open?.memory.enabled }">{{ progressNote }}</p>
        <p class="progress-carry" :class="{ off: !carryMax }">
          <span :class="carryMax ? 'i-ph-brain' : 'i-ph-prohibit'" />
          <span>{{ carryNote }}</span>
        </p>
        <div class="progress-actions">
          <button class="mini" :disabled="busy" @click="summarize('all')">从头整理</button>
          <button class="mini" :disabled="busy || !openStats.total" @click="clearAll">清空记忆</button>
        </div>
      </section>

      <!-- 三档计数 -->
      <div class="levels">
        <div v-for="lv in MEMORY_LEVELS" :key="lv.id" class="level-card glass" :data-level="lv.id">
          <span class="level-mark">{{ lv.mark }}</span>
          <span class="level-num">{{ openStats[statKey(lv.id)] }}</span>
          <span class="level-name">{{ lv.name }}</span>
        </div>
      </div>

      <!-- 手动补记 -->
      <section class="add glass">
        <textarea
          v-model="draft.text"
          class="add-input"
          rows="2"
          placeholder="手动补记一条，比如：她一直不喜欢被叫「宝贝」"
        />
        <div class="add-row">
          <div class="seg">
            <button
              v-for="lv in MEMORY_LEVELS"
              :key="lv.id"
              class="seg-btn"
              :class="{ on: draft.level === lv.id }"
              :data-level="lv.id"
              @click="draft.level = lv.id"
            >
              {{ lv.mark }}
            </button>
          </div>
          <button class="add-btn" @click="addManual">补记</button>
        </div>
      </section>

      <p v-if="!items.length" class="empty small">
        这条会话还没有记忆。<br />点右上角「整理」，或者在上面手动补记一条。
      </p>

      <ul v-else class="items">
        <li v-for="item in items" :key="item.id" class="item glass" :data-level="item.level">
          <button
            class="item-mark"
            :aria-label="`当前${levelName(item.level)}，点一下换等级`"
            @click="cycle(item)"
          >
            {{ markOf(item.level) }}
          </button>
          <div class="item-main">
            <template v-if="editId === item.id">
              <textarea v-model="editText" class="item-edit" rows="2" />
              <div class="item-edit-row">
                <button class="mini" @click="cancelEdit">算了</button>
                <button class="mini primary" @click="saveEdit">保存</button>
              </div>
            </template>
            <template v-else>
              <p class="item-text" @click="startEdit(item)">{{ item.text }}</p>
              <p class="item-meta">
                <span class="item-kind">{{ kindName(item.kind) }}</span>
                <span v-if="item.when" class="item-when">{{ item.when }}</span>
                <span v-if="item.hits > 1" class="item-hits">提到 {{ item.hits }} 次</span>
              </p>
              <p v-if="item.quote" class="item-quote">「{{ item.quote }}」</p>
            </template>
          </div>
          <button class="item-del" aria-label="删除这条" @click="removeItem(item)">
            <span class="i-ph-x" />
          </button>
        </li>
      </ul>

      <p class="tip">
        点星星能改轻重（★ → ★★ → ★★★），点文字能直接改。右上角「整理」只读你还没整理过的聊天。
      </p>
    </template>

    <transition name="toast-fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
/* ============================================================
 * 记忆 · 外观
 * 尺寸全走 --u（设计像素），无阴影，磨砂玻璃 + 细描边
 * 等级只用「星星 + 一点颜色深浅」区分，不搞花哨色块
 * ============================================================ */
.mem {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 12);
  padding: calc(var(--u) * 14) calc(var(--u) * 14) calc(var(--u) * 28);
}

/* ---------------- 列表头部 ---------------- */
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: calc(var(--u) * 10);
}

.head-title {
  margin: 0;
  font-size: calc(var(--u) * 21);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--c-text);
}

.head-sub {
  margin: calc(var(--u) * 3) 0 0;
  font-size: calc(var(--u) * 10.5);
  color: var(--c-text-soft);
}

.head-badge {
  display: flex;
  align-items: baseline;
  gap: calc(var(--u) * 2);
  padding: calc(var(--u) * 5) calc(var(--u) * 10);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.9);
}

.head-num {
  font-size: calc(var(--u) * 15);
  font-weight: 600;
  color: var(--c-accent-deep);
}

.head-unit {
  font-size: calc(var(--u) * 9);
  color: var(--c-text-faint);
}

/* ---------------- 三档说明 ---------------- */
.legend {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 7);
  padding: calc(var(--u) * 11) calc(var(--u) * 12);
  border-radius: calc(var(--u) * 14);
}

.legend-row {
  display: flex;
  align-items: baseline;
  gap: calc(var(--u) * 7);
}

.legend-mark {
  flex: none;
  width: calc(var(--u) * 30);
  font-size: calc(var(--u) * 9.5);
  letter-spacing: calc(var(--u) * -0.3);
  color: var(--c-text-faint);
}

.legend-name {
  flex: none;
  font-size: calc(var(--u) * 10.5);
  font-weight: 600;
  color: var(--c-text-soft);
}

.legend-desc {
  flex: 1;
  font-size: calc(var(--u) * 9.5);
  line-height: 1.5;
  color: var(--c-text-faint);
}

.legend-row[data-level='3'] .legend-mark,
.legend-row[data-level='3'] .legend-name {
  color: #c85a80;
}

.legend-row[data-level='2'] .legend-mark,
.legend-row[data-level='2'] .legend-name {
  color: #b78553;
}

/* ---------------- 会话卡片 ---------------- */
.list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 8);
}

.card {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 10);
  padding: calc(var(--u) * 11) calc(var(--u) * 12);
  border-radius: calc(var(--u) * 15);
  text-align: left;
}

.card:active {
  background: rgba(255, 255, 255, 0.86);
}

.avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 34);
  height: calc(var(--u) * 34);
  border-radius: calc(var(--u) * 11);
  font-size: calc(var(--u) * 14);
  color: #fff;
}

.card-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 3);
}

.card-top {
  display: flex;
  align-items: baseline;
  gap: calc(var(--u) * 6);
}

.card-name {
  font-size: calc(var(--u) * 12);
  font-weight: 600;
  color: var(--c-text);
}

.card-count {
  font-size: calc(var(--u) * 9);
  color: var(--c-accent-deep);
}

.card-count.off {
  color: var(--c-text-faint);
}

.card-status {
  overflow: hidden;
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 5);
  font-size: calc(var(--u) * 8.5);
  color: var(--c-text-faint);
}

.card-pill {
  padding: 0 calc(var(--u) * 5);
  border-radius: 999px;
  line-height: calc(var(--u) * 13);
  background: rgba(255, 255, 255, 0.8);
}

.card-pill[data-level='3'] {
  color: #c85a80;
}

.card-pill[data-level='2'] {
  color: #b78553;
}

.card-arrow {
  flex: none;
  font-size: calc(var(--u) * 11);
  color: var(--c-text-faint);
}

/* ---------------- 详情顶部 ---------------- */
.top {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 8);
  padding: calc(var(--u) * 2) 0 calc(var(--u) * 8);
  background: linear-gradient(180deg, rgba(255, 250, 252, 0.98) 68%, rgba(255, 250, 252, 0));
}

.back {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 28);
  height: calc(var(--u) * 28);
  border-radius: 999px;
  font-size: calc(var(--u) * 13);
  color: var(--c-text-soft);
  background: rgba(255, 255, 255, 0.72);
}

.top-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 2);
}

.top-name {
  overflow: hidden;
  font-size: calc(var(--u) * 13);
  font-weight: 600;
  color: var(--c-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-sub {
  font-size: calc(var(--u) * 9);
  color: var(--c-text-faint);
}

.run {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 4);
  height: calc(var(--u) * 28);
  padding: 0 calc(var(--u) * 12);
  border-radius: 999px;
  font-size: calc(var(--u) * 10.5);
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.run:disabled {
  opacity: 0.6;
}

.spin {
  animation: mem-spin 0.9s linear infinite;
}

@keyframes mem-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------------- 整理进度 ---------------- */
.progress {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 7);
  padding: calc(var(--u) * 11) calc(var(--u) * 12);
  border-radius: calc(var(--u) * 14);
}

.progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.progress-label {
  font-size: calc(var(--u) * 10.5);
  font-weight: 600;
  color: var(--c-text-soft);
}

.progress-value {
  font-size: calc(var(--u) * 9);
  color: var(--c-text-faint);
}

.bar {
  overflow: hidden;
  height: calc(var(--u) * 4);
  border-radius: 999px;
  background: rgba(124, 101, 112, 0.12);
}

.bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #f7b8c9, #e28ca6);
  transition: width 0.3s ease;
}

.progress-note {
  margin: 0;
  font-size: calc(var(--u) * 9.5);
  line-height: 1.55;
  color: var(--c-text-soft);
}

.progress-note.warn {
  color: #c06a86;
}

/* 「每次带几条」这行：比说明文字再轻一点，旁边配个小图标 */
.progress-carry {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--u) * 5);
  margin: 0;
  font-size: calc(var(--u) * 9);
  line-height: 1.5;
  color: var(--c-text-soft);
  opacity: 0.9;
}

.progress-carry span:first-child {
  flex: none;
  font-size: calc(var(--u) * 11);
  line-height: 1.25;
}

.progress-carry.off {
  color: #c06a86;
  opacity: 1;
}

.progress-actions {
  display: flex;
  gap: calc(var(--u) * 6);
}

.mini {
  padding: calc(var(--u) * 4) calc(var(--u) * 10);
  border-radius: 999px;
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-soft);
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.9);
}

.mini:disabled {
  opacity: 0.45;
}

.mini.primary {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

/* ---------------- 三档计数 ---------------- */
.levels {
  display: flex;
  gap: calc(var(--u) * 7);
}

.level-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--u) * 2);
  padding: calc(var(--u) * 9) 0;
  border-radius: calc(var(--u) * 13);
}

.level-mark {
  font-size: calc(var(--u) * 8.5);
  letter-spacing: calc(var(--u) * -0.3);
  color: var(--c-text-faint);
}

.level-num {
  font-size: calc(var(--u) * 15);
  font-weight: 600;
  line-height: 1.1;
  color: var(--c-text);
}

.level-name {
  font-size: calc(var(--u) * 8.5);
  color: var(--c-text-faint);
}

.level-card[data-level='3'] .level-mark,
.level-card[data-level='3'] .level-num {
  color: #c85a80;
}

.level-card[data-level='2'] .level-mark,
.level-card[data-level='2'] .level-num {
  color: #b78553;
}

/* ---------------- 手动补记 ---------------- */
.add {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 7);
  padding: calc(var(--u) * 10) calc(var(--u) * 11);
  border-radius: calc(var(--u) * 14);
}

.add-input {
  width: 100%;
  border: 0;
  background: none;
  outline: none;
  resize: none;
  font-size: calc(var(--u) * 10.5);
  line-height: 1.6;
  color: var(--c-text);
}

.add-input::placeholder {
  color: var(--c-text-faint);
}

.add-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--u) * 8);
}

.seg {
  display: flex;
  gap: calc(var(--u) * 4);
}

.seg-btn {
  padding: calc(var(--u) * 3) calc(var(--u) * 8);
  border-radius: 999px;
  font-size: calc(var(--u) * 8.5);
  letter-spacing: calc(var(--u) * -0.3);
  color: var(--c-text-faint);
  background: rgba(255, 255, 255, 0.7);
}

.seg-btn.on {
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.add-btn {
  flex: none;
  padding: calc(var(--u) * 5) calc(var(--u) * 13);
  border-radius: 999px;
  font-size: calc(var(--u) * 10);
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

/* ---------------- 记忆条目 ---------------- */
.items {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 7);
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--u) * 8);
  padding: calc(var(--u) * 10) calc(var(--u) * 11);
  border-radius: calc(var(--u) * 14);
  border-left: calc(var(--u) * 2.5) solid transparent;
}

.item[data-level='3'] {
  border-left-color: #e28ca6;
  background: rgba(255, 246, 249, 0.86);
}

.item[data-level='2'] {
  border-left-color: #e0bd99;
}

.item[data-level='1'] {
  border-left-color: rgba(124, 101, 112, 0.18);
}

.item-mark {
  flex: none;
  padding-top: calc(var(--u) * 1);
  font-size: calc(var(--u) * 8.5);
  letter-spacing: calc(var(--u) * -0.3);
  color: var(--c-text-faint);
  white-space: nowrap;
}

.item[data-level='3'] .item-mark {
  color: #c85a80;
}

.item[data-level='2'] .item-mark {
  color: #b78553;
}

.item-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 4);
}

.item-text {
  margin: 0;
  font-size: calc(var(--u) * 10.5);
  line-height: 1.6;
  color: var(--c-text);
}

.item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 6);
  margin: 0;
  font-size: calc(var(--u) * 8.5);
  color: var(--c-text-faint);
}

.item-kind {
  padding: 0 calc(var(--u) * 5);
  border-radius: 999px;
  line-height: calc(var(--u) * 12);
  background: rgba(255, 255, 255, 0.82);
}

.item-quote {
  margin: 0;
  font-size: calc(var(--u) * 9);
  line-height: 1.5;
  color: var(--c-text-faint);
}

.item-edit {
  width: 100%;
  padding: calc(var(--u) * 6) calc(var(--u) * 7);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: calc(var(--u) * 9);
  background: rgba(255, 255, 255, 0.85);
  outline: none;
  resize: none;
  font-size: calc(var(--u) * 10.5);
  line-height: 1.55;
  color: var(--c-text);
}

.item-edit-row {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--u) * 5);
}

.item-del {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 20);
  height: calc(var(--u) * 20);
  border-radius: 999px;
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-faint);
  background: rgba(124, 101, 112, 0.08);
}

/* ---------------- 空状态 / 说明 ---------------- */
.empty {
  margin: calc(var(--u) * 6) 0;
  padding: calc(var(--u) * 22) calc(var(--u) * 14);
  border-radius: calc(var(--u) * 16);
  font-size: calc(var(--u) * 10.5);
  line-height: 1.8;
  color: var(--c-text-soft);
  text-align: center;
  background: rgba(255, 255, 255, 0.42);
  border: 1px dashed rgba(255, 255, 255, 0.9);
}

.empty.small {
  padding: calc(var(--u) * 16) calc(var(--u) * 12);
  font-size: calc(var(--u) * 10);
}

.tip {
  margin: 0;
  font-size: calc(var(--u) * 8.5);
  line-height: 1.7;
  color: var(--c-text-faint);
  text-align: center;
}

/* ---------------- toast ---------------- */
.toast {
  position: sticky;
  bottom: calc(var(--u) * 12);
  z-index: 9;
  align-self: center;
  max-width: 84%;
  padding: calc(var(--u) * 8) calc(var(--u) * 14);
  border-radius: 999px;
  font-size: calc(var(--u) * 10);
  line-height: 1.5;
  color: #fff;
  text-align: center;
  background: rgba(120, 92, 105, 0.92);
  backdrop-filter: blur(calc(var(--u) * 10));
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(calc(var(--u) * 6));
}
</style>

