# Electron-Vite-Learn 项目 AI 辅助开发指南

## 目录索引

```
electron-vite-learn/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts            # 主进程入口，应用生命周期管理
│   │   ├── updateService.ts    # 自动更新服务
│   │   └── frame/              # 窗口框架（封装所有窗口逻辑）
│   │       ├── index.ts        # 统一导出
│   │       ├── BaseFrame.ts    # 窗口基类（通用逻辑）
│   │       ├── MainFrame.ts    # 主窗口（悬浮球时钟）
│   │       ├── NoticeFrame.ts  # 通知窗口
│   │       ├── UpdateFrame.ts  # 更新窗口
│   │       ├── MusicFrame.ts   # 音乐窗口
│   │       └── WindowFactory.ts # 窗口工厂（统一管理）
│   ├── preload/                 # 预加载脚本
│   │   ├── index.ts            # 预加载脚本入口，暴露安全 API
│   │   └── index.d.ts          # 类型定义
│   └── renderer/               # 渲染进程（Vue 3 前端）
│       ├── index.html          # HTML 入口
│       └── src/
│           ├── main.ts         # Vue 应用入口
│           ├── App.vue         # 根组件
│           ├── env.d.ts        # 环境类型声明
│           ├── router/         # 路由配置
│           │   ├── index.ts    # 路由实例和路由表
│           │   ├── routes.ts   # 路由定义
│           │   └── guards.ts   # 导航守卫
│           ├── store/          # Pinia 状态管理
│           │   ├── index.ts    # Store 入口
│           │   ├── userStore.ts # 用户状态管理
│           │   └── noticeStore.ts # 通知状态管理
│           ├── views/          # 页面视图组件
│           │   ├── Home.vue   # 悬浮球时钟（可拖拽、显示当前时间）
│           │   ├── About.vue  # 关于页
│           │   ├── Notice.vue # 通知窗口（剪贴板通知）
│           │   ├── MusicDialog.vue # 音乐对话框
│           │   └── UpdateDialog.vue # 更新对话框
│           ├── components/     # 可复用组件
│           │   └── Versions.vue
│           ├── utils/          # 工具函数
│           │   └── request.ts  # HTTP 请求工具
│           └── assets/         # 静态资源（CSS、图片）
│               ├── base.css
│               ├── main.css
│               ├── electron.svg
│               └── wavy-lines.svg
├── build/                      # 构建配置
├── resources/                  # 应用资源（图标等）
├── electron.vite.config.ts     # Electron-Vite 配置
├── electron-builder.yml        # 打包配置
├── tsconfig.json               # TypeScript 基础配置
├── tsconfig.node.json          # Node.js TypeScript 配置
└── tsconfig.web.json           # 浏览器 TypeScript 配置
```

## 技术栈

- **框架**: Electron 28 + Vue 3.4 + TypeScript 5.3
- **构建工具**: Vite 5 + electron-vite 2
- **路由**: Vue Router 4
- **状态管理**: Pinia
- **HTTP 请求**: Axios
- **包管理**: npm
- **代码规范**: ESLint + Prettier
- **打包工具**: electron-builder 24

## 模块说明

### 主进程 (src/main/)
- **职责**: 管理应用生命周期、创建窗口、处理系统级操作
- **关键文件**: `index.ts` - 主进程入口，应用生命周期管理
- **依赖**: electron, @electron-toolkit/utils

### 窗口框架 (src/main/frame/)
- **职责**: 封装所有窗口的通用逻辑，提供统一的窗口管理接口
- **关键文件**:
  - `BaseFrame.ts` - 窗口基类，封装创建、销毁、IPC 通信等通用逻辑
  - `MainFrame.ts` - 主窗口（悬浮球时钟），支持拖拽、吸附、剪贴板监控
  - `NoticeFrame.ts` - 通知窗口，从右下角弹出显示通知
  - `UpdateFrame.ts` - 更新窗口，显示软件更新对话框
  - `MusicFrame.ts` - 音乐窗口，显示音乐播放对话框
  - `WindowFactory.ts` - 窗口工厂，统一管理所有窗口的创建和生命周期
- **设计模式**: 工厂模式 + 模板方法模式
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 创建主窗口
  windowFactory.createMainFrame()

  // 显示通知
  windowFactory.showNotice('剪贴板内容已更新')

  // 显示更新窗口
  windowFactory.showUpdate('1.0.1', '修复了一些 bug')

  // 显示音乐窗口
  windowFactory.showMusic()
  ```

### 预加载脚本 (src/preload/)
- **职责**: 在主进程和渲染进程之间建立安全的桥梁
- **关键文件**: `index.ts` - 暴露安全的 API 给渲染进程
- **依赖**: @electron-toolkit/preload

### 渲染进程 (src/renderer/)
- **职责**: 用户界面展示和交互
- **关键文件**:
  - `src/main.ts` - Vue 应用初始化
  - `src/App.vue` - 根组件
  - `src/router/index.ts` - 路由配置
  - `src/store/` - Pinia 状态管理
  - `src/components/` - 可复用组件
  - `src/views/` - 页面视图组件
  - `src/utils/` - 工具函数
- **依赖**: vue, vue-router, pinia, @vitejs/plugin-vue

### 路由配置 (src/renderer/src/router/)
- **职责**: 管理单页面应用的路由导航
- **关键文件**:
  - `index.ts` - 路由实例、路由表
  - `routes.ts` - 路由定义
  - `guards.ts` - 导航守卫
- **依赖**: vue-router

### 状态管理 (src/renderer/src/store/)
- **职责**: 集中管理应用状态，实现组件间数据共享
- **关键文件**:
  - `index.ts` - Store 入口
  - `userStore.ts` - 用户状态管理
  - `noticeStore.ts` - 通知状态管理（剪贴板通知文本、显示状态）
- **依赖**: pinia, pinia-plugin-persistedstate

### 工具函数 (src/renderer/src/utils/)
- **职责**: 封装通用工具函数
- **关键文件**: `request.ts` - Axios 请求封装
- **依赖**: axios

### 页面视图 (src/renderer/src/views/)
- **职责**: 各页面的视图组件
- **关键文件**:
  - `Home.vue` - 悬浮球时钟，显示当前时间（HH:MM:SS），支持窗口拖拽
  - `About.vue` - 关于页
  - `MusicDialog.vue` - 音乐对话框

## 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 类型检查
npm run typecheck

# 构建应用
npm run build

# 打包为可执行文件
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux

# 代码格式化
npm run format

# 代码检查
npm run lint
```

## 规范

### 代码修改规范
1. 如果改动内容涉及到文件删除添加，要更新 claude.md 文档目录索引
2. 不要 git 提交无关的文件
3. 在修改代码后必须要编译检查是否有报错，不需要启动应用
4. **【重要】模块业务逻辑、数据库结构都发生更改后必须要更新相关 md 文件**
5. 在遇到用户需求模糊时必须要向用户提问，不要自己猜

### 代码注释规范
1. **方法级注释**：每个函数/方法上方必须添加注释，说明其功能、参数和返回值
2. **行内注释**：复杂逻辑或关键代码行上方添加行内注释，解释"为什么这样做"
3. 注释应简洁明了，不要重复代码本身能表达的内容
4. 使用 JSDoc 格式（TypeScript/Vue）或其他语言对应的注释规范

示例：
```typescript
/**
 * 处理用户登录请求
 * @param username - 用户名
 * @param password - 密码
 * @returns 登录结果，包含 token 和用户信息
 */
async function login(username: string, password: string): Promise<LoginResult> {
  // 验证输入参数，防止空值导致后续错误
  if (!username || !password) {
    throw new Error('用户名和密码不能为空')
  }

  const result = await api.post('/login', { username, password })
  return result.data
}
```

### ⚠️ 文档更新要求（必须遵守）

**修改代码后，必须同步更新相关文档，这是强制要求！**

需要更新文档的场景：
- 新增/删除/重命名文件 → 更新 `claude.md` 的目录索引
- 新增/删除模块 → 更新模块说明
- API 接口变更 → 更新相关 API 文档
- 数据库结构变更 → 更新数据库文档
- 业务逻辑重大变更 → 更新业务流程文档
- 新增配置项 → 更新配置说明
- 状态管理变更 → 更新状态管理文档

文档更新检查清单：
- [ ] 目录索引是否反映最新文件结构
- [ ] 模块说明是否准确描述功能
- [ ] 相关 md 文件是否同步更新
- [ ] 注释是否清晰易懂

**忘记更新文档会导致：**
- AI 辅助开发时产生误解
- 新成员难以理解项目结构
- 代码与文档不一致，造成混乱

### 编译检查命令

```bash
# TypeScript 类型检查（必须执行）
npm run typecheck

# 完整构建检查（包含类型检查）
npm run build
```

### 代码风格
- 使用 TypeScript 严格模式
- Vue 组件使用 `<script setup>` 语法
- 遵循 ESLint 和 Prettier 配置
- 组件命名：PascalCase（如 `Versions.vue`）
- 文件命名：camelCase（如 `index.ts`）

## IPC 通信模式

主进程和渲染进程通过 IPC 通信：
- **主进程**: 使用 `ipcMain.on()` 监听事件
- **渲染进程**: 使用 `window.electron.ipcRenderer.send()` 发送事件

示例：
```typescript
// 渲染进程 (App.vue)
const ipcHandle = () => window.electron.ipcRenderer.send('ping')

// 主进程 (src/main/index.ts)
ipcMain.on('ping', () => console.log('pong'))
```

## 路由配置

### 创建路由实例
```typescript
// src/renderer/src/router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/Home.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/about',
      name: 'about',
      // 路由懒加载
      component: () => import('../views/About.vue')
    }
  ]
})

export default router
```

### 在 Vue 应用中注册
```typescript
// src/renderer/src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')
```

### 在组件中使用
```vue
<!-- 使用 router-link 进行导航 -->
<template>
  <nav>
    <router-link to="/">首页</router-link>
    <router-link to="/about">关于</router-link>
  </nav>
  <router-view />
</template>

<!-- 编程式导航 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goToAbout = () => {
  router.push('/about')
}
</script>
```

## 状态管理 (Pinia)

### 创建 Store
```typescript
// src/renderer/src/store/userStore.ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
  // state
  const name = ref('')
  const token = ref('')

  // getters
  const isLoggedIn = computed(() => !!token.value)

  // actions
  function setUser(data: { name: string; token: string }) {
    name.value = data.name
    token.value = data.token
  }

  return { name, token, isLoggedIn, setUser }
})
```

### 在 Vue 应用中注册
```typescript
// src/renderer/src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

### 在组件中使用
```vue
<script setup>
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()
</script>

<template>
  <div>
    <p>用户名: {{ userStore.name }}</p>
    <p>已登录: {{ userStore.isLoggedIn }}</p>
  </div>
</template>
```

### 使用 StoreToRefs（推荐）
```vue
<script setup>
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()
// 使用 storeToRefs 保持响应式
const { name, isLoggedIn } = storeToRefs(userStore)
// actions 可以直接解构
const { setUser } = userStore
</script>

<template>
  <div>
    <p>用户名: {{ name }}</p>
    <p>已登录: {{ isLoggedIn }}</p>
  </div>
</template>
```

## HTTP 请求 (Axios)

### 请求工具封装
```typescript
// src/renderer/src/utils/request.ts
import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15000
})

// 请求拦截器
service.interceptors.request.use(
  (config) => {
    // 添加 token 等
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data
  },
  (error) => {
    return Promise.reject(error)
  }
)

export default service
```

### 使用示例
```typescript
// 在组件中使用
import request from '@/utils/request'

const fetchData = async () => {
  try {
    const data = await request.get('/api/data')
    console.log(data)
  } catch (error) {
    console.error(error)
  }
}
```

## 构建配置

### electron.vite.config.ts
- **主进程**: 使用 externalizeDepsPlugin 和 bytecodePlugin
- **预加载脚本**: 同上
- **渲染进程**: 使用 vue 插件，配置 @renderer 别名

### electron-builder.yml
- 配置应用打包选项
- 支持 Windows、macOS、Linux 平台

## 注意事项

1. **安全**: 预加载脚本只暴露必要的 API，遵循 Electron 安全最佳实践
2. **性能**: 使用 bytecodePlugin 优化主进程和预加载脚本性能
3. **开发体验**: 开发模式下支持 HMR（热模块替换）
4. **跨平台**: 支持 Windows、macOS、Linux 三平台打包

## 相关资源

- [Electron-Vite 官方文档](https://electron-vite.org/)
- [Vue 3 文档](https://vuejs.org/)
- [Electron 文档](https://www.electronjs.org/)
