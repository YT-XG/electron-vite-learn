export const AppRoutes = [
  { path: '/', name: '首页', component: () => import('@renderer/views/Home.vue') },
  { path: '/about', name: '关于我们', component: () => import('@renderer/views/About.vue') },
  {
    path: '/noticeNew',
    name: '通知窗口',
    component: () => import('@renderer/views/NoticeNew.vue')
  },
  {
    path: '/updateNew',
    name: '更新窗口新',
    component: () => import('@renderer/views/UpdateNew.vue')
  },
  {
    path: '/openDialog',
    name: '展开窗口',
    component: () => import('@renderer/views/OpenDialog.vue')
  },
  {
    path: '/test',
    name: '测试',
    component: () => import('@renderer/views/Test.vue')
  }
]
