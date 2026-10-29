<script setup>
/**
 * 微信 · 聊天设置（聊天页右上角「⋯」打开的底部抽屉）
 * ------------------------------------------------------------
 * 这里只负责界面，所有改动都 emit 给 Wechat.vue 统一落盘：
 * - bg         聊天背景：none 默认 / grad 预置渐变 / image 相册图（存 IndexedDB）
 * - memory     聊天记忆：开关 / 自动整理轮数 / 每次携带条数 / 自定义提示词（条目本体在「记忆」App）
 * - timeAware  时间感知：开启后发消息会带一条「现在是 …」给模型
 * - alive      活人感：开启后额外注入「微信是手打出来的」那段提示词（src/api/chatPrompt.js）
 * - blocked    拉黑好友：开启后聊天页输入栏变成提示条
 * - worldbooks 世界书勾选：只勾「局部」条目；「全局」条目所有对话自动参与
 */
import { computed, ref } from 'vue'
import { MEMORY_INJECT_MAX, useMemoryStore } from '@/stores/memory'
import { WB_POSITIONS, useWorldbookStore } from '@/stores/worldbook'
import { removeImage, putImage } from '@/utils/storage'
import { compressImage, newImageKey } from '@/utils/image'

const props = defineProps({
  chat: { type: Object, required: true },
})

const emit = defineEmits(['update', 'toggle-wb', 'search', 'remove', 'close', 'notice'])

/** 预置背景：默认 + 4 个低饱和渐变（和桌面壁纸一个调子） */
const BG_PRESETS = [
  { id: 'none', label: '默认', css: '' },
  { id: 'dusk', label: '暮粉', css: 'linear-gradient(160deg, #fdf2f6, #f8dbe6 58%, #f2c9d9)' },
  { id: 'mist', label: '晨雾', css: 'linear-gradient(160deg, #f4f7fb, #e6eef7 58%, #d9e5f2)' },
  { id: 'sand', label: '暖沙', css: 'linear-gradient(160deg, #fbf5ec, #f2e5d3 58%, #e8d5bd)' },
  { id: 'night', label: '夜色', css: 'linear-gradient(160deg, #2f2b33, #403a45 58%, #4d4653)' },
]

/** 自定义总结提示词的占位示例（留空就用内置提示词；这里写的会追加在后面） */
const DEFAULT_PROMPT =
  '另外注意：只记和我们的关系有关的事，不用记我今天吃了什么这种日常流水账。'

const worldbook = useWorldbookStore()
const memoryStore = useMemoryStore()
/** 只列「局部」条目：全局条目所有对话都自动生效，勾了也没意义 */
const books = computed(() => worldbook.entries.filter((item) => item.scope === 'local'))
const globalCount = computed(() => worldbook.globalCount)

/** 位置简称（前 / 中 / 后），小标签用 */
function positionShort(id) {
  return WB_POSITIONS.find((item) => item.id === id)?.short ?? '中'
}

const bgType = computed(() => props.chat.bg?.type ?? 'none')
const bgValue = computed(() => props.chat.bg?.value ?? '')
const memory = computed(() => props.chat.memory ?? {})
/** 活人感：老存档没这字段，按「开」显示 */
const alive = computed(() => props.chat.alive !== false)
const selectedWb = computed(() => props.chat.worldbooks ?? [])

const bgLabel = computed(() => {
  if (bgType.value === 'image') return '自定义图片'
  if (bgType.value === 'grad') {
    return BG_PRESETS.find((item) => item.css === bgValue.value)?.label ?? '自定义渐变'
  }
  return '默认（跟 App 底色一致）'
})

const summaryLabel = computed(() => {
  const book = memoryStore.bookOf(props.chat.id)
  const count = book?.items?.length ?? 0
  if (!memory.value.enabled) return '记忆未开启：聊天时不会带上记忆，也不会自动整理'
  if (count) {
    const core = book.items.filter((item) => item.level === 3).length
    return `已记住 ${count} 条（关键 ${core} 条）· 打开「记忆」App 可以逐条查看和修改`
  }
  return `满 ${memory.value.rounds} 轮自动整理一次 · 也可以在「记忆」App 里手动整理`
})

/** 每次携带几条（0 = 只整理不携带）；老存档没这字段就按默认值显示 */
const injectMax = computed(() => memory.value.injectMax ?? MEMORY_INJECT_MAX)

/** 一句话说清"这次到底会带进去几条"：条数按等级优先取，不够就有多少带多少 */
const injectLabel = computed(() => {
  if (!injectMax.value) return '0 条：记忆照常整理，但聊天时不带进去'
  const count = memoryStore.bookOf(props.chat.id)?.items?.length ?? 0
  if (!count) return `每次最多带 ${injectMax.value} 条 · 现在还没有记忆，先整理一次`
  const carried = Math.min(injectMax.value, count)
  return `每次带 ${carried} 条（★★★ 优先，同级先带最近提到的）· 已记住 ${count} 条`
})

const busy = ref(false)
const fileEl = ref(null)

function patch(data) {
  emit('update', data)
}

function patchMemory(data) {
  emit('update', { memory: data })
}

/** 轮数限制在 2~50，手点也点不飞 */
function setRounds(next) {
  const value = Number(next)
  const safe = Number.isFinite(value) ? Math.min(50, Math.max(2, Math.round(value))) : 8
  patchMemory({ rounds: safe })
}

/** 携带条数限制在 0~30；0 也有意义（只整理不携带），所以不能用 || 兜底 */
function setInjectMax(next) {
  const value = Number(next)
  const safe = Number.isFinite(value)
    ? Math.min(30, Math.max(0, Math.round(value)))
    : MEMORY_INJECT_MAX
  patchMemory({ injectMax: safe })
}

async function clearBg() {
  if (bgType.value === 'image' && bgValue.value) await removeImage(bgValue.value)
  patch({ bg: { type: 'none', value: '' } })
}

function pickPreset(preset) {
  if (preset.id === 'none') {
    clearBg()
    return
  }
  // 换成渐变时把之前存的图片一起清掉，别在 IndexedDB 里留垃圾
  if (bgType.value === 'image' && bgValue.value) removeImage(bgValue.value)
  patch({ bg: { type: 'grad', value: preset.css } })
}

function pickImage() {
  if (busy.value) return
  fileEl.value?.click()
}

async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  busy.value = true
  try {
    // 背景图只要铺满屏，压到 900 够用，省 IndexedDB 空间
    const blob = await compressImage(file, { max: 900, quality: 0.82 })
    const key = newImageKey()
    await putImage(key, blob)
    const old = bgType.value === 'image' ? bgValue.value : ''
    patch({ bg: { type: 'image', value: key } })
    if (old && old !== key) await removeImage(old)
  } catch (err) {
    console.warn('[chat-settings] 背景图保存失败', err)
    emit('notice', '背景图保存失败，换一张试试')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="sheet-mask" @click="emit('close')">
    <section class="sheet" @click.stop>
      <header class="sheet-head">
        <span class="sheet-title">{{ chat.name }} · 聊天设置</span>
        <button class="wx-back" aria-label="关闭" @click="emit('close')">
          <span class="i-ph-x" />
        </button>
      </header>

      <div class="sheet-body no-scrollbar">
        <!-- ---------------- 聊天背景 ---------------- -->
        <div class="st-block">
          <div class="st-row">
            <span class="st-name">聊天背景</span>
            <span class="st-hint">仅当前好友</span>
          </div>

          <div class="bg-grid">
            <button
              v-for="preset in BG_PRESETS"
              :key="preset.id"
              class="bg-cell"
              :class="{
                on:
                  preset.id === 'none'
                    ? bgType === 'none'
                    : bgType === 'grad' && bgValue === preset.css,
              }"
              :style="preset.css ? { background: preset.css } : null"
              @click="pickPreset(preset)"
            >
              <span v-if="preset.id === 'none'" class="bg-none i-ph-prohibit" />
              <span class="bg-name">{{ preset.label }}</span>
            </button>
          </div>

          <div class="st-actions">
            <button class="wx-btn sm ghost" :disabled="busy" @click="pickImage">
              <span class="i-ph-image" />
              <span>{{ busy ? '处理中…' : '从相册选图' }}</span>
            </button>
            <button class="wx-btn sm danger" :disabled="bgType === 'none'" @click="clearBg">
              <span>清除背景</span>
            </button>
          </div>
          <p class="st-note">当前：{{ bgLabel }}</p>

          <input ref="fileEl" class="hidden" type="file" accept="image/*" @change="onFile" />
        </div>

        <!-- ---------------- 聊天记忆 ---------------- -->
        <div class="st-block">
          <div class="st-row">
            <span class="st-name">聊天记忆</span>
            <button
              class="wx-switch"
              :class="{ on: memory.enabled }"
              :aria-pressed="memory.enabled"
              aria-label="开启聊天记忆"
              @click="patchMemory({ enabled: !memory.enabled })"
            />
          </div>
          <p class="st-note">
            开启后按下面的规则把旧对话整理成一条条记忆，按重要程度存进「记忆」App；聊天时会自动带上最重要的几条。
          </p>

          <div class="mode-grid">
            <div class="mode on">
              <span class="mode-title">传统总结</span>
              <span class="mode-desc">聊满 N 轮压成短句记忆</span>
              <span class="mode-tag">已启用</span>
            </div>
            <div class="mode dim">
              <span class="mode-title">向量总结</span>
              <span class="mode-desc">按语义检索历史片段</span>
              <span class="mode-tag">以后再说</span>
            </div>
          </div>

          <div class="st-row">
            <span class="st-name">触发轮数</span>
            <div class="stepper">
              <button aria-label="减少" @click="setRounds(memory.rounds - 1)">−</button>
              <input
                class="stepper-input"
                type="number"
                min="2"
                max="50"
                :value="memory.rounds"
                @change="setRounds($event.target.value)"
              />
              <button aria-label="增加" @click="setRounds(memory.rounds + 1)">+</button>
            </div>
          </div>

          <div class="st-row">
            <span class="st-name">携带条数</span>
            <div class="stepper">
              <button aria-label="减少" @click="setInjectMax(injectMax - 1)">−</button>
              <input
                class="stepper-input"
                type="number"
                min="0"
                max="30"
                :value="injectMax"
                @change="setInjectMax($event.target.value)"
              />
              <button aria-label="增加" @click="setInjectMax(injectMax + 1)">+</button>
            </div>
          </div>
          <p class="st-note">{{ injectLabel }}</p>

          <label class="st-field">
            <span class="st-name">自定义总结提示词</span>
            <textarea
              class="wx-textarea"
              :value="memory.prompt"
              :placeholder="DEFAULT_PROMPT"
              @input="patchMemory({ prompt: $event.target.value })"
            />
          </label>

          <p class="st-note">{{ summaryLabel }}</p>
        </div>

        <!-- ---------------- 活人感 ---------------- -->
        <div class="st-block">
          <div class="st-row">
            <span class="st-name">活人感</span>
            <button
              class="wx-switch"
              :class="{ on: alive }"
              :aria-pressed="alive"
              aria-label="开启活人感"
              @click="patch({ alive: !alive })"
            />
          </div>
          <p class="st-note">
            开启后额外告诉模型：微信是手打出来的——回得短、会敷衍、不一定接得住话，只发说出口的字，不写旁白和客服话术。关掉就只剩人设本身。
          </p>
          <p class="st-note">
            回复会按 [s] 标签自动拆成多条气泡；这条格式指令每轮都会带上，不跟着上面的开关关。
          </p>
        </div>

        <!-- ---------------- 时间感知 / 拉黑 ---------------- -->
        <div class="st-block">
          <div class="st-row">
            <span class="st-name">时间感知</span>
            <button
              class="wx-switch"
              :class="{ on: chat.timeAware }"
              :aria-pressed="chat.timeAware"
              aria-label="开启时间感知"
              @click="patch({ timeAware: !chat.timeAware })"
            />
          </div>
          <p class="st-note">开启后每次发送都会告诉模型「现在是几点、星期几」，它才接得住「今天 / 这么晚了」。</p>

          <div class="st-row">
            <span class="st-name">拉黑好友</span>
            <button
              class="wx-switch"
              :class="{ on: chat.blocked }"
              :aria-pressed="chat.blocked"
              aria-label="拉黑好友"
              @click="patch({ blocked: !chat.blocked })"
            />
          </div>
          <p class="st-note">拉黑后输入栏会变成提示条，发不出消息，记录保留。</p>
        </div>

        <!-- ---------------- 世界书 ---------------- -->
        <div class="st-block">
          <div class="st-row">
            <span class="st-name">世界书</span>
            <span class="st-hint">已选 {{ selectedWb.length }} / {{ books.length }}</span>
          </div>

          <div v-if="books.length" class="wb-list">
            <button
              v-for="book in books"
              :key="book.id"
              class="wb-item"
              :class="{ on: selectedWb.includes(book.id), off: book.enabled === false }"
              @click="emit('toggle-wb', book.id)"
            >
              <span class="wb-check" :class="{ on: selectedWb.includes(book.id) }">
                <span class="i-ph-check" />
              </span>
              <span class="wb-main">
                <span class="wb-title">
                  {{ book.title }}
                  <span class="wb-tag pos">{{ positionShort(book.position) }}</span>
                  <span v-if="book.constant" class="wb-tag must">必读</span>
                </span>
                <span class="wb-key">
                  {{ (book.keys || []).join(' · ') || '无关键词（只在「必读」时注入）' }}
                </span>
              </span>
            </button>
          </div>
          <p v-else class="st-note">
            还没有「局部」世界书。去「世界书」App 新建一条，范围选「局部」，就能在这里勾。
          </p>
          <p v-if="globalCount" class="st-note">
            另有 {{ globalCount }} 条全局世界书自动生效，不用勾。
          </p>
          <p class="st-note">
            勾中的条目：命中关键词（或勾了必读）才注入；位置「前 / 中 / 后」决定它插在对话的哪里。
          </p>
        </div>

        <!-- ---------------- 查找 ---------------- -->
        <div class="st-block">
          <button class="st-line" @click="emit('search')">
            <span class="st-line-icon i-ph-magnifying-glass" />
            <span class="st-name">查找聊天记录</span>
            <span class="st-line-icon i-ph-caret-right" />
          </button>
        </div>

        <!-- ---------------- 删除 ---------------- -->
        <div class="st-block">
          <button class="wx-btn danger block" @click="emit('remove')">删除好友</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ---------- 抽屉外壳 ---------- */
.sheet-mask {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  background: rgba(58, 44, 52, 0.26);
  animation: mask-in 0.18s ease;
}

@keyframes mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 82%;
  border-radius: calc(var(--u) * 20) calc(var(--u) * 20) 0 0;
  background: rgba(255, 251, 253, 0.98);
  animation: sheet-in 0.22s cubic-bezier(0.22, 0.8, 0.24, 1);
}

@keyframes sheet-in {
  from {
    transform: translateY(8%);
  }
  to {
    transform: none;
  }
}

.sheet-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 6);
  height: calc(var(--u) * 44);
  padding: 0 calc(var(--u) * 10) 0 calc(var(--u) * 14);
  border-bottom: 1px solid rgba(124, 101, 112, 0.08);
}

.sheet-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: calc(var(--u) * 13.5);
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--c-text);
}

.sheet-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: calc(var(--u) * 10);
  padding: calc(var(--u) * 10) calc(var(--u) * 12) calc(var(--u) * 18);
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* ---------- 分区 ---------- */
.st-block {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 8);
  padding: calc(var(--u) * 10) calc(var(--u) * 11);
  border-radius: calc(var(--u) * 14);
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.95);
}

.st-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--u) * 8);
}

.st-name {
  font-size: calc(var(--u) * 12.5);
  font-weight: 600;
  color: var(--c-text);
}

.st-hint {
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
}

.st-note {
  margin: 0;
  font-size: calc(var(--u) * 10.5);
  line-height: 1.6;
  color: var(--c-text-faint);
}

.st-actions {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 8);
}

.st-field {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 6);
}

.st-line {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 8);
  width: 100%;
  height: calc(var(--u) * 30);
  background: none;
}

.st-line .st-name {
  flex: 1;
  text-align: left;
}

.st-line-icon {
  font-size: calc(var(--u) * 14);
  color: var(--c-text-soft);
}

/* ---------- 聊天背景色卡 ---------- */
.bg-grid {
  display: flex;
  gap: calc(var(--u) * 7);
}

.bg-cell {
  position: relative;
  display: flex;
  flex: 1;
  align-items: flex-end;
  justify-content: center;
  height: calc(var(--u) * 54);
  overflow: hidden;
  border-radius: calc(var(--u) * 11);
  border: 1px solid rgba(124, 101, 112, 0.12);
  background: rgba(255, 255, 255, 0.6);
}

.bg-cell.on {
  border-color: rgba(226, 140, 166, 0.9);
  outline: calc(var(--u) * 1.5) solid rgba(226, 140, 166, 0.35);
  outline-offset: calc(var(--u) * 1);
}

.bg-none {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--u) * 15);
  color: rgba(124, 101, 112, 0.35);
}

.bg-name {
  position: relative;
  z-index: 1;
  margin-bottom: calc(var(--u) * 4);
  padding: 0 calc(var(--u) * 6);
  border-radius: 999px;
  font-size: calc(var(--u) * 8.5);
  color: var(--c-text-soft);
  background: rgba(255, 255, 255, 0.82);
}

/* ---------- 记忆模式卡 ---------- */
.mode-grid {
  display: flex;
  gap: calc(var(--u) * 7);
}

.mode {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 1);
  padding: calc(var(--u) * 8) calc(var(--u) * 9);
  border-radius: calc(var(--u) * 11);
  background: rgba(247, 168, 190, 0.1);
  border: 1px dashed rgba(226, 140, 166, 0.4);
}

.mode.dim {
  background: rgba(124, 101, 112, 0.06);
  border-color: rgba(124, 101, 112, 0.18);
}

.mode-title {
  font-size: calc(var(--u) * 11.5);
  font-weight: 600;
  color: var(--c-text);
}

.mode.dim .mode-title {
  color: var(--c-text-soft);
}

.mode-desc {
  font-size: calc(var(--u) * 9.5);
  line-height: 1.5;
  color: var(--c-text-faint);
}

.mode-tag {
  align-self: flex-start;
  margin-top: calc(var(--u) * 2);
  padding: 0 calc(var(--u) * 6);
  border-radius: 999px;
  font-size: calc(var(--u) * 8.5);
  color: #b3717f;
  background: rgba(255, 255, 255, 0.85);
}

/* ---------- 轮数步进器 ---------- */
.stepper {
  display: flex;
  flex: none;
  align-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(124, 101, 112, 0.12);
}

.stepper button {
  width: calc(var(--u) * 26);
  height: calc(var(--u) * 26);
  font-size: calc(var(--u) * 13);
  color: var(--c-text-soft);
}

.stepper-input {
  width: calc(var(--u) * 34);
  height: calc(var(--u) * 26);
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: calc(var(--u) * 12);
  text-align: center;
  color: var(--c-text);
  outline: none;
  -moz-appearance: textfield;
}

.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

/* ---------- 世界书勾选 ---------- */
.wb-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 6);
}

.wb-item {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 8);
  padding: calc(var(--u) * 7) calc(var(--u) * 8);
  border-radius: calc(var(--u) * 10);
  text-align: left;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(124, 101, 112, 0.08);
  transition: border-color 0.16s ease;
}

.wb-item.on {
  background: rgba(247, 168, 190, 0.12);
  border-color: rgba(226, 140, 166, 0.55);
}

.wb-item.off {
  opacity: 0.55;
}

.wb-check {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 16);
  height: calc(var(--u) * 16);
  border-radius: calc(var(--u) * 5);
  font-size: calc(var(--u) * 10);
  color: #fff;
  background: rgba(124, 101, 112, 0.18);
  transition: background 0.16s ease;
}

.wb-check.on {
  background: linear-gradient(135deg, #f7a8be, #e28ca6);
}

.wb-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 1);
}

.wb-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--u) * 4);
  font-size: calc(var(--u) * 11.5);
  color: var(--c-text);
}

/* 位置 / 必读小标签：一眼看出这条插哪儿、是不是常驻 */
.wb-tag {
  flex: none;
  padding: 0 calc(var(--u) * 5);
  border-radius: 999px;
  font-size: calc(var(--u) * 8.5);
  line-height: 1.7;
}

.wb-tag.pos {
  color: #7a8fb0;
  background: rgba(150, 175, 210, 0.2);
}

.wb-tag.must {
  color: #b98844;
  background: rgba(240, 200, 140, 0.26);
}

.wb-key {
  overflow: hidden;
  font-size: calc(var(--u) * 9);
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--c-text-faint);
}

.hidden {
  display: none;
}
</style>
