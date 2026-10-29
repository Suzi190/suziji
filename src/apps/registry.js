/**
 * App 注册表
 * ------------------------------------------------------------
 * 所有 App 的元信息集中在这里，桌面图标、Dock、窗口标题栏、
 * 以及窗口内容组件都从这里读取，避免各处硬编码。
 *
 * id     唯一标识（窗口状态 / 本地数据的 key）
 * name   显示名称
 * icon   Iconify 图标类名（UnoCSS presetIcons + Phosphor 集合），可直接用于 :class
 * accent 图标主色（低饱和，符合整体风格）
 * window 预留尺寸（设计像素）；App 现在统一整屏打开，这里仅作保底
 * phase  所属开发阶段，用于占位页展示
 */
import { defineAsyncComponent } from 'vue'

const view = (name) => defineAsyncComponent(() => import(`@/views/apps/${name}.vue`))

export const APPS = [
  {
    id: 'wechat',
    name: '微信',
    icon: 'i-ph-wechat-logo-fill',
    accent: '#8fbf9f',
    window: { w: 392, h: 604 },
    phase: 1,
    desc: '虚拟社交聊天，多会话气泡对话',
    load: view('Wechat'),
  },
  {
    id: 'worldbook',
    name: '世界书',
    icon: 'i-ph-book-open-text-fill',
    accent: '#b5a98f',
    window: { w: 392, h: 620 },
    phase: 1,
    desc: '关键词世界书，对话时自动注入设定',
    load: view('WorldBook'),
  },
  {
    id: 'settings',
    name: '设置',
    icon: 'i-ph-gear-six-fill',
    accent: '#b6b6c2',
    window: { w: 392, h: 640 },
    phase: 1,
    desc: 'AI 接口配置、桌面与系统设置',
    load: view('Settings'),
  },
  {
    id: 'memory',
    name: '记忆',
    icon: 'i-ph-brain-fill',
    accent: '#c3a9c9',
    window: { w: 392, h: 620 },
    phase: 1,
    desc: '长期记忆管理，按标签注入上下文',
    load: view('Memory'),
  },
  {
    id: 'mall',
    name: '商城',
    icon: 'i-ph-storefront-fill',
    accent: '#e9b7a8',
    window: { w: 392, h: 620 },
    phase: 3,
    desc: '角色卡 / 皮肤 / 壁纸资源展示',
    load: view('Mall'),
  },
  {
    id: 'academy',
    name: '书院',
    icon: 'i-ph-books-fill',
    accent: '#a9b6d9',
    window: { w: 392, h: 620 },
    phase: 2,
    desc: '文稿写作与 AI 续写润色',
    load: view('Academy'),
  },
  {
    id: 'forum',
    name: '论坛',
    icon: 'i-ph-chats-circle-fill',
    accent: '#c9a9c4',
    window: { w: 392, h: 620 },
    phase: 3,
    desc: '虚拟论坛，AI 扮演用户回帖',
    load: view('Forum'),
  },
  {
    id: 'textgame',
    name: '文游',
    icon: 'i-ph-scroll-fill',
    accent: '#b9afd0',
    window: { w: 392, h: 620 },
    phase: 2,
    desc: '文字冒险，分支选择与剧情存档',
    load: view('TextGame'),
  },
  {
    id: 'bureau',
    name: '穿越局',
    icon: 'i-ph-circles-four-fill',
    accent: '#b0a9d6',
    window: { w: 392, h: 620 },
    phase: 2,
    desc: '跨世界观角色扮演与切换',
    load: view('Bureau'),
  },
  {
    id: 'douyin',
    name: '抖音',
    icon: 'i-ph-tiktok-logo-fill',
    accent: '#a8b4b8',
    window: { w: 392, h: 640 },
    phase: 3,
    desc: 'AI 短文案信息流，上下滑动',
    load: view('Douyin'),
  },
  {
    id: 'game',
    name: '游戏',
    icon: 'i-ph-game-controller-fill',
    accent: '#a8c3b8',
    window: { w: 392, h: 620 },
    phase: 2,
    desc: '猜词 / 海龟汤 等轻量文字游戏',
    load: view('Game'),
  },
  {
    id: 'message',
    name: '信息',
    icon: 'i-ph-chat-teardrop-dots-fill',
    accent: '#9fc0ce',
    window: { w: 392, h: 600 },
    phase: 2,
    desc: '短信式简短对话与通知',
    load: view('Message'),
  },
  {
    id: 'tarot',
    name: '塔罗',
    icon: 'i-ph-cards-fill',
    accent: '#c6b49b',
    window: { w: 392, h: 620 },
    phase: 2,
    desc: '牌阵抽取与 AI 解读',
    load: view('Tarot'),
  },
  {
    id: 'twitter',
    name: '推特',
    icon: 'i-ph-x-logo-fill',
    accent: '#a9bccf',
    window: { w: 392, h: 620 },
    phase: 3,
    desc: '短动态时间线，AI 生成回复',
    load: view('Twitter'),
  },
  {
    id: 'couple',
    name: '情侣空间',
    icon: 'i-ph-heart-fill',
    accent: '#e7a9bc',
    window: { w: 392, h: 620 },
    phase: 2,
    desc: '双人陪伴对话、日记与记事',
    load: view('CoupleSpace'),
  },
  {
    id: 'memo',
    name: '备忘录',
    icon: 'i-ph-note-pencil-fill',
    accent: '#d9c6a0',
    window: { w: 392, h: 600 },
    phase: 1,
    desc: '纯文本备忘，AI 辅助总结',
    load: view('Memo'),
  },
]

export const APP_MAP = Object.fromEntries(APPS.map((app) => [app.id, app]))

export const getApp = (id) => APP_MAP[id]

/** Dock 固定栏的四个 App（两页共享） */
export const DOCK_IDS = ['settings', 'memory', 'worldbook', 'message']
