export const AppRoutes = [
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
    path: '/downloadManager',
    name: '下载管理',
    component: () => import('@renderer/views/DownloadManager.vue')
  },
  {
    path: '/mainPage',
    name: '主页面',
    component: () => import('@renderer/views/MainPage.vue')
  },
  {
    path: '/permissionNotice',
    name: '权限确认',
    component: () => import('@renderer/views/PermissionNotice.vue')
  },
  {
    path: '/claudeCodeStatus',
    name: 'Claude Code 状态',
    component: () => import('@renderer/views/ClaudeCodeStatus.vue')
  },
  {
    path: '/searchBox',
    name: '搜索框',
    component: () => import('@renderer/views/SearchBox.vue')
  },
  {
    path: '/markdownPreview',
    name: 'Markdown 预览',
    component: () => import('@renderer/views/MarkdownPreview.vue')
  },
  {
    path: '/contextMenu',
    name: '右键菜单',
    component: () => import('@renderer/views/ContextMenu.vue')
  }
]
