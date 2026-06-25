export const AppRoutes = [
  { path: '/', name: '首页', component: () => import('@renderer/views/Home.vue') },
  { path: '/about', name: '关于我们', component: () => import('@renderer/views/About.vue') },
  {
    path: '/musicDialog',
    name: '歌词窗口',
    component: () => import('@renderer/views/MusicDialog.vue')
  },
  {
    path: '/notice',
    name: '通知',
    component: () => import('@renderer/views/Notice.vue')
  },
  {
    path: '/UpdateDialog',
    name: '更新',
    component: () => import('@renderer/views/UpdateDialog.vue')
  }
]
