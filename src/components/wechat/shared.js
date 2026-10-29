/**
 * 微信页共用小工具：头像配色 / 时间文案 / id / 默认表情
 * 四个 Tab 都从这里取，避免各写一份
 */

/** 头像配色（低饱和，配磨砂玻璃） */
export const TONES = [
  { id: 'rose', from: '#f7b8c9', to: '#e28ca6' },
  { id: 'milk', from: '#f3dcc8', to: '#dfb89a' },
  { id: 'lilac', from: '#d9cdf0', to: '#b3a2d8' },
  { id: 'mint', from: '#c8e6dc', to: '#9dc9bb' },
  { id: 'sky', from: '#cfe0f2', to: '#a2bcd8' },
  { id: 'ink', from: '#bdb6c1', to: '#8d8592' },
]

/** 取配色对象，未知 id 回落第一个 */
export function toneOf(tone) {
  return TONES.find((item) => item.id === tone) ?? TONES[0]
}

/** 生成头像背景样式 */
export function toneGradient(tone) {
  const item = toneOf(tone)
  return { background: `linear-gradient(135deg, ${item.from}, ${item.to})` }
}

/** 生成唯一 id */
export function uid(prefix = 'wx') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const pad = (num) => String(num).padStart(2, '0')

const startOfDay = (at) => {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const dayDiff = (at) => Math.round((startOfDay(Date.now()) - startOfDay(at)) / 86400000)

const WEEK = '日一二三四五六'

/** 会话列表角标时间：14:20 / 昨天 / 周三 / 10/24 */
export function timeLabel(at) {
  if (!at) return ''
  const date = new Date(at)
  const diff = dayDiff(at)
  if (diff <= 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (diff === 1) return '昨天'
  if (diff < 7) return `周${WEEK[date.getDay()]}`
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 聊天里的时间条：今天 14:20 / 昨天 09:12 / 10月24日 21:04 */
export function stampLabel(at) {
  if (!at) return ''
  const date = new Date(at)
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const diff = dayDiff(at)
  if (diff <= 0) return clock
  if (diff === 1) return `昨天 ${clock}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`
}

/** 朋友圈时间：刚刚 / 12 分钟前 / 昨天 / 10月24日 */
export function momentLabel(at) {
  if (!at) return ''
  const minutes = Math.floor((Date.now() - at) / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const diff = dayDiff(at)
  if (diff <= 0) return `${Math.floor(minutes / 60)} 小时前`
  if (diff === 1) return '昨天'
  const date = new Date(at)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** 默认表情包（「我 → 表情包」里可增删，存在 vphone.wechat.v2） */
export const DEFAULT_EMOJIS = [
  '🙂',
  '😌',
  '🥺',
  '😳',
  '😴',
  '😤',
  '🤍',
  '🌸',
  '🌙',
  '✨',
  '☕',
  '🍰',
  '🫧',
  '🎐',
  '📎',
  '🌿',
]
