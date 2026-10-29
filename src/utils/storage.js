/**
 * 本地存储工具
 * ------------------------------------------------------------
 * - 结构化数据（布局 / 配置）走 localStorage
 * - 用户上传的大图走 IndexedDB（避免撑爆 localStorage 的 5MB 限额）
 */

const DB_NAME = 'vphone-assets'
const DB_STORE = 'images'
const DB_VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 不可用'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/** 读取 JSON，失败时回退默认值 */
export function loadJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[storage] 读取失败', key, err)
    return fallback
  }
}

/** 写入 JSON，返回是否成功 */
export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    console.warn('[storage] 写入失败', key, err)
    return false
  }
}

/** 保存图片（Blob / dataURL 字符串） */
export async function putImage(key, blob) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(blob, key)
    tx.oncomplete = () => resolve(key)
    tx.onerror = () => reject(tx.error)
  })
}

/** 读取图片，返回 objectURL（调用方负责 revoke） */
export async function getImageURL(key) {
  if (!key) return ''
  try {
    const db = await openDB()
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const req = tx.objectStore(DB_STORE).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (!blob) return ''
    return blob instanceof Blob ? URL.createObjectURL(blob) : String(blob)
  } catch (err) {
    console.warn('[storage] 读取图片失败', key, err)
    return ''
  }
}

/** 删除图片 */
export async function removeImage(key) {
  if (!key) return
  try {
    const db = await openDB()
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(key)
  } catch (err) {
    console.warn('[storage] 删除图片失败', key, err)
  }
}

/** 清空全部本地数据（设置页「清除缓存」用） */
export async function clearAllStorage() {
  localStorage.clear()
  try {
    const db = await openDB()
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).clear()
  } catch {
    /* ignore */
  }
}
