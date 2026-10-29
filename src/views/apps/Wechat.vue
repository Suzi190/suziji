<script setup>
/**
 * 微信 App（外壳）
 * ------------------------------------------------------------
 * 底部四栏：列表 / 通讯录 / 发现 / 我（真微信的骨架）
 * - 列表：会话 + 流式 AI 聊天
 * - 通讯录：添加好友、编辑智能体（人设 / 头像色）
 * - 发现：朋友圈、公众号（展示位）
 * - 我：我的资料（user 人设）/ 表情包 / 聊天气泡 / 微信钱包
 *
 * 数据：localStorage `vphone.wechat.v2`
 * 首次加载会自动把旧的 `vphone.wechat.v1`（只有 chats）迁移过来，聊天记录不丢。
 * AppWindow 用 v-if 渲染，切走会卸载本页面，所以任何改动都必须落盘。
 */
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useAIConfigStore } from '@/stores/aiConfig'
import { MEMORY_INJECT_MAX, useMemoryStore } from '@/stores/memory'
import { useWorldbookStore } from '@/stores/worldbook'
import { summarizeChat } from '@/api/memory'
import { chat, describeError } from '@/api/openaiStream'
import { buildAlivePrompt, FINAL_OUTPUT_RULES } from '@/api/chatPrompt'
import { loadJSON, saveJSON } from '@/utils/storage'
import { splitBubbles, stripBubbleTags } from '@/utils/bubbles'
import { DEFAULT_EMOJIS, uid } from '@/components/wechat/shared'
import ChatList from '@/components/wechat/ChatList.vue'
import ChatRoom from '@/components/wechat/ChatRoom.vue'
import ContactsTab from '@/components/wechat/ContactsTab.vue'
import DiscoverTab from '@/components/wechat/DiscoverTab.vue'
import MeTab from '@/components/wechat/MeTab.vue'
import '@/styles/wechat.css'

const STORAGE_KEY = 'vphone.wechat.v2'
const LEGACY_KEY = 'vphone.wechat.v1'
/** 每次带给 AI 的历史条数（太多会烧 token） */
const HISTORY_LIMIT = 20

const ai = useAIConfigStore()
const memory = useMemoryStore()
const worldbook = useWorldbookStore()

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const seedNow = Date.now()

// ---------------- 首次使用的示例数据 ----------------
function seedChats() {
  return [
    {
      id: 'c_aying',
      name: '阿萤',
      tone: 'rose',
      pinned: true,
      unread: 0,
      persona: '你是阿萤，我的高中同学。说话简短、爱用语气词，偶尔会害羞；不要提起你是 AI。',
      messages: [
        { id: 'm_a1', role: 'ai', text: '你终于上线了。今天怎么这么晚？', at: seedNow - 5 * HOUR },
        { id: 'm_a2', role: 'me', text: '在改一个很小的东西，改到现在。', at: seedNow - 4 * HOUR },
        { id: 'm_a3', role: 'ai', text: '又是那个手机？改完记得睡觉。', at: seedNow - 4 * HOUR + 2 * MINUTE },
      ],
    },
    {
      id: 'c_shuxian',
      name: '书店老板',
      tone: 'milk',
      pinned: false,
      unread: 2,
      persona: '你是街角旧书店的老板，四十岁上下，语气温和，喜欢聊书和天气；说话不长，带一点旧时代的文气。',
      messages: [
        { id: 'm_s1', role: 'ai', text: '新到一批旧书，封面都旧得很好看。', at: seedNow - 9 * HOUR },
        { id: 'm_s2', role: 'ai', text: '要来翻翻吗？', at: seedNow - 9 * HOUR + MINUTE },
      ],
    },
    {
      id: 'c_qiu',
      name: '秋',
      tone: 'lilac',
      pinned: false,
      unread: 0,
      persona: '你是秋，我的网友，说话直接、有点毒舌，但会认真听我讲完，偶尔突然温柔。',
      messages: [{ id: 'm_q1', role: 'ai', text: '别熬太晚。', at: seedNow - 26 * HOUR }],
    },
  ]
}

function seedMoments() {
  return [
    {
      id: 'mm_1',
      author: '阿萤',
      tone: 'rose',
      text: '傍晚的风有点凉了，窗帘一直在动。\n今天不想说话，只想听一会儿。',
      tag: '日常',
      at: seedNow - 40 * MINUTE,
      likes: 6,
      liked: false,
    },
    {
      id: 'mm_2',
      author: '书店老板',
      tone: 'milk',
      text: '整理书架时翻到一张十年前的收据，买的是同一本诗集。\n有些人会回来，只是换了一个季节。',
      tag: '书店',
      at: seedNow - 6 * HOUR,
      likes: 12,
      liked: false,
    },
    {
      id: 'mm_3',
      author: '秋',
      tone: 'lilac',
      text: '楼下的猫今天愿意让我摸了。\n值得记录。',
      tag: '随手记',
      at: seedNow - 30 * HOUR,
      likes: 9,
      liked: false,
    },
  ]
}

function seedOfficial() {
  return [
    {
      id: 'oa_1',
      name: '深夜书店',
      tone: 'milk',
      latest: '本周书单：适合在雨夜读的三本薄书',
      time: '昨天',
      unread: 1,
    },
    {
      id: 'oa_2',
      name: '城市天气',
      tone: 'sky',
      latest: '今天多云转晴，夜里降温，记得带外套',
      time: '07:30',
      unread: 0,
    },
    {
      id: 'oa_3',
      name: '随便写写',
      tone: 'ink',
      latest: '关于「把生活过慢一点」的一点碎念',
      time: '10月24日',
      unread: 0,
    },
  ]
}

function seedWallet() {
  return {
    balance: 128.6,
    records: [
      { id: 'w_1', title: '阿萤 · 奶茶 AA', time: '昨天 20:12', amount: 12.5 },
      { id: 'w_2', title: '旧书店 · 一本诗集', time: '10月24日 15:40', amount: -46 },
      { id: 'w_3', title: '收到红包', time: '10月22日 09:05', amount: 66.6 },
    ],
  }
}

function seedData() {
  return {
    version: 2,
    chats: seedChats().map((chat) => ({ ...defaultChatSettings(), ...chat })),
    moments: seedMoments(),
    official: seedOfficial(),
    profile: {
      name: '我',
      tone: 'milk',
      signature: '在虚构世界里，认真过日子',
      userPersona: '',
    },
    bubble: { theme: 'sakura', radius: 'md', showAvatar: true },
    emojis: [...DEFAULT_EMOJIS],
    wallet: seedWallet(),
  }
}
// ---------------- 读档 / 迁移 ----------------
/** 每个会话的设置项默认值（老存档缺字段时靠它补齐，聊天记录不会丢） */
function defaultChatSettings() {
  return {
    bg: { type: 'none', value: '' }, // none | grad | image
    // injectMax = 每次聊天携带几条记忆（0 = 只整理不携带）
    memory: {
      enabled: false,
      rounds: 8,
      injectMax: MEMORY_INJECT_MAX,
      prompt: '',
      summary: '',
      updatedAt: 0,
    },
    timeAware: true,
    alive: true, // 活人感提示词（默认开；关掉只剩人设本身）
    blocked: false,
    worldbooks: [], // 勾选的世界书 id
  }
}

/** 总结轮数限制在 2~50，脏数据不至于把界面撑爆 */
function clampRounds(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 8
  return Math.min(50, Math.max(2, Math.round(num)))
}

/**
 * 携带条数限制在 0~30
 * 0 = 只整理不携带（记忆照常记，聊天时不注入）；
 * 上限 30 是防手滑：带太多模型反而不当回事，还白烧 token
 */
function clampInjectMax(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return MEMORY_INJECT_MAX
  return Math.min(30, Math.max(0, Math.round(num)))
}

/** 把任意存档收敛成合法会话（缺字段补默认值，脏数据不至于让界面崩） */
function normalizeChat(raw, index) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const settings = defaultChatSettings()
  const bg = src.bg && typeof src.bg === 'object' ? src.bg : {}
  const memory = src.memory && typeof src.memory === 'object' ? src.memory : {}
  return {
    id: src.id || uid('c'),
    name: String(src.name || `好友 ${index + 1}`),
    tone: src.tone || 'rose',
    persona: String(src.persona || ''),
    pinned: Boolean(src.pinned),
    unread: Number(src.unread) || 0,
    bg: {
      type: ['grad', 'image'].includes(bg.type) ? bg.type : 'none',
      value: String(bg.value || ''),
    },
    memory: {
      ...settings.memory,
      enabled: Boolean(memory.enabled),
      rounds: clampRounds(memory.rounds),
      injectMax: clampInjectMax(memory.injectMax),
      prompt: String(memory.prompt || ''),
      summary: String(memory.summary || ''),
      updatedAt: Number(memory.updatedAt) || 0,
    },
    timeAware: src.timeAware !== false,
    // alive 是后加字段：老存档没有就当「开」，所以判断用 !== false，不能用 Boolean
    alive: src.alive !== false,
    blocked: Boolean(src.blocked),
    worldbooks: (Array.isArray(src.worldbooks) ? src.worldbooks : []).filter(
      (id) => typeof id === 'string',
    ),
    messages: (Array.isArray(src.messages) ? src.messages : []).map((msg) => ({
      id: msg?.id || uid('m'),
      role: msg?.role === 'me' ? 'me' : 'ai',
      text: String(msg?.text ?? ''),
      at: Number(msg?.at) || Date.now(),
      error: Boolean(msg?.error),
    })),
  }
}

function loadData() {
  const base = seedData()
  const saved = loadJSON(STORAGE_KEY, null)
  if (saved && Array.isArray(saved.chats)) {
    return { ...base, ...saved, chats: saved.chats.map(normalizeChat) }
  }
  // v1 只有 chats，其余（朋友圈 / 我 / 气泡）用新默认值补上
  const legacy = loadJSON(LEGACY_KEY, null)
  if (legacy && Array.isArray(legacy.chats)) {
    return { ...base, chats: legacy.chats.map(normalizeChat) }
  }
  return base
}

// ---------------- 状态 ----------------
const data = ref(loadData())
/** 'list' | 'contacts' | 'discover' | 'me' */
const tab = ref('list')
/** 当前打开的会话 id，空字符串 = 停在某个 Tab 上 */
const activeId = ref('')
/** 从「列表」点新好友时递增，通讯录据此打开新建表单 */
const createTick = ref(0)
const streaming = ref(false)
const toast = ref('')

let saveTimer = null
let toastTimer = null
let controller = null

const chats = computed(() => data.value.chats)
const activeChat = computed(() => chats.value.find((item) => item.id === activeId.value) ?? null)
const unreadTotal = computed(() => chats.value.reduce((sum, item) => sum + (item.unread || 0), 0))

/**
 * 外壳顶栏（「‹ 微信」）在聊天详情里是多余的：
 * 聊天页自己有一整条顶栏（返回 + 好友名 + 在线状态），两条叠在屏幕顶部很难看。
 * 进聊天详情时让外壳那条隐身，回到四个 Tab 时再露出来，这样全 App 只有一条顶栏。
 * `appNav` 由 components/window/AppWindow.vue 通过 provide 提供，没有时静默跳过。
 */
const appNav = inject('appNav', null)
watch(activeChat, (value) => appNav?.hide(!!value))

/** 深层改动 → 250ms 防抖落盘 */
watch(
  data,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveJSON(STORAGE_KEY, data.value), 250)
  },
  { deep: true },
)

function notify(text) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2200)
}

// ---------------- 导航 ----------------
function goTab(next) {
  if (next === tab.value) return
  stopStream()
  tab.value = next
}

function startCreate() {
  stopStream()
  createTick.value += 1
  tab.value = 'contacts'
}

function openChat(item) {
  stopStream()
  item.unread = 0
  activeId.value = item.id
}

function backToList() {
  stopStream()
  activeId.value = ''
  tab.value = 'list'
}

// ---------------- 好友（通讯录） ----------------
function createFriend(payload) {
  const item = {
    ...defaultChatSettings(),
    id: uid('c'),
    name: payload.name,
    tone: payload.tone,
    persona: payload.persona,
    pinned: false,
    unread: 0,
    messages: [],
  }
  data.value.chats.unshift(item)
  createTick.value = 0
  tab.value = 'list'
  activeId.value = item.id
  notify('好友已创建，可以直接聊天')
}

function updateFriend(id, patch) {
  const item = chats.value.find((chatItem) => chatItem.id === id)
  if (!item) return
  Object.assign(item, patch)
  notify('已保存')
}

function removeFriend(id) {
  const index = data.value.chats.findIndex((item) => item.id === id)
  if (index < 0) return
  data.value.chats.splice(index, 1)
  if (activeId.value === id) activeId.value = ''
  notify('已删除')
}

/** 聊天详情右上角的垃圾桶：好友与记录一起删 */
function removeActive() {
  const item = activeChat.value
  if (!item) return
  if (!window.confirm(`删除「${item.name}」后，好友和聊天记录都会消失，确定吗？`)) return
  removeFriend(item.id)
  backToList()
}

// ---------------- 聊天设置（聊天页「⋯」抽屉） ----------------
/** bg / memory 是对象，要合并而不是整体替换，其余字段直接覆盖 */
function updateChatSettings(patch) {
  const item = activeChat.value
  if (!item) return
  const { bg, memory, ...rest } = patch
  if (bg) Object.assign(item.bg, bg)
  if (memory) Object.assign(item.memory, memory)
  Object.assign(item, rest)
}

/** 抽屉里勾选 / 取消世界书（只影响这条会话） */
function toggleChatWorldbook(id) {
  const item = activeChat.value
  if (!item) return
  const index = item.worldbooks.indexOf(id)
  if (index >= 0) item.worldbooks.splice(index, 1)
  else item.worldbooks.push(id)
}

/** 拉黑提示条上的「解除」 */
function unblockActive() {
  updateChatSettings({ blocked: false })
  notify('已解除拉黑')
}

// ---------------- 我 ----------------
function addEmoji(char) {
  if (!char || data.value.emojis.includes(char)) return
  data.value.emojis.push(char)
}

function removeEmoji(index) {
  data.value.emojis.splice(index, 1)
}

function updateProfile(patch) {
  Object.assign(data.value.profile, patch)
}

function updateBubble(patch) {
  Object.assign(data.value.bubble, patch)
}

function likeMoment(id) {
  const item = data.value.moments.find((moment) => moment.id === id)
  if (!item) return
  item.liked = !item.liked
  item.likes = Math.max(0, item.likes + (item.liked ? 1 : -1))
}
// ---------------- AI 对话 ----------------
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 「现在是 2026 年 10 月 27 日 周二 21:40。」——时间感知打开时才带 */
function nowLine() {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return `现在是 ${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 ${WEEKDAYS[now.getDay()]} ${time}。`
}

/** 把同一位置的多条世界书拼成一段 system，标题留着方便模型对应 */
function worldbookBlock(list) {
  return `【世界书设定】\n${list.map((text) => `· ${text}`).join('\n')}`
}

/**
 * 组装这次请求的消息
 * ------------------------------------------------------------
 * 顺序（和 SillyTavern 的三档注入对齐）：
 *   世界书「前」→ 角色人设 → 活人感 → 我的人设 → 时间 → 世界书「中」
 *   → 记忆 → 最终输出指令 → 最近 20 条历史 → 本次输入 →（世界书「后」按深度插进来）
 * 「后」最贴近这次输入，权重最高；depth=1 就是紧贴我这句。
 */
function buildMessages(item, text) {
  // 扫关键词的文本：这次输入 + 最近几条聊天（世界书靠它判断命中）
  const recent = item.messages
    .filter((old) => !old.error)
    .slice(-6)
    .map((old) => old.text)
    .join('\n')
  const books = worldbook.collect({
    ids: item.worldbooks,
    scanText: `${recent}\n${text}`,
  })

  const messages = []

  // ① 前：人设之前
  if (books.before.length) {
    messages.push({ role: 'system', content: worldbookBlock(books.before) })
  }

  const me = data.value.profile

  messages.push({
    role: 'system',
    content:
      item.persona?.trim() ||
      `你是「${item.name}」，正在用微信和我聊天。用日常口语、简短自然地回话，不要说自己是 AI。`,
  })

  // 活人感：人设负责「这个人是谁」，这段负责「他此刻会怎么把这几个字发出来」
  // （回得短、会敷衍、不接客服话术、只发说出口的字）。会话里可以单独关掉。
  if (item.alive !== false) {
    messages.push({ role: 'system', content: buildAlivePrompt(item.name) })
  }

  if (me?.userPersona?.trim()) {
    messages.push({ role: 'system', content: `关于我（你的聊天对象）：${me.userPersona.trim()}` })
  }

  // 时间感知：模型不知道真实日期，带一条它才接得住「今天 / 这么晚了」
  if (item.timeAware) {
    messages.push({
      role: 'system',
      content: `${nowLine()}（这是真实时间，可以自然带上，但不要生硬复述。）`,
    })
  }

  // ② 中：人设之后、历史之前
  if (books.middle.length) {
    messages.push({ role: 'system', content: worldbookBlock(books.middle) })
  }

  // ③ 记忆：按等级排好的短句（★★★ 关键在前），放在历史之前
  //    - 记忆条目由「记忆」App 整理，存在 vphone.memory.v1
  //    - 每次带几条由聊天设置里的「携带条数」决定（injectMax，0 = 不携带）
  //    - 老存档可能只存过一段纯文本 summary，没条目时用它兜底
  //    注：injectMax 是后加字段，老存档可能没有，用 ?? 兜到默认值，不能用 ||
  //        （0 是合法值，用 || 会被当成"没设置"而变回默认条数）
  const injectMax = item.memory?.injectMax ?? MEMORY_INJECT_MAX
  if ((item.memory?.enabled || item.memory?.summary?.trim()) && injectMax > 0) {
    const block = memory.render(item.id, { max: injectMax })
    if (block) {
      messages.push({ role: 'system', content: block })
    } else if (item.memory.summary?.trim()) {
      messages.push({ role: 'system', content: `【你记得的事】\n${item.memory.summary.trim()}` })
    }
  }

  // ④ 最终输出指令：最高优先级，只管这一轮怎么发（[s]…[/s] 分气泡）
  //    放在所有设定之后、历史之前，让模型最后看到的就是它
  messages.push({ role: 'system', content: FINAL_OUTPUT_RULES })

  for (const msg of item.messages.filter((old) => !old.error).slice(-HISTORY_LIMIT)) {
    // AI 的历史也补回气泡标签再发：模型最会模仿上下文格式，
    // 历史里全是裸文本的话，它很容易跟着忘掉 [s] 规则
    const content = msg.role === 'me' ? msg.text : `[s]${msg.text}[/s]`
    messages.push({ role: msg.role === 'me' ? 'user' : 'assistant', content })
  }

  messages.push({ role: 'user', content: text })

  // ⑤ 后：贴着当前输入插，depth 越大越靠前；从深到浅插，避免下标互相推挤
  if (books.after.length) {
    const sorted = [...books.after].sort((a, b) => b.depth - a.depth)
    for (const entry of sorted) {
      const at = Math.max(1, messages.length - entry.depth)
      messages.splice(at, 0, { role: 'system', content: worldbookBlock([entry.content]) })
    }
  }

  return messages
}

function stopStream() {
  if (controller) controller.abort()
  controller = null
  streaming.value = false
}

/** 同一时间只跑一次整理，免得用户连发几条把接口打爆 */
let memoryBusy = false

/**
 * 自动整理记忆（静默，不弹任何提示）
 * ------------------------------------------------------------
 * 触发条件：这个会话开了记忆 + 攒够 rounds 条「我发的」新消息。
 * 聊天记录归微信，记忆条目归记忆 App（vphone.memory.v1），所以这里只是调
 * summarizeChat() 然后 memory.absorb()，不碰自己的存档结构。
 * 失败只写控制台：聊天体验优先，整理下次再来。
 */
async function autoSummarize(item) {
  const cfg = item.memory
  if (!cfg?.enabled || memoryBusy || !ai.isConfigured) return

  const total = item.messages.length
  const covered = Math.min(memory.bookOf(item.id)?.coveredCount ?? 0, total)
  const pending = item.messages
    .slice(covered)
    .filter((msg) => msg.role === 'me' && !msg.error && String(msg.text).trim()).length
  if (pending < (cfg.rounds || 8)) return

  memoryBusy = true
  try {
    const result = await summarizeChat({
      config: ai.config,
      session: { id: item.id, name: item.name, messages: item.messages.slice(0, total) },
      items: memory.collect(item.id, { max: 40 }),
      fromIndex: covered,
      userName: data.value.profile?.name || '我',
      extraPrompt: cfg.prompt,
    })
    // coveredCount 用请求前的消息总数，避免把整理期间新发的几条误标成「已整理」
    memory.absorb(item.id, {
      name: item.name,
      items: result.items,
      coveredCount: total,
    })
  } catch (err) {
    console.warn('[记忆] 自动整理失败：', describeError(err))
  } finally {
    memoryBusy = false
  }
}

async function sendText(text) {
  const item = activeChat.value
  if (!item) return
  if (item.blocked) {
    notify('已拉黑该好友，先去「⋯ → 拉黑好友」解除')
    return
  }

  // 先按「发之前的历史」组装消息，再把这条我的话记进去
  const messages = buildMessages(item, text)
  item.messages.push({ id: uid('m'), role: 'me', text, at: Date.now() })

  if (!ai.isConfigured) {
    item.messages.push({
      id: uid('m'),
      role: 'ai',
      error: true,
      at: Date.now(),
      text: '还没有配置 AI 接口。去桌面打开「设置」→ 填「接口地址」和「模型」，保存后回来再发一次。',
    })
    return
  }

  item.messages.push({ id: uid('m'), role: 'ai', text: '', at: Date.now() })
  // 必须取回响应式代理再修改，直接改原始对象不会触发视图更新
  const reply = item.messages[item.messages.length - 1]

  // 模型的原始输出（带 [s]…[/s] 标签）；气泡里显示的永远是剥掉标签的版本
  let raw = ''

  /**
   * 一轮结束（正常收完 / 被停止 / 中途断线）时把标签拆成多条气泡：
   * 第一条留在原来的「正在输入」气泡里，其余补成新消息——
   * 同一个时间戳，ChatRoom 不会给它们中间插时间条。
   * @returns {boolean} 有没有拆出可用内容（没有就交给调用方填提示语）
   */
  function commitBubbles() {
    const bubbles = splitBubbles(raw)
    if (!bubbles.length) return false
    reply.text = bubbles[0]
    const at = reply.at
    for (const piece of bubbles.slice(1)) {
      item.messages.push({ id: uid('m'), role: 'ai', text: piece, at })
    }
    return true
  }

  streaming.value = true
  controller = new AbortController()
  try {
    await chat({
      config: ai.config,
      messages,
      signal: controller.signal,
      onDelta: (piece) => {
        raw += piece
        // 流式过程中标签还没闭合，先剥掉标签按换行显示，收完再真正拆气泡
        reply.text = stripBubbleTags(raw)
      },
    })
    if (!commitBubbles()) reply.text = '（模型这次什么都没说，再试一次？）'
  } catch (err) {
    const aborted =
      err?.name === 'AbortError' || /abort|aborted|中止/i.test(err?.message || '')
    if (aborted) {
      if (!commitBubbles()) reply.text = '（已停止）'
    } else {
      const detail = describeError(err)
      // 已经吐了一些字的，留着这些气泡，错误附在最后一条后面
      if (commitBubbles()) {
        const last = item.messages[item.messages.length - 1]
        last.text += `\n\n（连接中断：${detail}）`
      } else {
        reply.text = `发送失败：${detail}`
        reply.error = true
      }
    }
  } finally {
    streaming.value = false
    controller = null
    reply.at = Date.now()
  }

  // 攒够轮数就静默整理一次记忆（失败只写控制台，不打扰聊天）
  if (!reply.error) void autoSummarize(item)
}

onBeforeUnmount(() => {
  stopStream()
  // 万一是在聊天详情里被卸载的，把外壳顶栏还原，别让下次打开没有顶栏
  appNav?.hide(false)
  clearTimeout(saveTimer)
  clearTimeout(toastTimer)
  // 离开页面立刻落盘，不等防抖
  saveJSON(STORAGE_KEY, data.value)
})
</script>

<template>
  <div class="wechat">
    <!-- 聊天详情（整屏，不带底栏） -->
    <ChatRoom
      v-if="activeChat"
      :chat="activeChat"
      :streaming="streaming"
      :emojis="data.emojis"
      :bubble="data.bubble"
      @back="backToList"
      @send="sendText"
      @stop="stopStream"
      @remove="removeActive"
      @notice="notify"
      @settings="updateChatSettings"
      @toggle-wb="toggleChatWorldbook"
      @unblock="unblockActive"
    />

    <template v-else>
      <!-- 四个 Tab -->
      <ChatList v-if="tab === 'list'" :chats="chats" @open="openChat" @add="startCreate" />

      <ContactsTab
        v-else-if="tab === 'contacts'"
        :chats="chats"
        :create-tick="createTick"
        @create="createFriend"
        @update="updateFriend"
        @remove="removeFriend"
        @open="openChat"
        @notice="notify"
      />

      <DiscoverTab
        v-else-if="tab === 'discover'"
        :moments="data.moments"
        :official="data.official"
        :chats="chats"
        @like="likeMoment"
        @notice="notify"
      />

      <MeTab
        v-else
        :profile="data.profile"
        :bubble="data.bubble"
        :emojis="data.emojis"
        :wallet="data.wallet"
        @update-profile="updateProfile"
        @update-bubble="updateBubble"
        @add-emoji="addEmoji"
        @remove-emoji="removeEmoji"
        @notice="notify"
      />

      <!-- 底部四栏 -->
      <nav class="tab-bar">
        <button class="tab" :class="tab === 'list' ? 'on' : ''" @click="goTab('list')">
          <span class="tab-icon">
            <span class="i-ph-chats-circle" />
            <span v-if="unreadTotal" class="tab-dot">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</span>
          </span>
          <span class="tab-label">列表</span>
        </button>

        <button class="tab" :class="tab === 'contacts' ? 'on' : ''" @click="goTab('contacts')">
          <span class="tab-icon"><span class="i-ph-address-book" /></span>
          <span class="tab-label">通讯录</span>
        </button>

        <button class="tab" :class="tab === 'discover' ? 'on' : ''" @click="goTab('discover')">
          <span class="tab-icon"><span class="i-ph-compass" /></span>
          <span class="tab-label">发现</span>
        </button>

        <button class="tab" :class="tab === 'me' ? 'on' : ''" @click="goTab('me')">
          <span class="tab-icon"><span class="i-ph-user-circle" /></span>
          <span class="tab-label">我</span>
        </button>
      </nav>
    </template>

    <p v-if="toast" class="wx-toast">{{ toast }}</p>
  </div>
</template>

<style scoped>
/* AppWindow 的 .body 底部留了 20 的 Home 条内边距：这里正好用来放底栏下方的留白，别去覆盖它 */
.wechat {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ---------- 底部四栏 ---------- */
.tab-bar {
  display: flex;
  flex: none;
  align-items: center;
  height: calc(var(--u) * 52);
  border-top: 1px solid rgba(124, 101, 112, 0.08);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(calc(var(--u) * 16)) saturate(1.1);
  -webkit-backdrop-filter: blur(calc(var(--u) * 16)) saturate(1.1);
}

.tab {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--u) * 2);
  height: 100%;
  color: var(--c-text-faint);
  transition: color 0.16s ease;
}

.tab.on {
  color: #d8879f;
}

.tab-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(var(--u) * 22);
  font-size: calc(var(--u) * 20);
}

.tab-label {
  font-size: calc(var(--u) * 9.5);
  letter-spacing: calc(var(--u) * 0.2);
}

.tab-dot {
  position: absolute;
  top: calc(var(--u) * -2);
  left: calc(var(--u) * 11);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: calc(var(--u) * 15);
  height: calc(var(--u) * 15);
  padding: 0 calc(var(--u) * 4);
  border-radius: 999px;
  font-size: calc(var(--u) * 8.5);
  color: #fff;
  background: linear-gradient(135deg, #f7a8be, #e28ca6);
}
</style>
