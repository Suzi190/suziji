<script setup>
/**
 * 世界书
 * ------------------------------------------------------------
 * 注入规则参考 SillyTavern World Info：
 * - 范围：全局（所有对话自动参与）/ 局部（要在会话里勾选）
 * - 位置：前（人设之前）/ 中（人设之后）/ 后（插进最近几条聊天，可调深度）
 * - 必读：不看关键词，永远注入
 * - 关键词：任一命中即注入，可切「全部命中才触发」
 * - 插入顺序：同位置内按数字排队，小的在前
 * - 文件夹：全局 / 局部各自可以建文件夹，把条目装进去（只影响列表分组，不影响注入）
 *
 * 数据在 stores/worldbook.js（条目 `vphone.worldbook.v2`，文件夹 `vphone.worldbook.folders.v1`），
 * 改动 250ms 防抖自动落盘。
 * 这里只做界面，注入逻辑统一走 store 的 collect()，微信 / 以后的文游共用同一套。
 */
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  WB_DEPTH_MAX,
  WB_DEPTH_MIN,
  WB_ORDER_MAX,
  WB_ORDER_MIN,
  WB_POSITIONS,
  WB_SCOPES,
  useWorldbookStore,
} from '@/stores/worldbook'

const worldbook = useWorldbookStore()

/** 列表筛选：all / global / local / required / off */
const filter = ref('all')
const keyword = ref('')
/** 空字符串 = 停在列表；否则是正在编辑的条目 id */
const editingId = ref('')
/** 正在改名 / 删除的文件夹 id：点文件夹右边的「⋯」才展开那一小块面板 */
const folderEditId = ref('')
const keyInput = ref('')
const keyEl = ref(null)
const toast = ref('')
let toastTimer = null

const chips = computed(() => [
  { id: 'all', name: '全部', count: worldbook.total },
  { id: 'global', name: '全局', count: worldbook.globalCount },
  { id: 'local', name: '局部', count: worldbook.localCount },
  { id: 'required', name: '必读', count: worldbook.requiredCount },
  { id: 'off', name: '已停用', count: worldbook.disabledCount },
])

const list = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return worldbook.entries
    .filter((item) => {
      if (filter.value === 'global' && item.scope !== 'global') return false
      if (filter.value === 'local' && item.scope !== 'local') return false
      if (filter.value === 'required' && !item.constant) return false
      if (filter.value === 'off' && item.enabled !== false) return false
      if (!kw) return true
      return [item.title, item.content, ...item.keys].join(' ').toLowerCase().includes(kw)
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh'))
})

const editing = computed(
  () => worldbook.entries.find((item) => item.id === editingId.value) ?? null,
)

/**
 * 详情页自己有一整条编辑顶栏，外壳那条「‹ 世界书」再留着就会两条叠在屏幕顶部。
 * 进详情时把外壳顶栏藏起来，回到列表再露出来。
 * `appNav` 由 components/window/AppWindow.vue 通过 provide 提供，没有时静默跳过。
 */
const appNav = inject('appNav', null)
watch(editing, (value) => appNav?.hide(!!value))

// ---------------- 文件夹分组 ----------------
/** 只有「全局 / 局部」两档按文件夹分组；「全部 / 必读 / 已停用」仍是平铺清单 */
const grouped = computed(() => filter.value === 'global' || filter.value === 'local')
/** 当前档位对应的范围；「全部」等档位没有范围，新建的文件夹就落全局 */
const currentScope = computed(() => (filter.value === 'local' ? 'local' : 'global'))

const sortFolders = (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh')

const scopeFolders = computed(() =>
  worldbook.folders.filter((folder) => folder.scope === currentScope.value).sort(sortFolders),
)

const editingFolders = computed(() =>
  worldbook.folders.filter((folder) => folder.scope === editing.value?.scope).sort(sortFolders),
)

/** 文件夹 id → 名字：平铺视图里给条目挂个「它在哪个文件夹」的小标 */
const folderNames = computed(() => {
  const map = {}
  for (const folder of worldbook.folders) map[folder.id] = folder.name
  return map
})

function folderLabel(item) {
  if (grouped.value || !item.folderId) return ''
  return folderNames.value[item.folderId] ?? ''
}

/**
 * 列表段落：把 list 拆成「文件夹头 + 里面条目」
 * - 当前范围一个文件夹都没有 → 一条平铺段落，外观和以前完全一样
 * - 有关键词时，空的文件夹不占位；没关键词时空文件夹也留着（刚建完要往里放东西）
 * - 「未分组」只在有散条目、且确实存在文件夹时出现
 */
const sections = computed(() => {
  const items = list.value
  if (!grouped.value) return [{ key: 'flat', folder: null, open: true, entries: items }]

  const folders = scopeFolders.value
  if (!folders.length) return [{ key: 'flat', folder: null, open: true, entries: items }]

  const searching = Boolean(keyword.value.trim())
  const known = new Set(folders.map((folder) => folder.id))
  const loose = items.filter((item) => !item.folderId || !known.has(item.folderId))

  const rows = folders
    .map((folder) => ({
      key: folder.id,
      folder,
      open: !folder.collapsed,
      entries: items.filter((item) => item.folderId === folder.id),
    }))
    .filter((row) => row.entries.length || !searching)

  if (loose.length) rows.push({ key: 'loose', folder: null, loose: true, open: true, entries: loose })
  return rows
})

/** 换档位时说明文字跟着变，用户不用猜「中」到底插哪儿 */
const positionMeta = computed(
  () => WB_POSITIONS.find((item) => item.id === editing.value?.position) ?? WB_POSITIONS[1],
)
const scopeMeta = computed(
  () => WB_SCOPES.find((item) => item.id === editing.value?.scope) ?? WB_SCOPES[0],
)

function positionShort(id) {
  return WB_POSITIONS.find((item) => item.id === id)?.short ?? '中'
}

/** 这条到底会不会注入 —— 让用户在列表就看出「白写了」 */
function injectHint(item) {
  if (item.enabled === false) return '已停用，不注入'
  if (!item.content.trim()) return '正文是空的，不注入'
  if (item.constant) return '必读：每一轮都注入'
  if (!item.keys.length) return '没有关键词，只在「必读」时注入'
  return item.scope === 'global' ? '命中关键词即注入（全局）' : '命中关键词即注入（需勾选）'
}

function flash(text) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 1800)
}

// ---------------- 列表 → 编辑 ----------------
/** folderId 留空 = 普通新建（按当前档位的范围）；传了文件夹就落在那个文件夹里 */
function createEntry(folderId = '') {
  const folder = worldbook.folders.find((item) => item.id === folderId) ?? null
  const item = worldbook.add({
    title: '新条目',
    folderId: folder ? folder.id : '',
    scope: folder ? folder.scope : currentScope.value,
  })
  // 「必读 / 已停用」这两档会把新条目过滤掉，回「全部」免得以为没建成
  if (filter.value === 'required' || filter.value === 'off') filter.value = 'all'
  keyword.value = ''
  keyInput.value = ''
  folderEditId.value = ''
  editingId.value = item.id
}

function openEntry(item) {
  keyInput.value = ''
  folderEditId.value = ''
  editingId.value = item.id
}

function backToList() {
  editingId.value = ''
  keyInput.value = ''
}

/** 切档位时收起改名面板，免得它挂在一个看不见的文件夹上 */
function pickFilter(id) {
  filter.value = id
  folderEditId.value = ''
}

// ---------------- 文件夹 ----------------
function createFolder() {
  const folder = worldbook.addFolder({ name: '新文件夹', scope: currentScope.value })
  // 建完直接把改名面板打开，省得用户再找一次
  folderEditId.value = folder.id
}

function toggleFolderPanel(id) {
  folderEditId.value = folderEditId.value === id ? '' : id
}

function renameFolder(id, event) {
  const folder = worldbook.folders.find((item) => item.id === id)
  if (!folder) return
  // 名字清空 = 没改成，把输入框还原，别留一个空白框
  const ok = worldbook.renameFolder(id, event.target.value)
  if (!ok) event.target.value = folder.name
  else flash('文件夹已改名')
}

function removeFolder(folder) {
  const count = worldbook.entries.filter((item) => item.folderId === folder.id).length
  const tip = count
    ? `删除文件夹「${folder.name}」？\n里面的 ${count} 条不会删，会回到「未分组」。`
    : `删除文件夹「${folder.name}」？`
  if (!window.confirm(tip)) return
  worldbook.removeFolder(folder.id)
  folderEditId.value = ''
  flash('已删除文件夹')
}

function removeEditing() {
  const item = editing.value
  if (!item) return
  if (!window.confirm(`删除「${item.title}」？删掉后不能恢复。`)) return
  worldbook.remove(item.id)
  backToList()
  flash('已删除')
}

function duplicateEditing() {
  const item = editing.value
  if (!item) return
  const copy = worldbook.duplicate(item.id)
  if (!copy) return
  editingId.value = copy.id
  flash('已复制一条')
}

// ---------------- 编辑字段 ----------------
function patch(data) {
  if (editing.value) worldbook.update(editing.value.id, data)
}

/** 一次可以贴一串：逗号 / 顿号 / 空格 都当分隔符 */
function addKey() {
  if (!editing.value) return
  const raw = keyInput.value
  if (!raw.trim()) return
  const parts = raw.split(/[,，、\s]+/).map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return
  const next = [...editing.value.keys]
  for (const part of parts) if (!next.includes(part)) next.push(part)
  worldbook.update(editing.value.id, { keys: next })
  keyInput.value = ''
  nextTick(() => keyEl.value?.focus())
}

/** 输入到逗号/顿号就自动收一个词，省得每次都按回车 */
function onKeyInput() {
  if (/[,，、]$/.test(keyInput.value)) addKey()
}

function removeKey(index) {
  if (!editing.value) return
  const next = editing.value.keys.filter((_, i) => i !== index)
  worldbook.update(editing.value.id, { keys: next })
}

function setDepth(next) {
  const value = Number(next)
  const safe = Number.isFinite(value)
    ? Math.min(WB_DEPTH_MAX, Math.max(WB_DEPTH_MIN, Math.round(value)))
    : 2
  patch({ depth: safe })
}

function setOrder(next) {
  const value = Number(next)
  const safe = Number.isFinite(value)
    ? Math.min(WB_ORDER_MAX, Math.max(WB_ORDER_MIN, Math.round(value)))
    : 100
  patch({ order: safe })
}

onBeforeUnmount(() => {
  // 万一是在详情页里被卸载的，把外壳顶栏还原，别让下次打开没有顶栏
  appNav?.hide(false)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="wb">
    <!-- ================= 列表 ================= -->
    <template v-if="!editing">
      <div class="top">
        <label class="search">
          <span class="search-icon i-ph-magnifying-glass" />
          <input v-model="keyword" class="search-input" placeholder="搜标题 / 关键词 / 正文" />
          <button v-if="keyword" class="search-clear" aria-label="清空" @click="keyword = ''">
            <span class="i-ph-x" />
          </button>
        </label>
        <button class="add" @click="createEntry()">
          <span class="i-ph-plus" />
          新建
        </button>
      </div>

      <div class="chips no-scrollbar">
        <button
          v-for="chip in chips"
          :key="chip.id"
          class="chip"
          :class="{ on: filter === chip.id }"
          @click="pickFilter(chip.id)"
        >
          {{ chip.name }}
          <span class="chip-count">{{ chip.count }}</span>
        </button>
      </div>

      <!-- 只有全局 / 局部这两档才建文件夹 -->
      <div v-if="grouped" class="scope-bar">
        <span class="scope-hint">
          {{ currentScope === 'global' ? '全局' : '局部' }}条目可以装进文件夹
        </span>
        <button class="folder-add" @click="createFolder">
          <span class="i-ph-folder-plus" />
          新建文件夹
        </button>
      </div>

      <div class="list">
        <template v-for="section in sections" :key="section.key">
          <!-- 文件夹头：点名字折叠 / 展开 -->
          <div v-if="section.folder" class="folder-head" :class="{ folded: section.folder.collapsed }">
            <button class="folder-main" @click="worldbook.toggleFolder(section.folder.id)">
              <span
                class="folder-chevron"
                :class="section.folder.collapsed ? 'i-ph-caret-right' : 'i-ph-caret-down'"
              />
              <span class="folder-name">{{ section.folder.name }}</span>
              <span class="folder-count">{{ section.entries.length }}</span>
            </button>
            <button
              class="folder-btn"
              aria-label="在这个文件夹里新建条目"
              @click="createEntry(section.folder.id)"
            >
              <span class="i-ph-plus" />
            </button>
            <button
              class="folder-btn"
              :class="{ on: folderEditId === section.folder.id }"
              aria-label="重命名或删除文件夹"
              @click="toggleFolderPanel(section.folder.id)"
            >
              <span class="i-ph-dots-three" />
            </button>
          </div>

          <!-- 没装进任何文件夹的散条目 -->
          <div v-else-if="section.loose" class="folder-head plain">
            <span class="folder-name">未分组</span>
            <span class="folder-count">{{ section.entries.length }}</span>
          </div>

          <!-- 改名 / 删除面板 -->
          <div v-if="section.folder && folderEditId === section.folder.id" class="folder-panel">
            <input
              class="input"
              :value="section.folder.name"
              maxlength="20"
              placeholder="文件夹名称"
              @change="renameFolder(section.folder.id, $event)"
            />
            <div class="folder-panel-row">
              <button class="folder-del" @click="removeFolder(section.folder)">删除文件夹</button>
              <span class="hint">只去掉外壳，里面的条目回到「未分组」。</span>
            </div>
          </div>

          <template v-if="section.open">
            <article
              v-for="item in section.entries"
              :key="item.id"
              class="entry"
              :class="{ off: item.enabled === false, 'in-folder': section.folder }"
            >
              <button class="entry-main" @click="openEntry(item)">
                <span class="entry-head">
                  <span class="entry-title">{{ item.title }}</span>
                  <span class="tag" :class="item.scope">
                    {{ item.scope === 'global' ? '全局' : '局部' }}
                  </span>
                  <span v-if="item.constant" class="tag required">必读</span>
                  <span v-if="folderLabel(item)" class="tag dir">
                    <span class="i-ph-folder-simple" />
                    {{ folderLabel(item) }}
                  </span>
                </span>

                <span class="entry-meta">
                  <span class="meta">位置 {{ positionShort(item.position) }}</span>
                  <span v-if="item.position === 'after'" class="meta">深度 {{ item.depth }}</span>
                  <span class="meta">顺序 {{ item.order }}</span>
                  <span class="meta">{{ item.keys.length ? `${item.keys.length} 个词` : '无关键词' }}</span>
                </span>

                <span class="entry-text">{{ item.content || '（还没有正文）' }}</span>

                <span v-if="item.keys.length" class="keys">
                  <span v-for="key in item.keys.slice(0, 5)" :key="key" class="key">{{ key }}</span>
                  <span v-if="item.keys.length > 5" class="key more">
                    +{{ item.keys.length - 5 }}
                  </span>
                </span>

                <span class="entry-hint">{{ injectHint(item) }}</span>
              </button>

              <button
                class="switch"
                :class="{ on: item.enabled !== false }"
                :aria-label="item.enabled === false ? '启用这条' : '停用这条'"
                @click="worldbook.toggle(item.id)"
              >
                <span class="knob" />
              </button>
            </article>

            <p v-if="section.folder && !section.entries.length" class="folder-empty">
              文件夹是空的，点右边的 ＋ 往里加条目
            </p>
          </template>
        </template>

        <p v-if="!list.length && (!grouped || !scopeFolders.length)" class="empty">
          <span class="empty-glyph i-ph-books-fill" />
          <span>{{ keyword.trim() ? '没有匹配的条目' : '这里还没有条目，点右上「新建」' }}</span>
        </p>
        <p v-else-if="!list.length && keyword.trim()" class="empty">
          <span class="empty-glyph i-ph-magnifying-glass" />
          <span>没有匹配的条目</span>
        </p>
      </div>

      <p class="foot">
        命中关键词才注入，「必读」不看关键词。全局条目所有对话自动参与；局部条目要去微信聊天页「⋯ → 世界书」勾选。
        文件夹只是把列表分组，不影响会不会注入。
      </p>
    </template>


    <!-- ================= 编辑 ================= -->
    <template v-else>
      <div class="edit-head">
        <button class="icon-btn" aria-label="返回列表" @click="backToList">
          <span class="i-ph-caret-left" />
        </button>
        <span class="edit-title">编辑条目</span>
        <button class="icon-btn danger" aria-label="删除这条" @click="removeEditing">
          <span class="i-ph-trash" />
        </button>
      </div>

      <div class="edit-body">
        <label class="field">
          <span class="label">名称</span>
          <input v-model="editing.title" class="input" maxlength="30" placeholder="例如：世界基调" />
          <span class="hint">只给你自己看的备注，不会注入给模型。</span>
        </label>

        <div class="field">
          <span class="label">范围</span>
          <div class="seg">
            <button
              v-for="scope in WB_SCOPES"
              :key="scope.id"
              class="seg-btn"
              :class="{ on: editing.scope === scope.id }"
              @click="patch({ scope: scope.id })"
            >
              {{ scope.name }}
            </button>
          </div>
          <span class="hint">{{ scopeMeta.desc }}</span>
        </div>

        <div class="field">
          <span class="label">文件夹（只影响列表分组）</span>
          <div class="chips no-scrollbar">
            <button class="chip" :class="{ on: !editing.folderId }" @click="patch({ folderId: '' })">
              不进文件夹
            </button>
            <button
              v-for="folder in editingFolders"
              :key="folder.id"
              class="chip"
              :class="{ on: editing.folderId === folder.id }"
              @click="patch({ folderId: folder.id })"
            >
              {{ folder.name }}
            </button>
          </div>
          <span v-if="!editingFolders.length" class="hint">
            这个范围还没有文件夹，回列表点「新建文件夹」。
          </span>
          <span v-else class="hint">换范围会自动退出原文件夹；文件夹不影响会不会注入。</span>
        </div>

        <div class="field">
          <span class="label">注入位置</span>
          <div class="seg">
            <button
              v-for="position in WB_POSITIONS"
              :key="position.id"
              class="seg-btn"
              :class="{ on: editing.position === position.id }"
              @click="patch({ position: position.id })"
            >
              {{ position.short }}
              <span class="seg-sub">{{ position.name }}</span>
            </button>
          </div>
          <span class="hint">{{ positionMeta.desc }}</span>

          <div v-if="editing.position === 'after'" class="row">
            <span class="row-label">插入深度</span>
            <div class="stepper">
              <button aria-label="减少深度" @click="setDepth(editing.depth - 1)">−</button>
              <input
                class="stepper-input"
                type="number"
                :min="WB_DEPTH_MIN"
                :max="WB_DEPTH_MAX"
                :value="editing.depth"
                @change="setDepth($event.target.value)"
              />
              <button aria-label="增加深度" @click="setDepth(editing.depth + 1)">+</button>
            </div>
          </div>
          <span v-if="editing.position === 'after'" class="hint">
            1 = 紧贴你刚发的那句；数字越大插得越靠前（1~{{ WB_DEPTH_MAX }}）。
          </span>
        </div>

        <div class="field">
          <div class="row">
            <span class="row-label">必读（不看关键词，永远注入）</span>
            <button
              class="switch"
              :class="{ on: editing.constant }"
              :aria-pressed="editing.constant"
              aria-label="必读"
              @click="patch({ constant: !editing.constant })"
            >
              <span class="knob" />
            </button>
          </div>
          <span class="hint">
            世界观底线、绝对不能崩的设定就开它。每轮都带，会多吃一点 token。
          </span>
        </div>

        <div class="field">
          <span class="label">触发关键词</span>
          <span class="key-input">
            <input
              ref="keyEl"
              v-model="keyInput"
              class="input"
              placeholder="回车或逗号收词，可一次贴一串"
              @input="onKeyInput"
              @keydown.enter.prevent="addKey"
            />
            <button class="key-add" @click="addKey">添加</button>
          </span>

          <span v-if="editing.keys.length" class="keys editable">
            <button
              v-for="(key, index) in editing.keys"
              :key="key"
              class="key"
              @click="removeKey(index)"
            >
              {{ key }}
              <span class="i-ph-x" />
            </button>
          </span>
          <span v-else class="hint">还没有关键词，这条只有开启「必读」才会注入。</span>

          <div class="row">
            <span class="row-label">全部关键词都命中才触发</span>
            <button
              class="switch"
              :class="{ on: editing.requireAll }"
              :aria-pressed="editing.requireAll"
              aria-label="全部命中"
              @click="patch({ requireAll: !editing.requireAll })"
            >
              <span class="knob" />
            </button>
          </div>
          <span class="hint">
            关掉（默认）：出现任意一个词就注入。打开：每个词都得出现才注入。
          </span>
        </div>

        <label class="field">
          <span class="label">正文</span>
          <textarea
            v-model="editing.content"
            class="textarea"
            rows="6"
            placeholder="命中时这段文字会原样交给模型……"
          />
          <span class="hint">{{ editing.content.length }} 字 · 150 字以内最稳</span>
        </label>

        <div class="field">
          <div class="row">
            <span class="row-label">插入顺序（小的在前）</span>
            <input
              class="input num"
              type="number"
              :min="WB_ORDER_MIN"
              :max="WB_ORDER_MAX"
              :value="editing.order"
              @change="setOrder($event.target.value)"
            />
          </div>
          <span class="hint">同一个注入位置有多条时，按这个数字排队。</span>
        </div>

        <div class="edit-actions">
          <button class="btn ghost" @click="duplicateEditing">复制一条</button>
          <button class="btn" @click="backToList">完成</button>
        </div>
        <p class="foot">改动自动保存，不用找保存按钮。</p>
      </div>
    </template>

    <transition name="toast-fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>



<style scoped>
/* ============================================================
 * 世界书 · 外观
 * 全部尺寸走 --u（设计像素），无阴影，只有磨砂玻璃 + 细描边
 * ============================================================ */
.wb {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 12);
  padding: calc(var(--u) * 12) calc(var(--u) * 14) calc(var(--u) * 26);
}

/* ---------------- 顶部：搜索 + 新建 ---------------- */
.top {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  gap: calc(var(--u) * 8);
  padding-bottom: calc(var(--u) * 4);
  background: linear-gradient(
    180deg,
    rgba(255, 250, 252, 0.98) 62%,
    rgba(255, 250, 252, 0)
  );
}

.search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: calc(var(--u) * 6);
  height: calc(var(--u) * 32);
  padding: 0 calc(var(--u) * 10);
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.72);
}

.search-icon {
  flex: none;
  font-size: calc(var(--u) * 13);
  color: var(--c-text-faint);
}

.search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  font-size: calc(var(--u) * 11.5);
  color: var(--c-text);
}

.search-input::placeholder {
  color: var(--c-text-faint);
}

.search-clear {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 18);
  height: calc(var(--u) * 18);
  border-radius: 999px;
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
  background: rgba(124, 101, 112, 0.1);
}

.add {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 3);
  height: calc(var(--u) * 32);
  padding: 0 calc(var(--u) * 12);
  border-radius: 999px;
  font-size: calc(var(--u) * 11);
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

/* ---------------- 筛选胶囊 ---------------- */
.chips {
  display: flex;
  gap: calc(var(--u) * 6);
  margin: 0 calc(var(--u) * -2);
  padding: 0 calc(var(--u) * 2);
  overflow-x: auto;
}

.chip {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 3);
  padding: calc(var(--u) * 4) calc(var(--u) * 9);
  border-radius: 999px;
  font-size: calc(var(--u) * 10);
  color: var(--c-text-soft);
  background: rgba(247, 168, 190, 0.12);
  transition:
    color 0.16s ease,
    background 0.16s ease;
}

.chip.on {
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.chip-count {
  font-size: calc(var(--u) * 8.5);
  opacity: 0.72;
}

/* ---------------- 范围条 + 文件夹 ---------------- */
.scope-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--u) * 8);
  margin: 0 calc(var(--u) * 2);
}

.scope-hint {
  font-size: calc(var(--u) * 9.2);
  color: var(--c-text-faint);
}

.folder-add {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 3);
  padding: calc(var(--u) * 4) calc(var(--u) * 9);
  border-radius: 999px;
  font-size: calc(var(--u) * 10);
  color: #c07f93;
  background: rgba(247, 168, 190, 0.16);
}

/* 文件夹头：磨砂薄片，和条目卡片区分开 */
.folder-head {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 4);
  padding: calc(var(--u) * 6) calc(var(--u) * 7) calc(var(--u) * 6) calc(var(--u) * 9);
  border-radius: calc(var(--u) * 12);
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: rgba(247, 168, 190, 0.16);
}

.folder-head.plain {
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(124, 101, 112, 0.06);
}

/* 收起的文件夹：颜色再淡一点，表示里面的东西暂时不占地方 */
.folder-head.folded {
  background: rgba(247, 168, 190, 0.1);
}

.folder-main {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: calc(var(--u) * 5);
  text-align: left;
}

.folder-chevron {
  flex: none;
  font-size: calc(var(--u) * 11);
  color: var(--c-text-soft);
}

.folder-name {
  overflow: hidden;
  font-size: calc(var(--u) * 11.5);
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--c-text);
}

.folder-count {
  flex: none;
  padding: 0 calc(var(--u) * 6);
  border-radius: 999px;
  font-size: calc(var(--u) * 8.5);
  line-height: calc(var(--u) * 14);
  color: var(--c-text-soft);
  background: rgba(255, 255, 255, 0.72);
}

.folder-btn {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 22);
  height: calc(var(--u) * 22);
  border-radius: 999px;
  font-size: calc(var(--u) * 12);
  color: #c07f93;
  background: rgba(255, 255, 255, 0.85);
}

.folder-btn.on {
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

/* 改名 / 删除面板：虚线框，一看就是「临时展开的东西」 */
.folder-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 6);
  margin-top: calc(var(--u) * -4);
  padding: calc(var(--u) * 8) calc(var(--u) * 9);
  border-radius: calc(var(--u) * 12);
  border: 1px dashed rgba(226, 140, 166, 0.45);
  background: rgba(255, 255, 255, 0.72);
}

.folder-panel-row {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 8);
}

.folder-del {
  flex: none;
  padding: calc(var(--u) * 4) calc(var(--u) * 10);
  border-radius: 999px;
  border: 1px solid rgba(217, 138, 148, 0.4);
  font-size: calc(var(--u) * 9.5);
  color: #d98a94;
  background: rgba(255, 255, 255, 0.9);
}

.folder-empty {
  margin: 0;
  padding: calc(var(--u) * 6) 0 calc(var(--u) * 2) calc(var(--u) * 12);
  font-size: calc(var(--u) * 9.2);
  color: var(--c-text-faint);
}

/* ---------------- 条目卡片 ---------------- */
.list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 8);
}

.entry {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--u) * 6);
  padding: calc(var(--u) * 10) calc(var(--u) * 8) calc(var(--u) * 10) calc(var(--u) * 11);
  border-radius: calc(var(--u) * 15);
  border: 1px solid rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.74);
  transition: opacity 0.16s ease;
}

.entry.off {
  opacity: 0.52;
}

/* 装在文件夹里的条目往右缩一格，视觉上从属 */
.entry.in-folder {
  margin-left: calc(var(--u) * 12);
}

.entry-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: calc(var(--u) * 5);
  text-align: left;
}

.entry-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--u) * 5);
}

.entry-title {
  max-width: calc(var(--u) * 180);
  overflow: hidden;
  font-size: calc(var(--u) * 12.5);
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--c-text);
}

.tag {
  flex: none;
  padding: calc(var(--u) * 1) calc(var(--u) * 6);
  border-radius: 999px;
  font-size: calc(var(--u) * 8.5);
  line-height: 1.5;
}

.tag.global {
  color: #c07f93;
  background: rgba(247, 168, 190, 0.18);
}

.tag.local {
  color: #7a8fb0;
  background: rgba(150, 175, 210, 0.2);
}

.tag.required {
  color: #b98844;
  background: rgba(240, 200, 140, 0.26);
}

/* 「这条在哪个文件夹」：只在「全部 / 必读 / 已停用」这些平铺视图里出现 */
.tag.dir {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--u) * 2);
  max-width: calc(var(--u) * 110);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--c-text-soft);
  background: rgba(124, 101, 112, 0.08);
}

.entry-meta {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 4) calc(var(--u) * 8);
}

.meta {
  font-size: calc(var(--u) * 9);
  color: var(--c-text-faint);
}

/* 正文只露两行，看个大概就够，点进去再细看 */
.entry-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: calc(var(--u) * 10.5);
  line-height: 1.55;
  color: var(--c-text-soft);
}

.keys {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 4);
}

.key {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--u) * 3);
  max-width: calc(var(--u) * 120);
  padding: calc(var(--u) * 2) calc(var(--u) * 7);
  border-radius: 999px;
  font-size: calc(var(--u) * 9);
  color: #c07f93;
  background: rgba(247, 168, 190, 0.13);
}

.key.more {
  color: var(--c-text-faint);
  background: rgba(124, 101, 112, 0.08);
}

.keys.editable .key {
  background: rgba(247, 168, 190, 0.18);
}

.keys.editable .key:active {
  background: rgba(226, 140, 166, 0.32);
}

.key .i-ph-x {
  font-size: calc(var(--u) * 8.5);
  opacity: 0.7;
}

.entry-hint {
  font-size: calc(var(--u) * 9);
  color: var(--c-text-faint);
}

/* 空状态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--u) * 8);
  margin: 0;
  padding: calc(var(--u) * 44) 0;
  font-size: calc(var(--u) * 10.5);
  color: var(--c-text-faint);
}

.empty-glyph {
  font-size: calc(var(--u) * 26);
  opacity: 0.45;
}

.foot {
  margin: 0;
  padding: 0 calc(var(--u) * 4);
  font-size: calc(var(--u) * 9.2);
  line-height: 1.65;
  color: var(--c-text-faint);
}

/* ---------------- 开关（列表 / 编辑共用） ---------------- */
.switch {
  position: relative;
  flex: none;
  width: calc(var(--u) * 34);
  height: calc(var(--u) * 20);
  margin-top: calc(var(--u) * 2);
  border-radius: 999px;
  background: rgba(124, 101, 112, 0.16);
  transition: background 0.18s ease;
}

.switch.on {
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.knob {
  position: absolute;
  top: calc(var(--u) * 2);
  left: calc(var(--u) * 2);
  width: calc(var(--u) * 16);
  height: calc(var(--u) * 16);
  border-radius: 999px;
  background: #fff;
  transition: transform 0.18s ease;
}

.switch.on .knob {
  transform: translateX(calc(var(--u) * 14));
}

/* ---------------- 编辑页 ---------------- */
.edit-head {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 8);
  padding-bottom: calc(var(--u) * 6);
  margin: calc(var(--u) * -12) calc(var(--u) * -14) 0;
  padding: calc(var(--u) * 8) calc(var(--u) * 14) calc(var(--u) * 6);
  background: rgba(255, 250, 252, 0.94);
  backdrop-filter: blur(calc(var(--u) * 14));
  -webkit-backdrop-filter: blur(calc(var(--u) * 14));
  border-bottom: 1px solid rgba(124, 101, 112, 0.06);
}

.icon-btn {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 28);
  height: calc(var(--u) * 28);
  border-radius: 999px;
  font-size: calc(var(--u) * 15);
  color: var(--c-text);
  background: rgba(255, 255, 255, 0.7);
}

.icon-btn.danger {
  color: #d98a94;
}

.edit-title {
  flex: 1;
  text-align: center;
  font-size: calc(var(--u) * 13);
  font-weight: 600;
  color: var(--c-text);
}

.edit-body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 10);
}

.field {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 6);
  padding: calc(var(--u) * 10) calc(var(--u) * 11);
  border-radius: calc(var(--u) * 14);
  border: 1px solid rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.74);
}

.label {
  font-size: calc(var(--u) * 10);
  letter-spacing: calc(var(--u) * 0.3);
  color: var(--c-text-faint);
}

.hint {
  font-size: calc(var(--u) * 9.2);
  line-height: 1.55;
  color: var(--c-text-faint);
}

.input {
  width: 100%;
  height: calc(var(--u) * 32);
  padding: 0 calc(var(--u) * 10);
  border-radius: calc(var(--u) * 10);
  border: 1px solid rgba(247, 168, 190, 0.3);
  background: rgba(255, 249, 251, 0.92);
  outline: none;
  font-size: calc(var(--u) * 12);
  color: var(--c-text);
}

.input:focus {
  border-color: rgba(226, 140, 166, 0.7);
}

.input.num {
  flex: none;
  width: calc(var(--u) * 64);
  text-align: center;
}


/* 分段选择器：范围（2 档）/ 位置（3 档）共用 */
.seg {
  display: flex;
  gap: calc(var(--u) * 4);
  padding: calc(var(--u) * 3);
  border-radius: calc(var(--u) * 12);
  background: rgba(247, 168, 190, 0.1);
}

.seg-btn {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--u) * 1);
  padding: calc(var(--u) * 6) calc(var(--u) * 4);
  border-radius: calc(var(--u) * 9);
  font-size: calc(var(--u) * 11.5);
  color: var(--c-text-soft);
  transition:
    color 0.16s ease,
    background 0.16s ease;
}

.seg-btn.on {
  color: #fff;
  font-weight: 500;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.seg-sub {
  font-size: calc(var(--u) * 8.5);
  font-weight: 400;
  opacity: 0.78;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--u) * 8);
  min-height: calc(var(--u) * 26);
}

.row-label {
  font-size: calc(var(--u) * 11.5);
  line-height: 1.45;
  color: var(--c-text);
}

/* 数字步进器（插入深度） */
.stepper {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 2);
  padding: calc(var(--u) * 2);
  border-radius: 999px;
  border: 1px solid rgba(247, 168, 190, 0.3);
  background: rgba(255, 255, 255, 0.8);
}

.stepper button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 24);
  height: calc(var(--u) * 22);
  border-radius: calc(var(--u) * 8);
  font-size: calc(var(--u) * 13);
  color: #d8879f;
}

.stepper button:active {
  background: rgba(247, 168, 190, 0.22);
}

.stepper-input {
  width: calc(var(--u) * 32);
  border: 0;
  background: none;
  outline: none;
  text-align: center;
  font-size: calc(var(--u) * 12);
  color: var(--c-text);
  -moz-appearance: textfield;
  appearance: textfield;
}

.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

/* 关键词输入行 */
.key-input {
  display: flex;
  gap: calc(var(--u) * 6);
}

.key-input .input {
  flex: 1;
  min-width: 0;
}

.key-add {
  flex: none;
  height: calc(var(--u) * 32);
  padding: 0 calc(var(--u) * 12);
  border-radius: calc(var(--u) * 10);
  font-size: calc(var(--u) * 10.5);
  color: #c07f93;
  background: rgba(247, 168, 190, 0.2);
}

.textarea {
  width: 100%;
  min-height: calc(var(--u) * 76);
  padding: calc(var(--u) * 8) calc(var(--u) * 10);
  border-radius: calc(var(--u) * 10);
  border: 1px solid rgba(247, 168, 190, 0.3);
  background: rgba(255, 249, 251, 0.92);
  outline: none;
  font-size: calc(var(--u) * 11.5);
  line-height: 1.6;
  color: var(--c-text);
  resize: none;
}

.textarea:focus {
  border-color: rgba(226, 140, 166, 0.7);
}

.edit-actions {
  display: flex;
  gap: calc(var(--u) * 8);
  margin-top: calc(var(--u) * 2);
}

.btn {
  flex: 1;
  height: calc(var(--u) * 36);
  border-radius: 999px;
  font-size: calc(var(--u) * 12);
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.btn.ghost {
  flex: none;
  padding: 0 calc(var(--u) * 16);
  color: #c07f93;
  background: rgba(255, 255, 255, 0.8);
  border: 1px dashed rgba(226, 140, 166, 0.5);
}

/* ---------------- 轻提示 ---------------- */
/* 用 sticky 而不是 fixed：桌面预览里手机是被缩放/居中的，fixed 会跑到浏览器窗口底部 */
.toast {
  position: sticky;
  bottom: calc(var(--u) * 8);
  align-self: center;
  z-index: 20;
  padding: calc(var(--u) * 7) calc(var(--u) * 16);
  border-radius: 999px;
  font-size: calc(var(--u) * 11);
  color: #fff;
  background: rgba(124, 101, 112, 0.74);
  pointer-events: none;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
}
</style>

