import {
  defineConfig,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// UnoCSS 配置：仅做工具类 + 图标，复杂视觉效果（磨砂、缩放）走组件 scoped CSS
export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons({
      scale: 1,
      warn: true,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  // registry.js 里的图标类名是「运行时拼出来的」，UnoCSS 扫不到，
  // 这里显式列入 safelist（与 src/apps/registry.js 的 16 个 App 一一对应）
  safelist: [
    'i-ph-wechat-logo-fill',
    'i-ph-book-open-text-fill',
    'i-ph-gear-six-fill',
    'i-ph-brain-fill',
    'i-ph-storefront-fill',
    'i-ph-books-fill',
    'i-ph-chats-circle-fill',
    'i-ph-scroll-fill',
    'i-ph-circles-four-fill',
    'i-ph-tiktok-logo-fill',
    'i-ph-game-controller-fill',
    'i-ph-chat-teardrop-dots-fill',
    'i-ph-cards-fill',
    'i-ph-x-logo-fill',
    'i-ph-heart-fill',
    'i-ph-note-pencil-fill',
  ],
  theme: {
    colors: {
      // 与 mock 取色一致：底 #FFDFEA、玻璃 #FFEFF5、内卡 #FFF9FB
      rose: {
        50: '#FFF9FB',
        100: '#FFF3F7',
        200: '#FFEFF5',
        300: '#FFDFEA',
        400: '#FBC9DA',
        500: '#F7A8BE',
        600: '#E28CA6',
      },
      ink: {
        DEFAULT: '#7C6570',
        soft: 'rgba(124, 101, 112, 0.62)',
        faint: 'rgba(124, 101, 112, 0.38)',
      },
    },
    fontFamily: {
      serif: "'Cormorant Garamond', Georgia, 'Songti SC', 'Noto Serif SC', serif",
      sans: "'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif",
    },
  },
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'no-scrollbar': '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  },
})
