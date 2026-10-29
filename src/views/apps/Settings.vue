<script setup>
/**
 * 设置
 * ------------------------------------------------------------
 * 壁纸 / 桌面 / 系统 / AI 接口 / 关于
 * AI 接口区：可保存多套配置（自定义名字、随时切换），每套含地址、密钥、模型、
 * 温度、max_tokens、自定义请求头，全部本地持久化 + 连通测试。
 */
import { computed, ref } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import { useAIConfigStore } from '@/stores/aiConfig'
import { AI_PRESETS } from '@/api/config'
import { WALLPAPERS } from '@/utils/wallpapers'
import { compressImage, newImageKey } from '@/utils/image'
import { putImage, clearAllStorage } from '@/utils/storage'

const desktop = useDesktopStore()
const ai = useAIConfigStore()
const fileInput = ref(null)
const toast = ref('')
/** API Key 默认打码，点眼睛才显示 */
const showKey = ref(false)
/** 模型列表：关键词过滤 + 面板是否展开 */
const modelKeyword = ref('')
const showModels = ref(false)

const settings = computed(() => desktop.settings)
const isImageWallpaper = computed(() => desktop.wallpaper?.type === 'image')
/** 按关键词过滤已拉到的模型列表（不区分大小写） */
const filteredModels = computed(() => {
  const keyword = modelKeyword.value.trim().toLowerCase()
  const list = ai.modelOptions
  if (!keyword) return list
  return list.filter((name) => name.toLowerCase().includes(keyword))
})

function flash(text) {
  toast.value = text
  setTimeout(() => (toast.value = ''), 1600)
}

function pickGradient(id) {
  desktop.setWallpaper({ type: 'gradient', value: id, imageKey: null })
}

async function onWallpaperFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const blob = await compressImage(file, { max: 1600, quality: 0.86 })
    const key = newImageKey()
    await putImage(key, blob)
    desktop.setWallpaper({ type: 'image', imageKey: key })
    flash('壁纸已更新')
  } catch (err) {
    console.warn('[settings] 壁纸保存失败', err)
    flash('图片保存失败')
  }
}

function toggle(key) {
  desktop.setSetting(key, !settings.value[key])
}

function resetLayout() {
  if (!confirm('恢复默认桌面布局？图标位置和小组件内容都会重置。')) return
  desktop.resetLayout()
  flash('已恢复默认布局')
}

async function clearAll() {
  if (!confirm('清除全部本地数据（布局、图片、AI 配置、后续的对话记录）？此操作不可撤销。')) return
  await clearAllStorage()
  desktop.resetLayout()
  ai.resetAll()
  flash('已清除')
}

/** 连通测试 */
async function runTest() {
  if (ai.testing) return
  const result = await ai.runTest()
  flash(result?.ok ? '接口连通' : '连接失败')
}

/** 拉取模型列表（GET {BaseURL}/models），拉到就展开列表让用户挑 */
async function pullModels() {
  if (ai.modelsLoading) return
  const result = await ai.loadModels()
  flash(result?.message || '拉取失败')
  if (result?.ok) {
    modelKeyword.value = ''
    showModels.value = true
  } else {
    showModels.value = false
  }
}

/** 点列表里的模型名 → 填进模型名输入框并收起列表 */
function pickModel(name) {
  ai.setModel(name)
  showModels.value = false
  modelKeyword.value = ''
  flash(`已选 ${name}`)
}

/** 新建一套配置（自动复制当前参数，改完就是独立的一套） */
function addProfile() {
  if (!ai.canAddProfile) {
    flash('配置已达上限，先删掉一套再新建')
    return
  }
  const profile = ai.createProfile()
  if (profile) flash(`已新建「${profile.name}」`)
}

/** 删除当前这套配置 */
function removeProfile() {
  const name = ai.config?.name || '未命名'
  const last = ai.profiles.length <= 1
  const tip = last ? '这是最后一条，删除后会留下一条空白配置。' : ''
  if (!confirm(`删除配置「${name}」？${tip}`)) return
  ai.removeProfile(ai.activeId)
  flash('配置已删除')
}

/** 清空当前配置的内容（名字保留） */
function resetAI() {
  if (!confirm('清空当前配置里填的地址和密钥？（名字会保留）')) return
  ai.reset()
  flash('当前配置已清空')
}
</script>

<template>
  <div class="settings">
    <section class="section">
      <h3 class="section-title">壁纸</h3>
      <div class="wallpapers">
        <button
          v-for="item in WALLPAPERS"
          :key="item.id"
          class="wp"
          :class="{ active: !isImageWallpaper && desktop.wallpaper?.value === item.id }"
          :style="{ backgroundImage: item.css }"
          @click="pickGradient(item.id)"
        >
          <span class="wp-name">{{ item.name }}</span>
        </button>
        <button class="wp upload" :class="{ active: isImageWallpaper }" @click="fileInput?.click()">
          <span class="i-ph-image-square upload-icon" />
          <span class="wp-name">上传图片</span>
        </button>
      </div>
      <input
        ref="fileInput"
        class="hidden"
        type="file"
        accept="image/*"
        @change="onWallpaperFile"
      />
    </section>

    <section class="section">
      <h3 class="section-title">桌面</h3>
      <div class="card">
        <button class="row" @click="toggle('showLabels')">
          <span class="row-label">显示图标名称</span>
          <span class="switch" :class="{ on: settings.showLabels }"><span class="knob" /></span>
        </button>
        <button class="row" @click="toggle('animation')">
          <span class="row-label">桌面动效</span>
          <span class="switch" :class="{ on: settings.animation }"><span class="knob" /></span>
        </button>
        <button class="row" @click="toggle('haptics')">
          <span class="row-label">长按震动反馈</span>
          <span class="switch" :class="{ on: settings.haptics }"><span class="knob" /></span>
        </button>
        <button class="row" @click="toggle('statusBar')">
          <span class="row-label">显示状态栏</span>
          <span class="switch" :class="{ on: settings.statusBar }"><span class="knob" /></span>
        </button>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">系统</h3>
      <div class="card">
        <button class="row" @click="resetLayout">
          <span class="row-label">恢复默认布局</span>
          <span class="i-ph-arrow-counter-clockwise row-arrow" />
        </button>
        <button class="row danger" @click="clearAll">
          <span class="row-label">清除全部数据</span>
          <span class="i-ph-trash row-arrow" />
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h3 class="section-title">AI 接口</h3>
        <span class="chip" :class="{ ready: ai.isConfigured }">
          {{ ai.isConfigured ? '已配置' : '未配置' }}
        </span>
      </div>

      <div class="card ai">
        <div class="profiles-wrap">
          <div class="profiles">
            <div class="profiles-list">
              <button
                v-for="profile in ai.profiles"
                :key="profile.id"
                class="profile"
                :class="{
                  active: profile.id === ai.activeId,
                  ready: Boolean(profile.baseUrl && profile.model),
                }"
                @click="ai.selectProfile(profile.id)"
              >
                {{ profile.name || '未命名' }}
              </button>
            </div>
            <button class="profile-add" @click="addProfile">
              <span class="i-ph-plus" />
              新建
            </button>
          </div>
          <p class="profiles-hint">
            改动会自动存进当前配置；点上面任意一条就能切换，不用重复填地址和密钥。
          </p>
        </div>

        <label class="row static">
          <span class="row-label">配置名称</span>
          <input
            :value="ai.config.name"
            class="input input-name"
            maxlength="24"
            placeholder="例如 我的中转"
            spellcheck="false"
            autocomplete="off"
            @input="ai.renameProfile(ai.activeId, $event.target.value)"
            @blur="ai.ensureName()"
          />
        </label>

        <div class="presets">
          <button
            v-for="preset in AI_PRESETS"
            :key="preset.id"
            class="preset"
            :class="{ active: preset.baseUrl && ai.config.baseUrl === preset.baseUrl }"
            @click="ai.applyPreset(preset.id)"
          >
            {{ preset.name }}
          </button>
        </div>

        <label class="field">
          <span class="field-label">接口地址 BaseURL</span>
          <input
            v-model.trim="ai.config.baseUrl"
            class="input"
            type="url"
            inputmode="url"
            placeholder="https://api.deepseek.com/v1"
            spellcheck="false"
            autocomplete="off"
          />
          <span class="field-hint">只填域名会自动补 /v1，末尾的 /chat/completions 可省略</span>
        </label>

        <label class="field">
          <span class="field-label">API Key</span>
          <span class="input-row">
            <input
              v-model.trim="ai.config.apiKey"
              class="input"
              :type="showKey ? 'text' : 'password'"
              placeholder="sk-……（本地服务可留空）"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
            />
            <button
              class="input-eye"
              type="button"
              :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
              @click.prevent="showKey = !showKey"
            >
              <span :class="showKey ? 'i-ph-eye-slash' : 'i-ph-eye'" />
            </button>
          </span>
        </label>

        <div class="field">
          <div class="field-head">
            <span class="field-label">模型名 Model</span>
            <button
              class="link-btn"
              type="button"
              :disabled="ai.modelsLoading || !ai.config.baseUrl"
              @click="pullModels"
            >
              <span v-if="ai.modelsLoading" class="i-ph-spinner-gap animate-spin" />
              <span v-else class="i-ph-cloud-arrow-down" />
              {{ ai.modelsLoading ? '拉取中…' : '拉取模型' }}
            </button>
          </div>
          <div class="input-row">
            <input
              v-model.trim="ai.config.model"
              class="input"
              placeholder="deepseek-chat"
              spellcheck="false"
              autocomplete="off"
            />
            <button
              v-if="ai.modelOptions.length"
              class="input-eye"
              type="button"
              :aria-label="showModels ? '收起模型列表' : '展开模型列表'"
              @click="showModels = !showModels"
            >
              <span v-if="showModels" class="i-ph-caret-up" />
              <span v-else class="i-ph-caret-down" />
            </button>
          </div>

          <span v-if="ai.modelsError" class="field-hint warn">{{ ai.modelsError }}</span>
          <span v-else-if="ai.modelOptions.length" class="field-hint">
            已拉到 {{ ai.modelOptions.length }} 个模型，点右边箭头挑一个，也可以直接手填。
          </span>
          <span v-else class="field-hint">
            填好地址和 Key 后点「拉取模型」，就不用背模型名了；接口不支持时手动填写即可。
          </span>

          <div v-if="showModels && ai.modelOptions.length" class="model-panel">
            <label class="model-search">
              <span class="i-ph-magnifying-glass" />
              <input v-model="modelKeyword" placeholder="搜模型名" spellcheck="false" />
              <button
                v-if="modelKeyword"
                class="model-clear"
                type="button"
                aria-label="清空搜索"
                @click="modelKeyword = ''"
              >
                <span class="i-ph-x" />
              </button>
            </label>
            <div class="model-list">
              <button
                v-for="name in filteredModels"
                :key="name"
                class="model-item"
                :class="{ active: name === ai.config.model }"
                @click="pickModel(name)"
              >
                {{ name }}
              </button>
              <p v-if="!filteredModels.length" class="model-empty">没有匹配的模型</p>
            </div>
          </div>
        </div>

        <label class="row static">
          <span class="row-label">temperature 随机度</span>
          <input
            v-model.number="ai.config.temperature"
            class="input input-num"
            type="number"
            min="0"
            max="2"
            step="0.1"
          />
        </label>

        <label class="row static">
          <span class="row-label">max_tokens 最大长度</span>
          <input
            v-model.number="ai.config.maxTokens"
            class="input input-num"
            type="number"
            min="1"
            max="32000"
            step="128"
          />
        </label>

        <button class="row" @click="ai.config.stream = !ai.config.stream">
          <span class="row-label">流式输出（SSE）</span>
          <span class="switch" :class="{ on: ai.config.stream }"><span class="knob" /></span>
        </button>

        <label class="field">
          <span class="field-label">自定义请求头（每行一条 Key: Value）</span>
          <textarea
            v-model="ai.config.customHeaders"
            class="input textarea"
            rows="3"
            placeholder="HTTP-Referer: https://your.site&#10;X-Title: vphone"
            spellcheck="false"
          />
          <span v-if="ai.headerPairs.length" class="field-hint">
            已识别 {{ ai.headerPairs.length }} 条：{{ ai.headerPairs.map((p) => p[0]).join('、') }}
          </span>
        </label>

        <div class="actions">
          <button class="btn-test" :disabled="ai.testing" @click="runTest">
            {{ ai.testing ? '测试中…' : '连通测试' }}
          </button>
          <button class="btn-ghost" @click="resetAI">清空</button>
          <button class="btn-ghost danger" @click="removeProfile">删除</button>
        </div>

        <p v-if="ai.testResult" class="result" :class="ai.testResult.ok ? 'ok' : 'bad'">
          <span class="result-main">{{ ai.testResult.message }}</span>
          <span v-if="ai.testResult.reply" class="result-detail">
            回复：{{ ai.testResult.reply }}
          </span>
          <span v-if="!ai.testResult.ok && ai.testResult.detail" class="result-detail">
            {{ ai.testResult.detail }}
          </span>
        </p>
        <p v-else class="tip">
          参数只保存在本机浏览器，不会上传；浏览器直连若被跨域（CORS）拦截，请改用支持 CORS
          的中转地址。
        </p>
      </div>
    </section>

    <p class="version">小手机 v0.1.0 · 桌面即首页</p>

    <transition name="toast-fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.settings {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 18);
  padding: calc(var(--u) * 16) calc(var(--u) * 16) calc(var(--u) * 28);
}

.section {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 8);
}

.section-title {
  margin: 0;
  padding-left: calc(var(--u) * 4);
  font-size: calc(var(--u) * 11);
  font-weight: 500;
  letter-spacing: calc(var(--u) * 0.8);
  color: var(--c-text-faint);
}

/* 标题 + 右侧状态胶囊 */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: calc(var(--u) * 4);
}

/* ---------------- 已保存的配置（多套，随时切换） ---------------- */
.profiles-wrap {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 6);
  padding: calc(var(--u) * 10) calc(var(--u) * 12);
}

.profiles {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 6);
}

/* 横向滚动，配置多了也不换行挤压 */
.profiles-list {
  display: flex;
  flex: 1;
  gap: calc(var(--u) * 6);
  overflow-x: auto;
  scrollbar-width: none;
}

.profiles-list::-webkit-scrollbar {
  display: none;
}

.profile {
  flex: none;
  max-width: calc(var(--u) * 124);
  padding: calc(var(--u) * 5) calc(var(--u) * 10);
  border-radius: 999px;
  font-size: calc(var(--u) * 10.5);
  color: var(--c-text-soft);
  background: rgba(247, 168, 190, 0.12);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    color 0.16s ease,
    background 0.16s ease;
}

/* 填了地址和模型的配置前面点个小绿点，一眼看出哪条能用 */
.profile.ready::before {
  content: '';
  display: inline-block;
  width: calc(var(--u) * 4);
  height: calc(var(--u) * 4);
  margin-right: calc(var(--u) * 5);
  border-radius: 999px;
  background: #7fbf9e;
  vertical-align: middle;
}

.profile.active {
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.profile.active::before {
  background: rgba(255, 255, 255, 0.92);
}

.profile-add {
  display: flex;
  flex: none;
  align-items: center;
  gap: calc(var(--u) * 3);
  padding: calc(var(--u) * 5) calc(var(--u) * 9);
  border-radius: 999px;
  border: 1px dashed rgba(226, 140, 166, 0.55);
  font-size: calc(var(--u) * 10.5);
  color: #d8879f;
  background: rgba(255, 255, 255, 0.5);
}

.profiles-hint {
  margin: 0;
  font-size: calc(var(--u) * 9);
  line-height: 1.45;
  color: var(--c-text-faint);
}

/* ---------------- AI 接口 ---------------- */
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 6);
  padding: calc(var(--u) * 10) calc(var(--u) * 12);
}

.preset {
  padding: calc(var(--u) * 5) calc(var(--u) * 10);
  border-radius: 999px;
  font-size: calc(var(--u) * 10.5);
  color: var(--c-text-soft);
  background: rgba(247, 168, 190, 0.12);
  transition:
    color 0.16s ease,
    background 0.16s ease;
}

.preset.active {
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.field {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 5);
  padding: calc(var(--u) * 10) calc(var(--u) * 12);
}

.field-label {
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
}

.field-hint {
  font-size: calc(var(--u) * 9);
  line-height: 1.4;
  color: var(--c-text-faint);
}

.field-hint.warn {
  color: #c9738a;
}

/* 字段标题右侧的小按钮（「拉取模型」） */
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--u) * 8);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--u) * 4);
  font-size: calc(var(--u) * 10);
  color: #c9738a;
  transition: opacity 0.16s ease;
}

.link-btn:disabled {
  opacity: 0.42;
}

/* 拉取到的模型列表：搜索条 + 可滚动的胶囊列表 */
.model-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 7);
  margin-top: calc(var(--u) * 2);
  padding: calc(var(--u) * 8);
  border: 1px solid rgba(247, 168, 190, 0.28);
  border-radius: calc(var(--u) * 12);
  background: rgba(255, 249, 251, 0.92);
}

.model-search {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 5);
  height: calc(var(--u) * 28);
  padding: 0 calc(var(--u) * 9);
  border-radius: 999px;
  font-size: calc(var(--u) * 11);
  color: var(--c-text-faint);
  background: rgba(247, 168, 190, 0.12);
}

.model-search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: none;
  font-size: calc(var(--u) * 11);
  color: var(--c-text);
}

.model-search input::placeholder {
  color: var(--c-text-faint);
}

.model-clear {
  display: flex;
  flex: none;
  align-items: center;
  font-size: calc(var(--u) * 11);
  color: var(--c-text-faint);
}

.model-list {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 5);
  max-height: calc(var(--u) * 190);
  padding: calc(var(--u) * 1) 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.model-item {
  max-width: 100%;
  padding: calc(var(--u) * 4) calc(var(--u) * 9);
  border-radius: 999px;
  font-size: calc(var(--u) * 10.5);
  line-height: 1.4;
  text-align: left;
  color: var(--c-text-soft);
  background: rgba(247, 168, 190, 0.12);
  word-break: break-all;
  transition:
    color 0.16s ease,
    background 0.16s ease;
}

.model-item.active {
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
}

.model-empty {
  width: 100%;
  padding: calc(var(--u) * 6) 0;
  text-align: center;
  font-size: calc(var(--u) * 10.5);
  color: var(--c-text-faint);
}

.input {
  width: 100%;
  height: calc(var(--u) * 34);
  padding: 0 calc(var(--u) * 10);
  border-radius: calc(var(--u) * 11);
  border: 1px solid rgba(247, 168, 190, 0.3);
  background: rgba(255, 249, 251, 0.9);
  outline: none;
  font-size: calc(var(--u) * 12);
  color: var(--c-text);
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}

.input:focus {
  border-color: rgba(226, 140, 166, 0.62);
  background: #fff;
}

.input::placeholder {
  color: var(--c-text-faint);
}

.input-row {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 6);
}

.input-eye {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 34);
  height: calc(var(--u) * 34);
  border-radius: calc(var(--u) * 11);
  font-size: calc(var(--u) * 15);
  color: var(--c-text-faint);
  background: rgba(247, 168, 190, 0.12);
}

.input-num {
  flex: none;
  width: calc(var(--u) * 68);
  height: calc(var(--u) * 30);
  text-align: right;
}

/* 配置名称输入框：放在 .input 之后，宽度才不会被 100% 顶掉 */
.input-name {
  flex: none;
  width: calc(var(--u) * 150);
  height: calc(var(--u) * 30);
}

.textarea {
  height: auto;
  min-height: calc(var(--u) * 62);
  padding: calc(var(--u) * 8) calc(var(--u) * 10);
  line-height: 1.5;
  font-size: calc(var(--u) * 11);
  resize: none;
}

.actions {
  display: flex;
  gap: calc(var(--u) * 8);
  padding: calc(var(--u) * 10) calc(var(--u) * 12);
}

.btn-test {
  flex: 1;
  height: calc(var(--u) * 34);
  border-radius: 999px;
  font-size: calc(var(--u) * 12);
  color: #fff;
  background: linear-gradient(135deg, #f7b8c9, #e28ca6);
  transition: opacity 0.16s ease;
}

.btn-test:disabled {
  opacity: 0.66;
}

.btn-ghost {
  height: calc(var(--u) * 34);
  padding: 0 calc(var(--u) * 14);
  border-radius: 999px;
  font-size: calc(var(--u) * 12);
  color: var(--c-text-soft);
  background: rgba(247, 168, 190, 0.12);
}

.btn-ghost.danger {
  color: #c9738a;
  background: rgba(226, 140, 166, 0.16);
}

.result,
.tip {
  margin: 0 calc(var(--u) * 12) calc(var(--u) * 12);
  padding: calc(var(--u) * 8) calc(var(--u) * 10);
  border-radius: calc(var(--u) * 12);
  font-size: calc(var(--u) * 10.5);
  line-height: 1.55;
  word-break: break-word;
}

.result.ok {
  color: #4c8a6a;
  background: rgba(120, 190, 150, 0.14);
}

.result.bad {
  color: #c9738a;
  background: rgba(226, 140, 166, 0.16);
}

.result-main {
  display: block;
}

.result-detail {
  display: block;
  margin-top: calc(var(--u) * 2);
  opacity: 0.72;
  word-break: break-all;
}

.tip {
  color: var(--c-text-faint);
  background: rgba(247, 168, 190, 0.08);
}

/* AI 卡片里每一项之间都用同一种极淡分隔线 */
.card.ai > * + * {
  border-top: 1px solid rgba(124, 101, 112, 0.07);
}

.wallpapers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: calc(var(--u) * 8);
}

.wp {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  aspect-ratio: 9 / 16;
  padding-bottom: calc(var(--u) * 6);
  border-radius: calc(var(--u) * 14);
  border: 1px solid rgba(255, 255, 255, 0.7);
  background-color: #ffe9f1;
  background-size: cover;
  overflow: hidden;
}

.wp.active {
  outline: calc(var(--u) * 1.6) solid var(--c-accent);
  outline-offset: calc(var(--u) * 1);
}

.wp-name {
  font-size: calc(var(--u) * 9);
  color: rgba(124, 101, 112, 0.75);
}

.wp.upload {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--u) * 4);
  background: rgba(255, 255, 255, 0.7);
}

.upload-icon {
  font-size: calc(var(--u) * 18);
  color: var(--c-text-faint);
}

.card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: calc(var(--u) * 18);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--u) * 10);
  width: 100%;
  height: calc(var(--u) * 44);
  padding: 0 calc(var(--u) * 14);
  font-size: calc(var(--u) * 12);
  color: var(--c-text);
  text-align: left;
}

.row + .row {
  border-top: 1px solid rgba(124, 101, 112, 0.07);
}

.row:not(.static):active {
  background: rgba(247, 168, 190, 0.1);
}

.row-label {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row-arrow {
  font-size: calc(var(--u) * 13);
  color: var(--c-text-faint);
}

.row.danger .row-label {
  color: #c9738a;
}

.switch {
  position: relative;
  flex: none;
  width: calc(var(--u) * 36);
  height: calc(var(--u) * 21);
  border-radius: 999px;
  background: rgba(124, 101, 112, 0.18);
  transition: background 0.2s ease;
}

.switch.on {
  background: var(--c-accent);
}

.knob {
  position: absolute;
  top: calc(var(--u) * 2.5);
  left: calc(var(--u) * 2.5);
  width: calc(var(--u) * 16);
  height: calc(var(--u) * 16);
  border-radius: 999px;
  background: #fff;
  transition: transform 0.2s ease;
}

.switch.on .knob {
  transform: translateX(calc(var(--u) * 15));
}

.chip {
  flex: none;
  padding: calc(var(--u) * 3) calc(var(--u) * 9);
  border-radius: 999px;
  font-size: calc(var(--u) * 9.5);
  color: var(--c-text-faint);
  background: rgba(247, 168, 190, 0.14);
}

/* 已配置：绿色比粉色更能一眼看出「能用」 */
.chip.ready {
  color: #4c8a6a;
  background: rgba(120, 190, 150, 0.18);
}

.version {
  margin: 0;
  text-align: center;
  font-size: calc(var(--u) * 10);
  color: var(--c-text-faint);
}

.toast {
  position: absolute;
  bottom: calc(var(--u) * 16);
  left: 50%;
  transform: translateX(-50%);
  padding: calc(var(--u) * 7) calc(var(--u) * 16);
  border-radius: 999px;
  font-size: calc(var(--u) * 11);
  color: #fff;
  background: rgba(124, 101, 112, 0.72);
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

.hidden {
  display: none;
}
</style>

