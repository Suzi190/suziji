/**
 * 记忆总结（传统总结，非向量检索）
 * ------------------------------------------------------------
 * 这里只做三件事，界面和存储都不碰：
 * 1. 提示词：把「该记什么、怎么分轻重」写成一份稳定的角色卡，别让模型自由发挥
 * 2. 组请求：旧记忆 + 这次的新聊天 → 一条请求
 * 3. 解析：模型很可能不老实输出 JSON，所以 JSON 优先、行格式兜底
 *
 * 调用方（记忆 App / 微信自动整理）拿到的是：
 *   [{ text, level, kind, when, quote }]
 * 落盘、去重、强化都交给 stores/memory.js，这里保持纯函数。
 */

/** 单次最多接受多少条（宁缺毋滥，模型爱刷条目） */
export const MEMORY_MAX_ITEMS = 12

/** 单次最多读多少条聊天（太多了模型抓不住重点，也费钱） */
export const MEMORY_TRANSCRIPT_LIMIT = 80

/** 单次请求最多带多少条旧记忆（防止提示词越滚越长） */
export const MEMORY_OLD_LIMIT = 30

/**
 * 重要等级 —— 整个记忆模块的「轻重缓急」就是这三档
 * 3 关键：忘了会出大错（身份、关系、承诺、底线、重大事件）
 * 2 重要：忘了会变生疏（具体事件、计划、偏好、情绪转折）
 * 1 次要：忘了没影响（闲聊细节、氛围）
 */
export const MEMORY_LEVELS = [
  {
    id: 3,
    name: '关键',
    mark: '★★★',
    desc: '身份、关系、认真许下的承诺、一直成立的禁忌、重大事件。忘了会直接做错事。',
  },
  {
    id: 2,
    name: '重要',
    mark: '★★',
    desc: '具体发生过的事、计划、明确的偏好、情绪的重要转折。忘了会变生疏。',
  },
  {
    id: 1,
    name: '次要',
    mark: '★',
    desc: '日常闲聊的细节、气氛与小习惯。忘了基本没影响。',
  },
]

/** 记忆类型：只影响展示和提示词措辞，不参与判断 */
export const MEMORY_KINDS = [
  { id: 'fact', name: '事实' },
  { id: 'event', name: '事件' },
  { id: 'promise', name: '承诺' },
  { id: 'preference', name: '偏好' },
  { id: 'emotion', name: '情绪' },
  { id: 'boundary', name: '底线' },
]

const KIND_IDS = MEMORY_KINDS.map((item) => item.id)

/**
 * 系统提示词
 * ------------------------------------------------------------
 * 写这套提示词的思路（别随手改，改坏了记忆就会记成一堆废话）：
 * - 先教它「怎么判断该不该记」，再给清单：人脑是筛过的，不是录音笔
 * - 尤其不能写成关键词触发（「出现『别』就记」）——那会把「别这样」「先别理我」
 *   这种当场情绪全记成关键；要判断的是长期性，不是字面
 * - 专门有一节「不该记的」，负例比正例更能压住流水账
 * - 时间必须记，但允许留空，禁止编造
 * - 分级标准写成「忘了会怎样」，模型才知道该给谁打 3 分
 * - 只给 JSON + 一组示例，示例里底线那条特意写成长期陈述句，别写成「她说了一句别」
 */
const MEMORY_SYSTEM_PROMPT = `你是「记忆整理员」。你只做一件事：把一段手机聊天记录压缩成一份能长期保存、日后直接拿来用的记忆。

## 一、像人一样判断：什么才值得长期记住
人的记忆不是录音，是筛过的。人只会留下「过一阵子回头看还成立、以后还会影响相处」的东西，其余当场就淡了。
所以每条记忆落笔前，先问自己三个问题：
1. 过一段时间，这件事还成立吗？（长期禁忌、固定偏好、已经发生的重要事件 → 成立；此刻的情绪、当下的请求 → 不成立）
2. 下次再遇到，不知道它会不会让我做错事、说错话、显得不上心？
3. 这说的是「这个人 / 这段关系」，还是「这次聊天的过程」？
三个都点头才收。整段只是寒暄、斗图、报备行程，就返回空数组 []。

## 二、值得记的内容（按价值排序）
1. {char} 做过、答应过的事：做过什么决定、许过什么承诺、说过哪句关键的话。写清「谁做了什么」。
2. 事情发生的时间：能确定的写具体（10月27日晚上、周三下午），不确定就留空，绝对不要猜。
3. {user} 的偏好与禁忌：判断的是「这说明了什么长期事实」，不是「这句话里出现了什么字」。
   - 算数的是长期性：同一个意思被提过两次以上，或原话带「我一直」「我从来」「每次都」「以后别再」这类针对长期的说法。
   - 只说过一次、明显是当下情绪的话（「别这样」「先别理我」「不想说话」），不是底线；能看出会影响以后相处，就记成 level 2 的情绪或偏好，看不出就不记。
   - 真正长期成立的（一直不喜欢被叫某个称呼、不能提某个人某件事、被比较会难受）才记成底线，用陈述句写清楚，不要写成「某次说了句别」。
4. 关系的变化：称呼怎么变、亲近到什么程度、吵架与和好、约定了什么。
5. 可复用的具体信息：称呼、生日、喜欢和讨厌的东西、正在忙的事、身边的人、常去的地点。
6. 还没兑现的约定：确实说定了的才算（客套的「改天吧」「有空再约」不算），这类至少标成重要。

## 三、不该记的（比记什么更重要）
- 一次性的情绪和语气：此刻的烦、撒娇、赌气、玩笑、口是心非；「别这样」「别闹」这类过一会儿就好的话。
- 临时状态：正在忙、在开会、已经睡了、路上堵车。确实会影响回复的，最多记成 level 1。
- 寒暄客套、表情包、「哈哈哈哈」、重复的早安晚安、纯表情对话。
- 猜出来的心理和用意、评价、建议；记录里没明说的一律不写。
- 同一件事换种说法的重复条目：合并成一条，只留信息最全的那个版本。
- 只出现过一次、对以后毫无影响的细节。

记住一句：宁可漏记，也不要记流水账。记得少但都准，比记得多但一半是噪声有用得多。

## 四、分轻重缓急（人脑也是这么排的）
问自己「如果忘了，会怎样」：
- level 3（关键）：忘了会直接做错——身份与关系、认真许下的承诺、一直成立的禁忌、重大事件与转折。
- level 2（重要）：忘了会显得不上心——具体发生的事、明确的计划与偏好、情绪的重要转折。
- level 1（次要）：忘了基本没影响，但能当聊天素材——小习惯、口味、随口提过的琐事。

硬性限制：level 1 最多 2 条（这类最容易被写成流水账）；同一件事只留信息量最大的那一条，不要一句一条地抄。
像人脑一样分配注意力：最近发生的、反复被提到的、情绪最强烈的写具体；很久以前又没再被提起的压成一句话、只留事实。

## 五、写法要求
- 写「长期成立的事实」，不写「当时那句话」。反例：「{user}说了一句别这样」「两人聊到下雨」；正例：「{user}不喜欢情绪上头时被追问」——但只有记录真的支持这个结论时才这么写。
- 第三人称、一句话一条，40 字内，读完就懂；不要用「可能」「似乎」「大概」这类含糊词。
- 只写记录里确定出现过的内容：不推测心理，不编造没发生的事，不写建议和评价。
- 名字、数字、地点、时间原样保留，不要概括成「某天」「某个地方」。
- 最多 ${MEMORY_MAX_ITEMS} 条，优先关键和重要；实在没有值得记的就返回空数组 []。

## 六、输出格式
只输出 JSON 数组，不要解释、不要额外文字。字段：
- text：记忆内容（第三人称、40 字内）
- level：1 / 2 / 3
- kind：fact（事实）/ event（事件）/ promise（承诺）/ preference（偏好）/ emotion（情绪）/ boundary（底线）
- when：事情发生的时间，不确定就写 ""
- quote：最能支撑这条结论的一句原话（20 字内），没有就写 ""

示例（注意：底线那条写的是长期事实，不是「她说了句别」；「先别理我」这种当下一句情绪不会出现在这里）：
[
  {"text": "{char}答应周六陪{user}去看海", "level": 3, "kind": "promise", "when": "10月27日晚上", "quote": "周六带你去海边"},
  {"text": "{user}一直不喜欢被叫「宝贝」，说每次听到都别扭", "level": 3, "kind": "boundary", "when": "", "quote": "我一直不喜欢被这么叫"},
  {"text": "{char}最近在赶一个项目，常常很晚才回消息", "level": 2, "kind": "event", "when": "10月下旬", "quote": "今天又要加班"}
]`

// ---------------- 小工具 ----------------

const pad = (num) => String(num).padStart(2, '0')

/** 聊天记录里的时间戳：10月27日 21:40 */
export function whenLabel(at) {
  if (!at) return ''
  const date = new Date(at)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function clampLevel(value) {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num)) return 2
  return Math.min(3, Math.max(1, num))
}

function levelOf(id) {
  return MEMORY_LEVELS.find((item) => item.id === clampLevel(id)) ?? MEMORY_LEVELS[1]
}

/** 类型名给界面用（事实 / 事件 / 承诺 …） */
export function kindName(id) {
  return MEMORY_KINDS.find((item) => item.id === id)?.name ?? '事实'
}

/** 一条记忆在提示词里的样子：★★★ 内容（10月27日晚上；原话：…） */
export function memoryLine(item) {
  const meta = [item.when, item.quote ? `原话：${item.quote}` : ''].filter(Boolean).join('；')
  return `${levelOf(item.level).mark} ${item.text}${meta ? `（${meta}）` : ''}`
}

/** 把模型的返回收成合法条目，脏数据直接丢 */
export function normalizeItem(raw) {
  const text = cleanText(raw?.text ?? raw?.content ?? raw?.memory ?? raw?.summary, 80)
  if (text.length < 2) return null
  const kindRaw = String(raw?.kind ?? raw?.type ?? '').toLowerCase()
  return {
    text,
    level: clampLevel(raw?.level ?? raw?.importance ?? raw?.weight),
    kind: KIND_IDS.includes(kindRaw) ? kindRaw : 'fact',
    when: cleanText(raw?.when ?? raw?.time ?? raw?.date, 20),
    quote: cleanText(raw?.quote ?? raw?.original ?? raw?.source, 40),
  }
}

// ---------------- 解析 ----------------

/** 兜底：模型没按 JSON 输出，就按行硬读（[3] 内容 / ★★★ 内容 / 关键：内容） */
function parseLooseLine(line) {
  let text = String(line || '').trim()
  if (!text) return null
  if (/^(下面|以上|说明|注意|补充|输出|格式)/.test(text)) return null
  text = text.replace(/^[-*•·]\s*/, '')

  let level = 2
  const stars = text.match(/^[★⭐✦]+/)
  if (stars) {
    level = Math.min(3, stars[0].length)
    text = text.slice(stars[0].length).trim()
  } else {
    const num = text.match(/^[[【(（]?\s*([123])\s*[\]】)）]?\s*[.、:：,，\-—]?\s*/)
    if (num) {
      level = Number(num[1])
      text = text.slice(num[0].length).trim()
    } else {
      const word = text.match(/^(关键|重要|次要)\s*[.、:：,，\-—]?\s*/)
      if (word) {
        level = word[1] === '关键' ? 3 : word[1] === '重要' ? 2 : 1
        text = text.slice(word[0].length).trim()
      }
    }
  }

  // 开头的括号时间：(10月27日晚上) 内容
  let when = ''
  const bracket = text.match(/^[(（]\s*([^)）]{2,20}?)\s*[)）]\s*/)
  if (bracket) {
    when = bracket[1]
    text = text.slice(bracket[0].length)
  }
  text = text.replace(/^["'「『]/, '').replace(/["'」』]$/, '').trim()
  if (text.length < 4) return null
  return { text: text.slice(0, 80), level, kind: 'fact', when, quote: '' }
}

/**
 * 硬性收口：次要记忆最多留 2 条
 * 提示词里已要求「level 1 最多 2 条」，但模型经常不听；这里兜一下，
 * 防止一次整理回来一堆流水账（越次要越靠后，所以直接砍尾巴最安全）
 */
function capMinor(list) {
  let minor = 0
  return list.filter((item) => {
    if (item.level !== 1) return true
    minor += 1
    return minor <= 2
  })
}

/**
 * 解析模型返回
 * 优先 JSON（可能被包在 ```json 里，或前后带解释），失败再按行读
 */
export function parseMemoryReply(reply) {
  const raw = String(reply ?? '').trim()
  if (!raw) return []

  const cleaned = raw.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '').trim()

  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start >= 0 && end > start) {
    const slice = cleaned.slice(start, end + 1)
    // 第一次严格解析，第二次顺手修一下模型常犯的尾逗号
    const candidates = [slice, slice.replace(/,\s*([\]}])/g, '$1')]
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate)
        if (!Array.isArray(parsed)) continue
        // [1] / [3] 这种是行格式里的编号，不是记忆 JSON，别当成「空结果」直接吞掉
        const hasObject = parsed.some((one) => one && typeof one === 'object')
        if (!hasObject && parsed.length) continue
        return capMinor(parsed.map(normalizeItem).filter(Boolean)).slice(0, MEMORY_MAX_ITEMS)
      } catch {
        /* 换下一种写法 */
      }
    }
  }

  return capMinor(
    cleaned
      .split(/\r?\n/)
      .map((line) => parseLooseLine(line))
      .filter(Boolean),
  ).slice(0, MEMORY_MAX_ITEMS)
}

// ---------------- 组请求 ----------------

/**
 * 系统提示词
 * {char} / {user} 换成真名，模型才不会把「她」认错人；
 * extraPrompt 是用户在聊天设置里写的自定义要求，附在最后（冲突时以此为准）
 */
export function buildMemorySystemPrompt(charName, userName = '我', extraPrompt = '') {
  const base = MEMORY_SYSTEM_PROMPT.replaceAll('{char}', charName || '对方').replaceAll(
    '{user}',
    userName || '我',
  )
  const extra = String(extraPrompt || '').trim()
  return extra ? `${base}\n\n## 七、用户额外要求（与上面冲突时以此为准）\n${extra}` : base
}

/** 只取「还没整理过」的那一段，最多 MEMORY_TRANSCRIPT_LIMIT 条 */
function transcriptOf(session, fromIndex, userName) {
  // coveredCount 记的是「原始消息下标」，所以先按原始数组切，再剔掉失败的/空消息
  const raw = Array.isArray(session?.messages) ? session.messages : []
  const from = Math.max(0, Math.min(Math.round(Number(fromIndex) || 0), raw.length))
  const slice = raw
    .slice(from)
    .filter((msg) => !msg?.error && String(msg?.text ?? '').trim())
    .slice(-MEMORY_TRANSCRIPT_LIMIT)
  const who = session?.name || '对方'
  const body = slice
    .map((msg) => {
      const speaker = msg.role === 'me' ? userName || '我' : who
      const text = String(msg.text).trim().slice(0, 300)
      return `[${whenLabel(msg.at)}] ${speaker}：${text}`
    })
    .join('\n')
  return body.length > 9000 ? body.slice(-9000) : body
}

/** 用户消息：旧记忆 + 这次的新聊天 */
export function buildMemoryPayload({ session, items = [], fromIndex = 0, userName = '我' }) {
  const old = items.slice(0, MEMORY_OLD_LIMIT)
  const head = old.length
    ? `【已经记住的事】\n${old.map((item) => memoryLine(item)).join('\n')}\n（这些不要原样重复输出；只有出现新变化、或你想补充细节时才输出改写后的版本。）`
    : '【已经记住的事】\n无，这是第一次整理。'

  const transcript = transcriptOf(session, fromIndex, userName) || '（这段记录是空的。）'

  return `${head}\n\n【这次的聊天记录】\n${transcript}\n\n【任务】\n按系统说明整理这次记录：只有值得长期记住的才写，宁缺毋滥，没有就输出 []。只输出 JSON 数组。`
}

/**
 * 跑一次总结（非流式内容、流式接口都兼容，因为 chat() 会自己判断）
 * @returns {Promise<{ items: Array, raw: string, model: string }>}
 */
export async function summarizeChat({
  config,
  session,
  items = [],
  fromIndex = 0,
  userName = '我',
  extraPrompt = '',
  signal,
}) {
  const { chat: callAI } = await import('./openaiStream')
  const messages = [
    { role: 'system', content: buildMemorySystemPrompt(session?.name, userName, extraPrompt) },
    { role: 'user', content: buildMemoryPayload({ session, items, fromIndex, userName }) },
  ]
  const result = await callAI({
    config,
    messages,
    signal,
    extraBody: { temperature: 0.3 },
  })
  return {
    items: parseMemoryReply(result?.text),
    raw: String(result?.text ?? ''),
    model: result?.model || '',
  }
}
