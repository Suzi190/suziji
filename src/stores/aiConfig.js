/**
 * AI 接口配置仓库（支持保存多套配置，随用随切）
 * ------------------------------------------------------------
 * 做四件事：
 * 1. 管理配置列表：每条都有自定义名字，可新建 / 改名 / 删除 / 切换
 * 2. 当前配置的读写（localStorage 持久化，刷新不丢；旧版单套配置自动迁移）
 * 3. 暴露 endpoint / 请求头等派生信息，给界面回显
 * 4. 跑连通测试，把结果收成 { ok, message, ... } 直接能给 UI 用
 *
 * 业务层的对话请求请直接用 @/api/openaiStream 的 chat()，把 ai.config 传进去：
 *   chat({ config: ai.config, messages, onDelta })
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { loadJSON, saveJSON } from '@/utils/storage'
import {
  AI_MAX_PROFILES,
  AI_NAME_MAX,
  AI_PRESETS,
  AI_STORAGE_KEY,
  AI_STORAGE_KEY_LEGACY,
  buildEndpoint,
  isBlankConfig,
  makeProfileId,
  normalizeConfig,
  normalizeProfile,
  parseCustomHeaders,
} from '@/api/config'
import { describeError, listModels, testConnection } from '@/api/openaiStream'

/** 生成一个没被占用的默认名：配置 1 / 配置 2 …… */
function defaultName(existing) {
  const names = new Set(existing.map((item) => item.name))
  let index = existing.length + 1
  while (names.has(`配置 ${index}`)) index += 1
  return `配置 ${index}`
}

/** 读存档：优先新版多配置，旧版单配置自动迁移成第一套 */
function loadState() {
  const saved = loadJSON(AI_STORAGE_KEY, null)
  const list = Array.isArray(saved?.profiles)
    ? saved.profiles.filter((item) => item && typeof item === 'object')
    : []

  if (list.length) {
    const profiles = list
      .slice(0, AI_MAX_PROFILES)
      .map((item, index) => normalizeProfile(item, `配置 ${index + 1}`))
    // id 重复（手改存档之类）时重新发号，否则切换会失灵
    const seen = new Set()
    for (const profile of profiles) {
      while (seen.has(profile.id)) profile.id = makeProfileId()
      seen.add(profile.id)
    }
    const activeId = profiles.some((item) => item.id === saved?.activeId)
      ? saved.activeId
      : profiles[0].id
    return { profiles, activeId }
  }

  // 没有新存档：把上一版「单套配置」接过来，用户不用重新填
  const legacy = normalizeConfig(loadJSON(AI_STORAGE_KEY_LEGACY, null))
  const migrated = !isBlankConfig(legacy)
  const profile = migrated
    ? { id: makeProfileId(), name: '默认配置', ...legacy }
    : { id: makeProfileId(), name: '配置 1', ...normalizeConfig(null) }
  if (migrated) {
    try {
      localStorage.removeItem(AI_STORAGE_KEY_LEGACY)
    } catch {
      /* 存不了也不影响使用 */
    }
  }
  return { profiles: [profile], activeId: profile.id }
}

export const useAIConfigStore = defineStore('aiConfig', () => {
  // ---------------- state ----------------
  const initial = loadState()
  /** 已保存的配置列表，每条 = { id, name, baseUrl, apiKey, ... } */
  const profiles = ref(initial.profiles)
  /** 当前正在使用 / 编辑的配置 id */
  const activeId = ref(initial.activeId)
  /** 正在测试中，界面据此禁用按钮 */
  const testing = ref(false)
  /** { ok, message, reply?, detail?, elapsed? } */
  const testResult = ref(null)
  /** 每套配置各自缓存的模型列表（只在内存里，刷新后重拉；避免切换配置时串台） */
  const modelsMap = ref({})
  /** 正在拉取模型列表，界面据此禁用按钮 */
  const modelsLoading = ref(false)
  /** 上次拉取模型失败的原因（空字符串＝没出错） */
  const modelsError = ref('')

  // ---------------- getters ----------------
  /** 当前配置本体（就是 profiles 里的那条，可直接改字段，改动会自动保存） */
  const config = computed(
    () => profiles.value.find((item) => item.id === activeId.value) || profiles.value[0],
  )
  /** 地址 + 模型都填了才算「已配置」（本地模型不需要 Key） */
  const isConfigured = computed(
    () => Boolean(config.value?.baseUrl?.trim()) && Boolean(config.value?.model?.trim()),
  )
  /** 还能不能再加（localStorage 有限额，手机上也不希望堆成一片） */
  const canAddProfile = computed(() => profiles.value.length < AI_MAX_PROFILES)
  /** 实际请求地址，界面上回显，方便用户核对 */
  const endpoint = computed(() => buildEndpoint(config.value?.baseUrl || ''))
  /** 自定义请求头解析结果，界面上展示条数 */
  const headerPairs = computed(() =>
    Object.entries(parseCustomHeaders(config.value?.customHeaders || '')),
  )
  /** 当前配置已拉到的模型列表（没拉过就是空数组） */
  const modelOptions = computed(() => modelsMap.value[activeId.value] || [])

  // ---------------- 持久化 ----------------
  let saveTimer = null
  watch(
    [profiles, activeId],
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(
        () => saveJSON(AI_STORAGE_KEY, { activeId: activeId.value, profiles: profiles.value }),
        250,
      )
    },
    { deep: true, immediate: true },
  )

  // 地址 / 密钥 / 请求头被直接改（输入框是 v-model 直改，不走 update）时，
  // 之前拉的模型列表也要作废，免得挑到别的站才有的模型名
  watch(
    () =>
      [
        config.value?.id,
        config.value?.baseUrl,
        config.value?.apiKey,
        config.value?.customHeaders,
      ],
    (next, prev) => {
      if (!next?.[0] || !prev?.[0]) return
      if (next[0] !== prev[0]) {
        modelsError.value = ''
        return
      }
      if (next.slice(1).join('|') !== prev.slice(1).join('|')) clearModels(next[0])
    },
  )

  // ---------------- actions ----------------
  /** 丢掉某套配置缓存的模型列表（换地址 / 密钥后旧列表不可信） */
  function clearModels(id = activeId.value) {
    modelsError.value = ''
    if (!modelsMap.value[id]) return
    const next = { ...modelsMap.value }
    delete next[id]
    modelsMap.value = next
  }

  /** 切换要用哪套配置（对话请求立刻改走它） */
  function selectProfile(id) {
    if (id === activeId.value) return
    if (!profiles.value.some((item) => item.id === id)) return
    activeId.value = id
    testResult.value = null
    modelsError.value = ''
  }

  /**
   * 新建一套配置：默认复制当前这套的参数（通常只想换个地址/密钥），
   * 比从零填快得多，改好名字就是一套独立配置
   */
  function createProfile(name) {
    if (!canAddProfile.value) return null
    const profile = {
      id: makeProfileId(),
      name: String(name || '').slice(0, AI_NAME_MAX).trim() || defaultName(profiles.value),
      ...normalizeConfig(config.value),
    }
    profiles.value.push(profile)
    activeId.value = profile.id
    testResult.value = null
    return profile
  }

  /** 改名：允许暂时为空（输入中途），离开输入框时由 ensureName 补默认名 */
  function renameProfile(id, name) {
    const target = profiles.value.find((item) => item.id === id)
    if (!target) return
    target.name = String(name ?? '').slice(0, AI_NAME_MAX)
  }

  /** 名字留空时补一个默认名，并去掉首尾空格 */
  function ensureName(id = activeId.value) {
    const target = profiles.value.find((item) => item.id === id)
    if (!target) return
    const clean = target.name.trim()
    target.name = clean || defaultName(profiles.value.filter((item) => item.id !== target.id))
  }

  /** 删除一套配置；删到最后一条时留一条空白配置，界面永远有东西可编辑 */
  function removeProfile(id) {
    const index = profiles.value.findIndex((item) => item.id === id)
    if (index < 0) return
    profiles.value.splice(index, 1)
    clearModels(id)
    if (!profiles.value.length) {
      profiles.value.push({ id: makeProfileId(), name: '配置 1', ...normalizeConfig(null) })
    }
    if (!profiles.value.some((item) => item.id === activeId.value)) {
      activeId.value = profiles.value[Math.min(index, profiles.value.length - 1)].id
    }
    testResult.value = null
  }

  /** 局部更新当前配置（会先归一化，脏值进不来） */
  function update(patch) {
    const target = config.value
    if (!target) return
    const before = `${target.baseUrl}|${target.apiKey}|${target.customHeaders}`
    Object.assign(target, normalizeConfig({ ...target, ...patch }))
    const after = `${target.baseUrl}|${target.apiKey}|${target.customHeaders}`
    // 地址 / 密钥 / 请求头变了，之前拉的模型列表就不作数了
    if (before !== after) clearModels(target.id)
    testResult.value = null
  }

  /** 选中一个模型（顺便清掉上一次的测试结果） */
  function setModel(name) {
    if (!config.value) return
    config.value.model = String(name ?? '').trim()
    testResult.value = null
  }

  /** 套用服务商预设：只覆盖地址和模型，密钥/温度等保持不变 */
  function applyPreset(id) {
    const preset = AI_PRESETS.find((item) => item.id === id)
    if (!preset) return
    update({
      baseUrl: preset.baseUrl || config.value.baseUrl,
      model: preset.model || config.value.model,
    })
  }

  /** 清空当前这套配置的内容（名字保留，方便直接重填） */
  function reset() {
    const target = config.value
    if (!target) return
    Object.assign(target, normalizeConfig(null))
    clearModels(target.id)
    testResult.value = null
  }

  /** 清空所有配置，只留一条空白（设置页「清除全部数据」用） */
  function resetAll() {
    profiles.value = [{ id: makeProfileId(), name: '配置 1', ...normalizeConfig(null) }]
    activeId.value = profiles.value[0].id
    modelsMap.value = {}
    modelsError.value = ''
    testResult.value = null
  }

  /**
   * 拉取模型列表（GET {BaseURL}/models）
   * 永不抛错，结果收成 { ok, count, message } 直接给界面；列表按配置 id 缓存
   */
  async function loadModels() {
    const target = config.value
    if (!target) return { ok: false, count: 0, message: '当前没有可用的配置' }
    if (modelsLoading.value) return { ok: false, count: 0, message: '正在拉取，请稍候' }
    if (!String(target.baseUrl || '').trim()) {
      modelsError.value = '先填接口地址 BaseURL，才能拉取模型列表'
      return { ok: false, count: 0, message: modelsError.value }
    }

    modelsLoading.value = true
    modelsError.value = ''
    const id = target.id
    try {
      const list = await listModels(target)
      modelsMap.value = { ...modelsMap.value, [id]: list }
      if (!list.length) {
        modelsError.value = '接口没返回任何模型，请手动填写模型名'
        return { ok: false, count: 0, message: modelsError.value }
      }
      return { ok: true, count: list.length, message: `已拉到 ${list.length} 个模型` }
    } catch (err) {
      modelsError.value = describeError(err)
      return { ok: false, count: 0, message: modelsError.value }
    } finally {
      modelsLoading.value = false
    }
  }

  /** 连通测试：永不抛错，结果都写进 testResult */
  async function runTest() {
    if (testing.value) return testResult.value
    testing.value = true
    testResult.value = null
    try {
      const result = await testConnection(config.value)
      testResult.value = {
        ok: true,
        message: `连接成功 · ${result.elapsed}ms · 模型 ${result.model}`,
        reply: result.reply,
        detail: '',
        elapsed: result.elapsed,
      }
    } catch (err) {
      testResult.value = {
        ok: false,
        // 带 HTTP 状态与原因的完整提示；detail 单独展示，避免重复
        message: err?.message || describeError(err),
        reply: '',
        detail: err?.detail || '',
        elapsed: 0,
      }
    } finally {
      testing.value = false
    }
    return testResult.value
  }

  return {
    // state
    profiles,
    activeId,
    testing,
    testResult,
    modelsLoading,
    modelsError,
    // getters
    config,
    isConfigured,
    canAddProfile,
    endpoint,
    headerPairs,
    modelOptions,
    // actions
    selectProfile,
    createProfile,
    renameProfile,
    ensureName,
    removeProfile,
    update,
    setModel,
    applyPreset,
    reset,
    resetAll,
    loadModels,
    runTest,
  }
})
