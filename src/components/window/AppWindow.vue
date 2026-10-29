<script setup>
/**
 * App 全屏页面
 * ------------------------------------------------------------
 * 点图标 = 像真手机一样整屏打开（不再是桌面上的小浮窗）：
 * - 顶部导航栏：返回「‹」+ App 名称（页面也可以自己接管，见 provide('appNav')）
 * - 底部 Home 指示条：点一下回桌面
 * - 打开时自下而上滑入
 * 内容区自己滚动；同时打开多个 App 时只显示层级最高的那个（见 WindowLayer）
 */
import { computed, provide, ref } from 'vue'
import { useDesktopStore } from '@/stores/desktop'
import { getApp } from '@/apps/registry'

const props = defineProps({
  appId: { type: String, required: true },
  win: { type: Object, required: true },
})

const desktop = useDesktopStore()
const app = computed(() => getApp(props.appId))

/**
 * 外壳顶栏可被页面接管
 * ------------------------------------------------------------
 * 默认显示「‹ + App 名」。像微信进聊天详情这种自带一整条顶栏的页面，
 * 可以在自己的 setup 里 `inject('appNav')` 后调用 `hide(true)` 把这条藏起来，
 * 避免屏幕顶部出现两条并排的导航栏。离开页面时记得 `hide(false)` 还原。
 */
const navHidden = ref(false)
provide('appNav', {
  hidden: navHidden,
  hide: (value = true) => {
    navHidden.value = !!value
  },
})

/** 回桌面：关闭当前 App（等效真机上滑回主屏） */
const goHome = () => desktop.closeApp(props.appId)
</script>

<template>
  <div v-if="app" class="app-screen" :style="{ zIndex: win.z }">
    <header v-if="!navHidden" class="nav-bar">
      <button class="nav-back" aria-label="返回桌面" @click.stop="goHome">
        <span class="i-ph-caret-left" />
      </button>
      <span class="nav-title">{{ app.name }}</span>
      <span class="nav-side" aria-hidden="true" />
    </header>

    <div class="body no-scrollbar">
      <Suspense>
        <component :is="app.load" />
        <template #fallback>
          <div class="loading"><span class="spinner" /></div>
        </template>
      </Suspense>
    </div>

    <button class="home-bar" aria-label="回到桌面" @click.stop="goHome" />
  </div>
</template>

<style scoped>
.app-screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 整屏不透明：App 一打开就完全盖住桌面 */
  background: linear-gradient(180deg, #fffafc 0%, #fff0f6 100%);
  /* 顶部让出状态栏（26） */
  padding-top: calc(var(--u) * 30);
  pointer-events: auto;
  animation: screen-in 0.26s cubic-bezier(0.22, 0.8, 0.24, 1);
}

@keyframes screen-in {
  from {
    opacity: 0;
    transform: translateY(4%);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.nav-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 4);
  flex: none;
  height: calc(var(--u) * 44);
  padding: 0 calc(var(--u) * 10);
  background: rgba(255, 255, 255, 0.66);
  border-bottom: 1px solid rgba(124, 101, 112, 0.07);
  backdrop-filter: blur(calc(var(--u) * 18)) saturate(1.1);
  -webkit-backdrop-filter: blur(calc(var(--u) * 18)) saturate(1.1);
}

.nav-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 30);
  height: calc(var(--u) * 30);
  border-radius: 999px;
  font-size: calc(var(--u) * 17);
  color: var(--c-text);
  background: rgba(255, 255, 255, 0.6);
  transition: background 0.16s ease;
}

.nav-back:active {
  background: rgba(255, 255, 255, 0.95);
}

.nav-title {
  flex: 1;
  overflow: hidden;
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: calc(var(--u) * 15);
  font-weight: 600;
  letter-spacing: calc(var(--u) * 0.2);
  color: var(--c-text);
}

/* 和左侧返回键等宽，保证标题真正居中 */
.nav-side {
  flex: none;
  width: calc(var(--u) * 30);
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  /* 底部让出 Home 条 */
  padding-bottom: calc(var(--u) * 20);
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.spinner {
  width: calc(var(--u) * 22);
  height: calc(var(--u) * 22);
  border-radius: 999px;
  border: calc(var(--u) * 2) solid rgba(247, 168, 190, 0.25);
  border-top-color: var(--c-accent);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* iPhone 式 Home 条：整条都是点击热区 */
.home-bar {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(var(--u) * 22);
  touch-action: none;
}

.home-bar::after {
  content: '';
  width: calc(var(--u) * 120);
  height: calc(var(--u) * 5);
  border-radius: 999px;
  background: rgba(124, 101, 112, 0.26);
  transition:
    background 0.16s ease,
    transform 0.16s ease;
}

.home-bar:active::after {
  background: rgba(124, 101, 112, 0.44);
  transform: scaleY(1.3);
}
</style>
