/**
 * 记忆仓库（传统总结版）
 * ------------------------------------------------------------
 * 存什么：每个会话一本「记忆册」，里面是一条条带等级的短记忆，而不是一整段摘要。
 * 为什么不像老版本那样只存一段 summary：
 * 1. 一条条才分得出轻重缓急，注入时能按 ★★★ → ★ 挑最重要的几条
 * 2. 同一条被反复提到时可以「强化」（hits +1、等级上调），像人脑一样越用越深
 * 3. 用户可以逐条改等级、删错记的，整段摘要改不动
 *
 * 和微信的分工（重要，别混）：
 * - 聊天记录、记忆开关/轮数/自定义提示词 → 微信的 vphone.wechat.v2（微信写）
 * - 记忆条目、整理进度 → 这里 vphone.memory.v1（本仓库写）
 * 两边各写各的 key，谁也不会覆盖谁。
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { loadJSON, saveJSON } from '@/utils/storage'
import { MEMORY_LEVELS, normalizeItem } from '@/api/memory'

export const MEMORY_STORAGE_KEY = 'vphone.memory.v1'

/** 单个会话最多留多少条（超了先丢「次要 + 不常用 + 最旧」的） */
export const MEMORY_BOOK_MAX = 200

/** 一次注入最多带几条（带太多模型反而不当回事） */
export const MEMORY_INJECT_MAX = 12

let seq = 0

function newId() {
  seq += 1
  return `mm_${Date.now().toString(36)}${seq}${Math.random().toString(36).slice(2, 5)}`
}

function clampLevel(value) {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num)) return 2
  return Math.min(3, Math.max(1, num))
}

/** 去掉标点空白，用来判断「两条是不是在说同一件事」 */
function flat(text) {
  return String(text || '')
    .replace(/[\s，。、,.!！?？~～…—\-""''「」『』()（）]/g, '')
    .toLowerCase()
}

/** 同一条记忆？内容互相包含（且长度接近）就算同一件事 */
function isSameMemory(a, b) {
  const left = flat(a.text)
  const right = flat(b.text)
  if (!left || !right) return false
  if (left === right) return true
  const [short, long] = left.length <= right.length ? [left, right] : [right, left]
  if (short.length < 6) return false
  if (!long.includes(short)) return false
  return short.length / long.length >= 0.6
}

/** 排序权重：等级 > 被提到次数（越常用越靠前） */
function score(item) {
  return item.level * 1000 + Math.min(item.hits || 1, 9) * 100
}

function normalizeItemFull(raw) {
  const base = normalizeItem(raw)
  if (!base) return null
  return {
    ...base,
    id: String(raw?.id || newId()),
    at: Number(raw?.at) || Date.now(),
    hits: Math.max(1, Math.min(99, Math.round(Number(raw?.hits) || 1))),
  }
}

function normalizeBook(raw, chatId) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const items = (Array.isArray(src.items) ? src.items : [])
    .map(normalizeItemFull)
    .filter(Boolean)
    .slice(0, MEMORY_BOOK_MAX)
  return {
    chatId,
    name: String(src.name || ''),
    items,
    coveredCount: Math.max(0, Math.round(Number(src.coveredCount) || 0)),
    lastAt: Number(src.lastAt) || 0,
    createdAt: Number(src.createdAt) || Date.now(),
  }
}

function loadBooks() {
  const saved = loadJSON(MEMORY_STORAGE_KEY, null)
  const raw = saved?.books && typeof saved.books === 'object' ? saved.books : {}
  const books = {}
  for (const [chatId, value] of Object.entries(raw)) {
    if (!chatId) continue
    books[chatId] = normalizeBook(value, chatId)
  }
  return books
}

export const useMemoryStore = defineStore('memory', () => {
  const books = ref(loadBooks())

  let saveTimer = null
  watch(
    books,
    (value) => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => saveJSON(MEMORY_STORAGE_KEY, { version: 1, books: value }), 250)
    },
    { deep: true },
  )

  // ---------------- 派生 ----------------
  const bookList = computed(() => Object.values(books.value))
  const totalItems = computed(() => bookList.value.reduce((sum, book) => sum + book.items.length, 0))
  const bookCount = computed(() => bookList.value.filter((book) => book.items.length).length)

  /** 某个会话的记忆册（没有就返回 null，不自动建） */
  function bookOf(chatId) {
    return books.value[chatId] ?? null
  }

  /** 某个会话的三档条数，详情页头部用 */
  function stats(chatId) {
    const items = books.value[chatId]?.items ?? []
    const core = items.filter((item) => item.level === 3).length
    const important = items.filter((item) => item.level === 2).length
    return { total: items.length, core, important, minor: items.length - core - important }
  }

  // ---------------- 写入 ----------------

  /** 拿不到就建一本空册子 */
  function ensure(chatId, name = '') {
    if (!chatId) return null
    if (!books.value[chatId]) {
      books.value[chatId] = normalizeBook({ name }, chatId)
    } else if (name && !books.value[chatId].name) {
      books.value[chatId].name = name
    }
    return books.value[chatId]
  }

  /** 超量时先丢低等级、少被提到的（人脑也是先忘琐事） */
  function trim(book) {
    if (book.items.length <= MEMORY_BOOK_MAX) return
    const keep = [...book.items].sort((a, b) => score(b) - score(a) || b.at - a.at)
    keep.length = MEMORY_BOOK_MAX
    book.items = keep
  }

  /**
   * 吸收一次总结结果
   * - 说同一件事的：合并（hits+1、等级取高、补时间/原话）—— 这就是「反复强调会记得更牢」
   * - 新的：插到最前
   * coveredCount 传了就更新整理进度（哪怕一条都没整理出来也要前进，否则会反复整理同一段）
   */
  function absorb(chatId, { name = '', items = [], coveredCount } = {}) {
    const book = ensure(chatId, name)
    if (!book) return { added: 0, merged: 0 }
    if (name) book.name = name

    let added = 0
    let merged = 0
    for (const raw of items) {
      const incoming = normalizeItemFull(raw)
      if (!incoming) continue
      const exist = book.items.find((item) => isSameMemory(item, incoming))
      if (!exist) {
        book.items.unshift({ ...incoming, id: newId(), at: Date.now(), hits: 1 })
        added += 1
        continue
      }
      exist.hits = Math.min(99, exist.hits + 1)
      exist.level = Math.max(exist.level, incoming.level)
      if (!exist.when && incoming.when) exist.when = incoming.when
      if (!exist.quote && incoming.quote) exist.quote = incoming.quote
      if (exist.kind === 'fact' && incoming.kind !== 'fact') exist.kind = incoming.kind
      // 被提到 2 次 → 至少「重要」；3 次 → 「关键」（像人脑的强化）
      if (exist.hits >= 3) exist.level = 3
      else if (exist.hits >= 2) exist.level = Math.max(exist.level, 2)
      exist.at = Date.now()
      merged += 1
    }

    trim(book)
    if (Number.isFinite(Number(coveredCount))) {
      book.coveredCount = Math.max(0, Math.round(Number(coveredCount)))
    }
    book.lastAt = Date.now()
    return { added, merged }
  }

  /** 手动加一条（用户在记忆 App 里补记） */
  function addItem(chatId, { text, level = 2, kind = 'fact', when = '', quote = '' } = {}) {
    const book = ensure(chatId)
    if (!book) return null
    const item = normalizeItemFull({ text, level, kind, when, quote })
    if (!item) return null
    book.items.unshift(item)
    trim(book)
    book.lastAt = Date.now()
    return item
  }

  function updateItem(chatId, itemId, patch = {}) {
    const item = books.value[chatId]?.items.find((one) => one.id === itemId)
    if (!item) return null
    if (patch.text !== undefined) {
      const text = String(patch.text).replace(/\s+/g, ' ').trim().slice(0, 80)
      if (text) item.text = text
    }
    if (patch.level !== undefined) item.level = clampLevel(patch.level)
    if (patch.when !== undefined) item.when = String(patch.when).slice(0, 20)
    if (patch.kind !== undefined) item.kind = String(patch.kind)
    item.at = Date.now()
    return item
  }

  /** 点一下换档：★ → ★★ → ★★★ → ★ */
  function cycleLevel(chatId, itemId) {
    const item = books.value[chatId]?.items.find((one) => one.id === itemId)
    if (!item) return null
    item.level = item.level >= 3 ? 1 : item.level + 1
    return item
  }

  function removeItem(chatId, itemId) {
    const book = books.value[chatId]
    if (!book) return
    const index = book.items.findIndex((item) => item.id === itemId)
    if (index >= 0) book.items.splice(index, 1)
  }

  /** 清空记忆，同时把整理进度归零（否则新记忆得等新一轮才会长出来） */
  function clearBook(chatId) {
    const book = books.value[chatId]
    if (!book) return
    book.items = []
    book.coveredCount = 0
    book.lastAt = Date.now()
  }

  /** 从头再整理一遍：只把进度归零，旧条目留着，靠合并去重 */
  function resetProgress(chatId) {
    const book = books.value[chatId]
    if (!book) return
    book.coveredCount = 0
  }

  // ---------------- 读出 / 注入 ----------------

  /** 按重要程度挑记忆：等级高在前，同级新的在前 */
  function collect(chatId, { max = MEMORY_INJECT_MAX, minLevel = 1 } = {}) {
    const items = books.value[chatId]?.items ?? []
    return [...items]
      .filter((item) => item.level >= minLevel)
      .sort((a, b) => b.level - a.level || b.at - a.at)
      .slice(0, max)
  }

  /**
   * 拼成一段 system 注进对话
   * 没有记忆就返回空字符串，调用方据此决定加不加这段
   */
  function render(chatId, options) {
    const list = collect(chatId, options)
    if (!list.length) return ''
    const lines = list.map((item) => {
      const mark = MEMORY_LEVELS.find((lv) => lv.id === item.level)?.mark ?? '★★'
      const when = item.when ? `${item.when} · ` : ''
      return `${mark} ${when}${item.text}`
    })
    return [
      '【你记得的事】',
      '下面这些是你亲身经历过、现在还记得的事，★★★ 最重要。',
      '用的时候自然带出来（称呼、习惯、说过的话照实来），不要逐条复述，也不要提「记忆」「记录」这些词。',
      ...lines,
    ].join('\n')
  }

  /** 还有多少条「我」的消息没整理（微信判断要不要自动整理时用） */
  function pendingRounds(chatId, messages = []) {
    const from = books.value[chatId]?.coveredCount ?? 0
    return messages
      .slice(Math.max(0, Math.min(from, messages.length)))
      .filter((msg) => msg.role === 'me' && !msg.error).length
  }

  return {
    books,
    bookList,
    totalItems,
    bookCount,
    bookOf,
    stats,
    ensure,
    absorb,
    addItem,
    updateItem,
    cycleLevel,
    removeItem,
    clearBook,
    resetProgress,
    collect,
    render,
    pendingRounds,
  }
})

