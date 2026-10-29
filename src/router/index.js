import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * 路由：首页永远是虚拟桌面
 * App 全部以「窗口」形式浮在桌面上，不占用路由（便于保持桌面状态）
 * 后续如需深链（例如通知点开某个 App），可用 query：/?app=wechat
 */
const router = createRouter({
  // APK / PWA 首屏都用 hash 模式，避免 file:// 下路径问题
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'desktop',
      component: () => import('@/views/Desktop.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
