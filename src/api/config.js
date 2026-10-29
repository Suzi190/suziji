/**
 * AI 接口配置：默认值 / 预设 / 归一化
 * ------------------------------------------------------------
 * 硬性要求：不硬编码任何接口地址、密钥、模型名。
 * 这里只放「默认空值 + 常见服务商预设」，真实参数全部由设置页填写并本地持久化，
 * 因此切换官方站 / 中转站不需要改任何代码。
 */

/** 配置在 localStorage 里的键名（与桌面布局分开存，互不影响；v2 起支持多套配置） */
export const AI_STORAGE_KEY = 'vphone.ai.v2'
/** 旧版「单套配置」存档键，首次启动会自动迁移成第一套配置 */
export const AI_STORAGE_KEY_LEGACY = 'vphone.ai.v1'
/** 最多保存几套配置（localStorage 只有几 MB，手机上也不希望堆一屏） */
export const AI_MAX_PROFILES = 20
/** 配置名字最大长度 */
export const AI_NAME_MAX = 24

/**
 * 常见服务商预设：只用来「一键填地址和模型」，
 * 不参与请求逻辑，也不代表绑定某一家。
 */
export const AI_PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    id: 'relay',
    name: '中转站 / 自建',
    baseUrl: '',
    model: '',
  },
]

/** 默认配置：全部留空，等用户在设置页填 */
export const DEFAULT_AI_CONFIG = {
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.8,
  maxTokens: 1024,
  /** 自定义请求头，一行一条 `Key: Value`（很多中转站要额外鉴权头） */
  customHeaders: '',
  /** 是否用 SSE 流式输出（关掉则一次性返回） */
  stream: true,
}

/** 浏览器禁止手动设置的请求头，填了会直接报错，这里统一下线 */
const FORBIDDEN_HEADERS = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
  'user-agent',
])

function clampNumber(value, min, max, fallback) {
  const num = typeof value === 'string' ? Number(value.trim()) : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

/** 把任意存档 / 用户输入收敛成合法配置（脏数据不会让请求层崩） */
export function normalizeConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    baseUrl: String(src.baseUrl ?? DEFAULT_AI_CONFIG.baseUrl).trim(),
    apiKey: String(src.apiKey ?? DEFAULT_AI_CONFIG.apiKey).trim(),
    model: String(src.model ?? DEFAULT_AI_CONFIG.model).trim(),
    temperature: Number(clampNumber(src.temperature, 0, 2, DEFAULT_AI_CONFIG.temperature).toFixed(2)),
    maxTokens: Math.round(clampNumber(src.maxTokens, 1, 32000, DEFAULT_AI_CONFIG.maxTokens)),
    customHeaders: String(src.customHeaders ?? DEFAULT_AI_CONFIG.customHeaders).trim(),
    stream: src.stream !== false,
  }
}

/**
 * 接口地址归一化：
 * - 去掉首尾空格与结尾斜杠
 * - 用户把完整 `/chat/completions` 也粘进来时自动剥掉
 * - 只填了域名（没写路径）时补 `/v1`，这是 OpenAI 兼容协议的默认前缀
 */
export function normalizeBaseUrl(input) {
  let raw = String(input || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  raw = raw.replace(/\/chat\/completions$/i, '').replace(/\/+$/, '')

  // 没写协议时按 https 补全，省得用户漏掉打不开
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`

  try {
    const url = new URL(raw)
    if (!url.pathname || url.pathname === '/') url.pathname = '/v1'
    return url.toString().replace(/\/+$/, '')
  } catch {
    // 连 URL 都解析不了时原样返回，让请求层报出可读错误
    return raw
  }
}

/**
 * 拼出最终请求地址
 * path 默认走对话接口；拉取模型列表时传 'models'
 * 用 URL 改写 pathname 而不是字符串拼接，这样带查询参数的地址（?key=xxx）也不会拼坏
 */
export function buildEndpoint(baseUrl, path = 'chat/completions') {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return ''
  const tail = String(path || '').replace(/^\/+/, '')
  try {
    const url = new URL(base)
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${tail}`
    return url.toString()
  } catch {
    return `${base}/${tail}`
  }
}

/**
 * 解析自定义请求头文本：`Key: Value` 一行一条
 * 空行与 `#` 开头的注释会被忽略，浏览器禁止的请求头自动跳过
 */
export function parseCustomHeaders(text) {
  const out = {}
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (!key || !value) continue
    if (FORBIDDEN_HEADERS.has(key.toLowerCase())) continue
    out[key] = value
  }
  return out
}

/** 请求前自检：缺什么就明确告诉用户缺什么（API Key 允许为空，本地模型不需要） */
export function missingFields(config) {
  const missing = []
  if (!String(config.baseUrl || '').trim()) missing.push('接口地址')
  if (!String(config.model || '').trim()) missing.push('模型名')
  return missing
}

/** 生成一套配置的 id（时间戳 + 随机，够用且基本不会撞） */
export function makeProfileId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** 是否一条有效参数都没填（用来判断旧存档值不值得迁移） */
export function isBlankConfig(raw) {
  const cfg = normalizeConfig(raw)
  return !cfg.baseUrl && !cfg.apiKey && !cfg.model && !cfg.customHeaders
}

/**
 * 把存档里的一条配置收敛成 { id, name, ...配置 }
 * name 允许为空字符串（输入中途），但读档时留空会补默认名
 */
export function normalizeProfile(raw, fallbackName = '配置 1') {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    id: String(src.id || '') || makeProfileId(),
    name: String(src.name ?? '').slice(0, AI_NAME_MAX) || fallbackName,
    ...normalizeConfig(src),
  }
}
