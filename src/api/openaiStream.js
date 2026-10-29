/**
 * 统一的 OpenAI 兼容请求层（标准 Chat Completions 协议）
 * ------------------------------------------------------------
 * 设计目标：
 * 1. 只认协议不认厂商：OpenAI / DeepSeek / Gemini 中转 / 各类中转站都能直接跑
 * 2. SSE 流式输出，边收边回调（onDelta），可随时 abort
 * 3. 所有失败都收敛成 AIError，带 kind + 中文可读提示，UI 直接展示即可
 * 4. 地址、密钥、模型、额外请求头全部来自配置，不在这里写死任何一家
 */
import { buildEndpoint, missingFields, normalizeConfig, parseCustomHeaders } from './config'

/** 统一错误对象：message 给人看，kind 给程序分支用 */
export class AIError extends Error {
  constructor(message, { status = 0, kind = 'unknown', detail = '', cause = null } = {}) {
    super(message)
    this.name = 'AIError'
    this.status = status
    this.kind = kind
    this.detail = detail
    this.cause = cause
  }
}

/** 把异常转成一句能直接显示在界面上的话 */
export function describeError(err) {
  if (err instanceof AIError) return err.detail ? `${err.message}（${err.detail}）` : err.message
  return err?.message || '请求失败，请稍后再试'
}

// ---------------- 内部工具 ----------------

/** 超时 + 外部取消的信号合流，统一走 AbortController */
function createAbortLink(signal, timeoutMs) {
  const controller = new AbortController()
  let timedOut = false

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      : null

  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    dispose() {
      if (timer) clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    },
  }
}

/** 网络层异常 → AIError（区分超时 / 用户取消 / 跨域） */
function wrapFetchError(err, link) {
  if (err instanceof AIError) return err
  if (err?.name === 'AbortError') {
    return link.timedOut
      ? new AIError('请求超时：接口在限定时间内没有响应，请检查网络或换一个中转地址', {
          kind: 'timeout',
          cause: err,
        })
      : new AIError('请求已取消', { kind: 'aborted', cause: err })
  }
  return new AIError('无法连接到接口：可能是网络不通，或被浏览器跨域（CORS）拦截', {
    kind: 'network',
    detail: err?.message || '',
    cause: err,
  })
}

/** 把 HTTP 错误码翻译成可读提示，并尽量带上服务端原始 message */
async function toAIError(res) {
  let detail = ''
  try {
    const text = (await res.text()).slice(0, 600)
    detail = text
    try {
      const json = JSON.parse(text)
      detail = json?.error?.message || json?.message || text
      if (typeof detail !== 'string') detail = JSON.stringify(detail)
    } catch {
      /* 不是 JSON 就保留原文 */
    }
  } catch {
    /* 读不到 body 就算了 */
  }

  const status = res.status
  const head = `HTTP ${status}`
  if (status === 401 || status === 403) {
    return new AIError(`${head} · API Key 无效或没有权限，请检查密钥是否正确`, {
      status,
      kind: 'auth',
      detail,
    })
  }
  if (status === 404) {
    return new AIError(
      `${head} · 接口地址或模型名不存在，请确认 BaseURL 以 /v1 结尾、模型名拼写正确`,
      { status, kind: 'not-found', detail },
    )
  }
  if (status === 429) {
    return new AIError(`${head} · 触发限流或额度不足，请稍后重试或更换通道`, {
      status,
      kind: 'rate-limit',
      detail,
    })
  }
  if (status === 400 || status === 422) {
    return new AIError(
      `${head} · 请求参数被拒绝${detail ? `：${detail}` : '，请检查模型名与 max_tokens'}`,
      { status, kind: 'config', detail },
    )
  }
  if (status >= 500) {
    return new AIError(`${head} · 服务端错误，稍后重试或更换中转`, { status, kind: 'server', detail })
  }
  return new AIError(`${head} · 请求失败${detail ? `：${detail}` : ''}`, {
    status,
    kind: 'unknown',
    detail,
  })
}

/** 组装地址 + 请求头（自定义头优先，Authorization 可被自定义头覆盖） */
function prepare(config, { needModel = true, path = 'chat/completions' } = {}) {
  const cfg = normalizeConfig(config)
  const missing = missingFields(cfg).filter((name) => needModel || name !== '模型名')
  if (missing.length) {
    throw new AIError(`请先在设置里填写${missing.join('、')}`, { kind: 'config' })
  }

  const custom = parseCustomHeaders(cfg.customHeaders)
  const headers = { 'Content-Type': 'application/json', ...custom }
  const hasAuth = Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')
  // 有些中转用 x-api-key 之类，此时用户会在自定义头里自己写，这里就不覆盖
  if (cfg.apiKey && !hasAuth) headers.Authorization = `Bearer ${cfg.apiKey}`

  return { cfg, url: buildEndpoint(cfg.baseUrl, path), headers }
}

/** 单行 SSE 解析：返回 true 表示收到 [DONE] */
function handleSSELine(line, sink) {
  const text = line.trim()
  if (!text || text.startsWith(':') || text.startsWith('event:')) return false
  if (!text.startsWith('data:')) return false

  const payload = text.slice(5).trim()
  if (!payload) return false
  if (payload === '[DONE]') return true

  let json
  try {
    json = JSON.parse(payload)
  } catch {
    return false
  }

  if (json?.error) {
    throw new AIError(json.error?.message || '接口在流中返回了错误', {
      kind: 'server',
      detail: JSON.stringify(json.error).slice(0, 400),
    })
  }

  const choice = json?.choices?.[0]
  const delta = choice?.delta ?? choice?.message ?? null
  if (delta) {
    // DeepSeek-R1 之类的思维链字段单独回调，不混进正文
    if (delta.reasoning_content && sink.onReasoning) sink.onReasoning(String(delta.reasoning_content))
    const piece = delta.content
    if (typeof piece === 'string' && piece) {
      sink.text += piece
      sink.onDelta?.(piece)
    }
  }
  if (json?.usage) sink.usage = json.usage
  return false
}

/** 逐块读取 SSE 流 */
async function readSSEStream(res, { onDelta, onReasoning }) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const sink = { text: '', usage: null, onDelta, onReasoning }
  let buffer = ''
  let done = false

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read()
      if (streamDone) break
      buffer += decoder.decode(value, { stream: true })

      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        if (handleSSELine(line, sink)) {
          done = true
          break
        }
      }
    }
    // 最后一行可能没有换行符收尾
    if (!done && buffer.trim()) handleSSELine(buffer, sink)
  } finally {
    reader.cancel().catch(() => {})
  }

  return { text: sink.text, usage: sink.usage }
}

// ---------------- 对外 API ----------------

/**
 * 非流式请求（一次拿全文）
 * 用于连通测试，以及 cfg.stream = false 的场景
 */
export async function requestCompletion({
  config,
  messages,
  signal,
  timeoutMs = 60000,
  extraBody = {},
}) {
  const { cfg, url, headers } = prepare(config)
  const link = createAbortLink(signal, timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: link.signal,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: false,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        ...extraBody,
      }),
    })
    if (!res.ok) throw await toAIError(res)

    const json = await res.json().catch(() => null)
    if (!json) {
      throw new AIError('接口返回的不是合法 JSON，可能不是 OpenAI 兼容接口', { kind: 'parse' })
    }
    const choice = json?.choices?.[0]
    const text = choice?.message?.content ?? choice?.text ?? ''
    return {
      text: String(text ?? ''),
      model: json?.model || cfg.model,
      usage: json?.usage ?? null,
      raw: json,
    }
  } catch (err) {
    throw wrapFetchError(err, link)
  } finally {
    link.dispose()
  }
}

/**
 * 流式请求（SSE）
 * @param {(piece: string) => void} onDelta 每收到一段文字回调一次
 * @returns {Promise<{ text: string, usage: object|null, model: string }>}
 */
export async function streamChat({
  config,
  messages,
  signal,
  onDelta,
  onReasoning,
  timeoutMs = 180000,
  extraBody = {},
}) {
  const { cfg, url, headers } = prepare(config)
  const link = createAbortLink(signal, timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: link.signal,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        ...extraBody,
      }),
    })
    if (!res.ok) throw await toAIError(res)

    const contentType = res.headers.get('content-type') || ''
    const isEventStream = contentType.includes('event-stream')
    // 有些中转无视 stream:true，直接回一整个 JSON，这里兜住
    if (!res.body || (!isEventStream && contentType.includes('application/json'))) {
      const json = await res.json().catch(() => null)
      if (!json) {
        throw new AIError('接口返回的不是合法 JSON，可能不是 OpenAI 兼容接口', { kind: 'parse' })
      }
      const choice = json?.choices?.[0]
      const text = String(choice?.message?.content ?? choice?.text ?? '')
      if (text) onDelta?.(text)
      return { text, usage: json?.usage ?? null, model: json?.model || cfg.model }
    }

    const { text, usage } = await readSSEStream(res, { onDelta, onReasoning })
    return { text, usage, model: cfg.model }
  } catch (err) {
    throw wrapFetchError(err, link)
  } finally {
    link.dispose()
  }
}

/** 按配置自动选择流式 / 非流式，业务层只需要调这个 */
export async function chat({
  config,
  messages,
  signal,
  onDelta,
  onReasoning,
  timeoutMs,
  extraBody,
}) {
  const cfg = normalizeConfig(config)
  if (cfg.stream === false) {
    const result = await requestCompletion({ config: cfg, messages, signal, timeoutMs, extraBody })
    if (result.text) onDelta?.(result.text)
    return result
  }
  return streamChat({ config: cfg, messages, signal, onDelta, onReasoning, timeoutMs, extraBody })
}

/**
 * 连通测试：发一条极短请求，校验「地址 / 密钥 / 模型」三件套是否可用
 * 用非流式，失败信息更直接
 */
export async function testConnection(config, { signal, timeoutMs = 30000 } = {}) {
  const started = performance.now()
  const result = await requestCompletion({
    config,
    signal,
    timeoutMs,
    messages: [{ role: 'user', content: '只回复两个字：通了' }],
    extraBody: { temperature: 0, max_tokens: 32 },
  })
  return {
    ok: true,
    elapsed: Math.round(performance.now() - started),
    model: result.model,
    reply: result.text.trim(),
    usage: result.usage,
  }
}

/**
 * 从返回体里挖出模型名：不同中转写法五花八门，这里全都兜住
 * - OpenAI 标准：{ data: [{ id: 'gpt-4o' }] }
 * - 部分中转：{ models: ['gpt-4o'] } / { data: { models: [...] } } / 直接就是个数组
 */
function extractModelIds(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.data)) return json.data
  if (Array.isArray(json?.models)) return json.models
  if (Array.isArray(json?.data?.models)) return json.data.models
  return []
}

/**
 * 拉取模型列表（GET {BaseURL}/models，OpenAI 兼容接口都支持）
 * 只返回字符串数组，已去重并按名字排序；不写死任何模型名
 * @returns {Promise<string[]>}
 */
export async function listModels(config, { signal, timeoutMs = 20000 } = {}) {
  // 拉列表不需要模型名，只要地址（和密钥）
  const { url, headers } = prepare(config, { needModel: false, path: 'models' })
  const link = createAbortLink(signal, timeoutMs)

  try {
    const res = await fetch(url, { method: 'GET', headers, signal: link.signal })
    if (!res.ok) throw await toAIError(res)

    const json = await res.json().catch(() => null)
    if (!json) {
      throw new AIError('接口返回的不是合法 JSON，可能不是 OpenAI 兼容接口', { kind: 'parse' })
    }

    const seen = new Set()
    const ids = []
    for (const item of extractModelIds(json)) {
      const raw = typeof item === 'string' ? item : item?.id ?? item?.name ?? item?.model
      const id = String(raw ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    return ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  } catch (err) {
    const wrapped = wrapFetchError(err, link)
    if (wrapped.kind === 'not-found') {
      throw new AIError('这个地址没有模型列表（GET /models 返回 404），请手动填写模型名', {
        status: wrapped.status,
        kind: 'no-models',
        detail: wrapped.detail,
      })
    }
    throw wrapped
  } finally {
    link.dispose()
  }
}
