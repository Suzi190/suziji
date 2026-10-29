/**
 * 微信会话的「只读快照」
 * ------------------------------------------------------------
 * 记忆 App 要读聊天记录才能做总结，但数据主人是微信（vphone.wechat.v2）。
 * 所以这里只读不写：读出来、收敛成最小结构、给记忆 App 用。
 *
 * 为什么不让记忆 App 直接写 vphone.wechat.v2：
 * 微信页面在内存里也有一份 data，两边同时写会互相覆盖（谁最后写谁生效）。
 * 结论：聊天记录归微信写，记忆归 stores/memory.js 写（vphone.memory.v1），各管各的。
 */
import { MEMORY_INJECT_MAX } from '@/stores/memory'
import { loadJSON } from './storage'

export const WECHAT_STORAGE_KEY = 'vphone.wechat.v2'

function clampRounds(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 8
  return Math.min(50, Math.max(2, Math.round(num)))
}

/** 每次聊天携带几条记忆（0 = 只整理不携带），和微信那边的口径保持一致 */
function clampInjectMax(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return MEMORY_INJECT_MAX
  return Math.min(30, Math.max(0, Math.round(num)))
}

/**
 * 消息一律原样保留、不过滤 —— 记忆的整理进度 coveredCount 记的是「原始下标」，
 * 这里少留一条，记忆 App 算出来的进度就和微信对不上了。
 * 空消息 / 失败消息在组装提示词时再筛（见 api/memory.js transcriptOf）。
 */
function readMessages(raw) {
  return (Array.isArray(raw) ? raw : []).map((msg) => ({
    id: String(msg?.id || ''),
    role: msg?.role === 'me' ? 'me' : 'ai',
    text: String(msg?.text ?? ''),
    at: Number(msg?.at) || 0,
    error: Boolean(msg?.error),
  }))
}

function readChat(raw, index) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const memory = src.memory && typeof src.memory === 'object' ? src.memory : {}
  const messages = readMessages(src.messages)
  const last = messages[messages.length - 1]
  return {
    id: String(src.id || `c${index}`),
    name: String(src.name || `好友 ${index + 1}`),
    tone: String(src.tone || 'rose'),
    persona: String(src.persona || ''),
    memory: {
      enabled: Boolean(memory.enabled),
      rounds: clampRounds(memory.rounds),
      injectMax: clampInjectMax(memory.injectMax),
      prompt: String(memory.prompt || ''),
      summary: String(memory.summary || ''),
      updatedAt: Number(memory.updatedAt) || 0,
    },
    messages,
    lastAt: last?.at || 0,
  }
}

/**
 * 读出全部会话（按最近消息时间倒序）
 * 存档坏了就返回空数组，记忆 App 显示空状态即可，不弹错
 */
export function readChats() {
  const saved = loadJSON(WECHAT_STORAGE_KEY, null)
  const list = Array.isArray(saved?.chats) ? saved.chats : []
  return list.map(readChat).sort((a, b) => b.lastAt - a.lastAt)
}

/** 读我的资料（总结时把「我」的名字写进去，模型才不会把两个人搞混） */
export function readProfile() {
  const saved = loadJSON(WECHAT_STORAGE_KEY, null)
  const profile = saved?.profile && typeof saved.profile === 'object' ? saved.profile : {}
  return {
    name: String(profile.name || '我'),
    userPersona: String(profile.userPersona || ''),
  }
}
