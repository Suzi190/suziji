/**
 * 世界书仓库（v2 · 字段对齐 SillyTavern World Info）
 * ------------------------------------------------------------
 * 世界书必须「可解释」：用户要一眼看出这条会不会注入、注入到哪、靠什么触发。
 * 所以字段直接照 ST 的语义翻译，只砍掉这一阶段用不上的（递归、概率、sticky、分组权重）。
 *
 * 条目结构（← 后面是 ST 里对应的字段）：
 *   title      备注名                        ← comment
 *   keys       触发关键词（任一命中即注入）    ← key
 *   requireAll 全部关键词都命中才触发         ← selective + selectiveLogic=AND
 *   content    注入正文                      ← content
 *   position   'before' | 'middle' | 'after' ← position（↑Char / ↓Char / @D）
 *              前 = 人设之前，中 = 人设之后，后 = 插进最近几条聊天
 *   depth      「后」的插入深度 1~10          ← depth（@D）
 *   constant   必读：不看关键词，永远注入      ← constant
 *   order      同位置内的插入顺序，小的在前    ← order
 *   enabled    停用                          ← disable 取反
 *   scope      'global' | 'local'            ← 全局世界书 / 角色世界书
 *              global：所有对话自动参与（命中关键词或必读）
 *              local ：只有勾选了它的会话参与（微信 → 聊天「⋯」→ 世界书）
 *   folderId   所属文件夹 id，'' = 未分组      ← ST 里没有，纯为列表好找
 *              文件夹只影响「列表怎么分组」，不参与注入判断
 *
 * 存储：localStorage `vphone.worldbook.v2`（条目）
 *       + `vphone.worldbook.folders.v1`（文件夹，单独一个 key，条目存档原样不动）
 * 首次加载会把旧的 `vphone.worldbook.v1` 迁过来（keywords → keys，其余补默认值）。
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { loadJSON, saveJSON } from '@/utils/storage'

const STORAGE_KEY = 'vphone.worldbook.v2'
const LEGACY_KEY = 'vphone.worldbook.v1'
/** 文件夹单独一个 key：条目那本存档完全不动，老版本读到也只会当普通条目 */
const FOLDERS_KEY = 'vphone.worldbook.folders.v1'

/** 注入位置：desc 会直接展示给用户看，别写术语 */
export const WB_POSITIONS = [
  {
    id: 'before',
    short: '前',
    name: '人设之前',
    desc: '放在角色人设最前面。世界观、时代背景、不能违背的硬设定放这里。',
  },
  {
    id: 'middle',
    short: '中',
    name: '人设之后',
    desc: '放在角色人设之后、聊天记录之前。关系、称呼、当前场景放这里。',
  },
  {
    id: 'after',
    short: '后',
    name: '贴近当前',
    desc: '插进最近几条聊天里。离你这句话越近，模型越容易照做。',
  },
]

export const WB_SCOPES = [
  {
    id: 'global',
    name: '全局',
    desc: '所有对话都会参与：命中关键词（或勾了必读）就注入，不用逐个会话勾选。',
  },
  {
    id: 'local',
    name: '局部',
    desc: '只有勾选了它的会话才参与：微信 → 聊天页 → 右上角「⋯」→ 世界书。',
  },
]

export const WB_DEPTH_MIN = 1
export const WB_DEPTH_MAX = 10
export const WB_ORDER_MIN = 1
export const WB_ORDER_MAX = 999
export const WB_FOLDER_NAME_MAX = 20

const POSITION_IDS = WB_POSITIONS.map((item) => item.id)
const SCOPE_IDS = WB_SCOPES.map((item) => item.id)

/** 条目 id 前缀 wb_，在存档里一眼能认出来 */
function newId() {
  return `wb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 文件夹 id 前缀 wf_，和条目分开 */
function newFolderId() {
  return `wf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function clampNum(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

/** 关键词统一成「去空格的字符串数组」，重复的丢掉 */
function normalizeKeys(value) {
  const list = Array.isArray(value) ? value : []
  const out = []
  for (const raw of list) {
    const key = String(raw ?? '').trim()
    if (key && !out.includes(key)) out.push(key)
  }
  return out
}

/** 把任意存档收敛成合法条目：缺字段补默认值，脏数据不至于让注入炸掉 */
function normalizeEntry(raw, index = 0) {
  const src = raw && typeof raw === 'object' ? raw : {}
  // v1 时代叫 keywords，v2 起叫 keys（和 ST 对齐）
  const legacyKeys = src.keys ?? src.keywords
  return {
    id: String(src.id || newId()),
    title: String(src.title || src.comment || `条目 ${index + 1}`),
    scope: SCOPE_IDS.includes(src.scope) ? src.scope : 'global',
    folderId: typeof src.folderId === 'string' ? src.folderId : '',
    keys: normalizeKeys(legacyKeys),
    requireAll: Boolean(src.requireAll),
    content: String(src.content ?? ''),
    position: POSITION_IDS.includes(src.position) ? src.position : 'middle',
    depth: clampNum(src.depth, WB_DEPTH_MIN, WB_DEPTH_MAX, 2),
    constant: Boolean(src.constant),
    order: clampNum(src.order, WB_ORDER_MIN, WB_ORDER_MAX, 100 + index * 10),
    enabled: src.enabled !== false,
  }
}

/** 首次使用给的示例：四条刚好各演一种用法（必读 / 关键词 / 前位 / 局部+后位） */
function seedEntries() {
  return [
    {
      id: 'wb_core',
      title: '世界基调',
      scope: 'global',
      keys: [],
      content: '故事发生在当代的普通城市，手机、外卖、地铁都正常存在，没有超自然设定。',
      position: 'middle',
      constant: true,
      order: 10,
    },
    {
      id: 'wb_relation',
      title: '关系基调',
      scope: 'global',
      keys: ['关系', '称呼', '认识'],
      content: '我们认识很久了，说话随意自然，不需要客套和寒暄，偶尔可以互相打趣。',
      position: 'before',
      order: 20,
    },
    {
      id: 'wb_place',
      title: '常去的地方',
      scope: 'global',
      keys: ['吃', '饭', '咖啡', '见面'],
      content: '我们常去楼下那家开到深夜的小面馆，老板娘记得我们的口味。',
      position: 'middle',
      order: 30,
    },
    {
      id: 'wb_name',
      title: '称呼习惯',
      scope: 'local',
      keys: ['名字', '叫我'],
      content: '你叫我「小粟」；我一般直接叫你的名字，不用「您」。',
      position: 'after',
      depth: 1,
      order: 40,
    },
  ].map((item, index) => normalizeEntry(item, index))
}

function loadEntries() {
  const saved = loadJSON(STORAGE_KEY, null)
  if (Array.isArray(saved) && saved.length) {
    return saved.filter((item) => item && typeof item === 'object').map(normalizeEntry)
  }
  // 没有 v2 就看看有没有 v1（keywords 时代的老存档）：一条都不丢，
  // scope 统一落成「局部」—— 老版本就是「哪个会话勾了才生效」，不能悄悄改成全局
  const legacy = loadJSON(LEGACY_KEY, null)
  if (Array.isArray(legacy) && legacy.length) {
    return legacy
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => normalizeEntry({ ...item, scope: 'local' }, index))
  }
  return seedEntries()
}

/**
 * 把任意存档收敛成合法文件夹
 * 文件夹排在所属范围里，order 只决定先后，和条目的 order 互不干扰
 */
function normalizeFolder(raw, index = 0) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const name = String(src.name ?? '').trim().slice(0, WB_FOLDER_NAME_MAX)
  return {
    id: String(src.id || newFolderId()),
    name: name || `文件夹 ${index + 1}`,
    scope: SCOPE_IDS.includes(src.scope) ? src.scope : 'global',
    order: clampNum(src.order, WB_ORDER_MIN, WB_ORDER_MAX, 10 + index * 10),
    collapsed: Boolean(src.collapsed),
  }
}

function loadFolders() {
  const saved = loadJSON(FOLDERS_KEY, null)
  if (!Array.isArray(saved)) return []
  return saved.filter((item) => item && typeof item === 'object').map(normalizeFolder)
}

/** 条目指向了不存在的文件夹、或别的范围的文件夹 → 松开归属，免得列表里凭空多出「幽灵分组」 */
function settleFolders(list, folderList) {
  const map = new Map(folderList.map((folder) => [folder.id, folder]))
  for (const item of list) {
    const folder = item.folderId ? map.get(item.folderId) : null
    if (!folder || folder.scope !== item.scope) item.folderId = ''
  }
}

export const useWorldbookStore = defineStore('worldbook', () => {
  // ---------------- state ----------------
  const entries = ref(loadEntries())
  const folders = ref(loadFolders())
  settleFolders(entries.value, folders.value)

  // ---------------- getters ----------------
  const total = computed(() => entries.value.length)
  const enabledEntries = computed(() => entries.value.filter((item) => item.enabled !== false))
  const globalCount = computed(() => entries.value.filter((item) => item.scope === 'global').length)
  const localCount = computed(() => entries.value.filter((item) => item.scope === 'local').length)
  const requiredCount = computed(() => entries.value.filter((item) => item.constant).length)
  const disabledCount = computed(() => entries.value.filter((item) => item.enabled === false).length)

  // ---------------- 持久化 ----------------
  let saveTimer = null
  watch(
    entries,
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => saveJSON(STORAGE_KEY, entries.value), 250)
    },
    { deep: true, immediate: true },
  )

  let folderTimer = null
  watch(
    folders,
    () => {
      clearTimeout(folderTimer)
      folderTimer = setTimeout(() => saveJSON(FOLDERS_KEY, folders.value), 250)
    },
    { deep: true, immediate: true },
  )

  // ---------------- actions ----------------
  /** 新条目默认排最后，想插前面再自己改「插入顺序」的数字 */
  function nextOrder() {
    const max = entries.value.reduce((acc, item) => Math.max(acc, item.order), 0)
    return clampNum(max + 10, WB_ORDER_MIN, WB_ORDER_MAX, 100)
  }

  function add(patch = {}) {
    const item = normalizeEntry(
      // 显式传了 order 就尊重它，否则排到队尾
      { ...patch, id: newId(), order: patch.order ?? nextOrder() },
      entries.value.length,
    )
    // 指定了文件夹就跟着文件夹的范围走，否则按传进来的范围（没传就是全局）
    const folder = item.folderId ? folders.value.find((one) => one.id === item.folderId) : null
    if (folder) item.scope = folder.scope
    else item.folderId = ''
    entries.value.unshift(item)
    return item
  }

  function update(id, patch) {
    const item = entries.value.find((entry) => entry.id === id)
    if (!item || !patch) return null
    Object.assign(item, patch)
    // 输入框什么都可能填，统一兜一下范围
    item.depth = clampNum(item.depth, WB_DEPTH_MIN, WB_DEPTH_MAX, 2)
    item.order = clampNum(item.order, WB_ORDER_MIN, WB_ORDER_MAX, 100)
    item.keys = normalizeKeys(item.keys)
    // 换范围 / 文件夹被删了 → 归属失效就松开，别让条目留在别的范围的文件夹里
    const folder = item.folderId ? folders.value.find((one) => one.id === item.folderId) : null
    if (!folder || folder.scope !== item.scope) item.folderId = ''
    return item
  }

  function remove(id) {
    const index = entries.value.findIndex((entry) => entry.id === id)
    if (index < 0) return false
    entries.value.splice(index, 1)
    return true
  }

  /** 复制一条：名字加「副本」，顺序往后挪，避免和原件挤在一起 */
  function duplicate(id) {
    const item = entries.value.find((entry) => entry.id === id)
    if (!item) return null
    const copy = normalizeEntry(
      { ...item, id: newId(), title: `${item.title} 副本`, order: nextOrder() },
      entries.value.length,
    )
    entries.value.unshift(copy)
    return copy
  }

  function toggle(id) {
    const item = entries.value.find((entry) => entry.id === id)
    if (!item) return
    item.enabled = item.enabled === false
  }

  // ---------------- 文件夹（只管列表怎么分组，不参与注入） ----------------
  /** 新文件夹排在同一范围的队尾 */
  function nextFolderOrder(scope) {
    const max = folders.value
      .filter((folder) => folder.scope === scope)
      .reduce((acc, folder) => Math.max(acc, folder.order), 0)
    return clampNum(max + 10, WB_ORDER_MIN, WB_ORDER_MAX, 10)
  }

  function addFolder(patch = {}) {
    const scope = SCOPE_IDS.includes(patch.scope) ? patch.scope : 'global'
    const folder = normalizeFolder(
      { ...patch, id: newFolderId(), scope, order: patch.order ?? nextFolderOrder(scope) },
      folders.value.length,
    )
    folders.value.push(folder)
    return folder
  }

  /** 改名：名字清空就保留原名，返回是否真的改了 */
  function renameFolder(id, name) {
    const folder = folders.value.find((item) => item.id === id)
    if (!folder) return false
    const next = String(name ?? '').trim().slice(0, WB_FOLDER_NAME_MAX)
    if (!next || next === folder.name) return false
    folder.name = next
    return true
  }

  function toggleFolder(id) {
    const folder = folders.value.find((item) => item.id === id)
    if (!folder) return
    folder.collapsed = !folder.collapsed
  }

  /** 删文件夹不删条目：里面的条目回到「未分组」，返回被松开的条数 */
  function removeFolder(id) {
    const index = folders.value.findIndex((item) => item.id === id)
    if (index < 0) return -1
    let released = 0
    for (const item of entries.value) {
      if (item.folderId === id) {
        item.folderId = ''
        released += 1
      }
    }
    folders.value.splice(index, 1)
    return released
  }

  /**
   * 关键词命中判断
   * - 必读：直接过
   * - 没关键词又不读 → 永远不注入（UI 里会提示，别让用户以为坏了）
   * - requireAll：所有关键词都要出现；否则任一出现即可
   */
  function matches(entry, scan) {
    if (entry.constant) return true
    const keys = entry.keys
    if (!keys.length || !scan) return false
    if (entry.requireAll) return keys.every((key) => scan.includes(key.toLowerCase()))
    return keys.some((key) => scan.includes(key.toLowerCase()))
  }

  /**
   * 算出「这一轮该注入什么」，摆位交给调用方（微信 / 以后的文游、论坛）
   * @param {object} options
   * @param {string[]} options.ids      当前会话勾选的局部世界书 id（全局的不用传）
   * @param {string}   options.scanText 用来扫关键词的文本（最近几条聊天 + 这次输入）
   * @returns {{ before: string[], middle: string[], after: {content:string,depth:number}[], picked: object[] }}
   */
  function collect({ ids = [], scanText = '' } = {}) {
    const scan = String(scanText || '').toLowerCase()
    const selected = Array.isArray(ids) ? ids : []

    const picked = entries.value
      .filter((item) => {
        if (item.enabled === false) return false
        // 全局条目谁都能用；局部条目必须被这个会话勾上
        if (item.scope !== 'global' && !selected.includes(item.id)) return false
        if (!item.content.trim()) return false
        return matches(item, scan)
      })
      // 同位置内按 order 升序，order 一样就按名字稳定排序
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh'))

    const pick = (position) =>
      picked
        .filter((item) => item.position === position)
        .map((item) => item.content.trim())
        .filter(Boolean)

    return {
      before: pick('before'),
      middle: pick('middle'),
      after: picked
        .filter((item) => item.position === 'after')
        .map((item) => ({ content: item.content.trim(), depth: item.depth }))
        .filter((item) => item.content),
      picked,
    }
  }

  return {
    entries,
    folders,
    total,
    enabledEntries,
    globalCount,
    localCount,
    requiredCount,
    disabledCount,
    add,
    update,
    remove,
    duplicate,
    toggle,
    addFolder,
    renameFolder,
    toggleFolder,
    removeFolder,
    collect,
  }
})

