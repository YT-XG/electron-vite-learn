# Renderer Process Documentation

## Renderer Process Overview

The renderer process is the frontend UI layer of the application, built with Vue 3.4 and TypeScript.

### Design System: Modern Dark (Cinema)

The UI follows a Modern Dark (Cinema) style with a Slate/Blue color scheme:

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0f172a` (Slate 900) | Deep dark theme background |
| Brand | `#3b82f6` (Blue 500) | Primary brand color |
| Success | `#22c55e` | Success indicators |
| Danger | `#ef4444` | Error / destructive actions |
| Warning | `#f59e0b` | Warning indicators |

**Component styling:**

- Buttons: `border-radius: 8px`, hover floats up by 1px
- Dialogs: `backdrop-filter: blur(4px)`, `border-radius: 16px`

### File Structure

```
src/renderer/
├── index.html              # HTML entry
└── src/
    ├── main.ts             # Vue app initialization
    ├── App.vue             # Root component
    ├── env.d.ts            # Environment type declarations
    ├── router/             # Vue Router configuration
    │   ├── index.ts        # Router instance and route table
    │   ├── routes.ts       # Route definitions
    │   └── guards.ts       # Navigation guards
    ├── store/              # Pinia state management
    │   ├── index.ts        # Store entry
    │   ├── userStore.ts    # User state management
    │   └── noticeStore.ts  # Notification state management
    ├── views/              # Page view components
    │   ├── About.vue
    │   ├── Notice.vue
    │   ├── NoticeNew.vue
    │   ├── UpdateNew.vue
    │   ├── MainPage.vue
    │   ├── ClipboardManager.vue
    │   ├── Translate.vue
    │   ├── PermissionNotice.vue
    │   ├── SearchBox.vue
    │   ├── MarkdownPreview.vue
    │   ├── ContextMenu.vue
    │   ├── SnippetPicker.vue
    │   ├── Online.vue
    │   ├── ShareSelect.vue
    │   ├── Shortcuts.vue
    │   ├── Test.vue
    │   └── tools/
    │       └── Toolbox.vue
    ├── components/         # Reusable UI components
    │   ├── Versions.vue
    │   ├── BaseDialog.vue
    │   └── EmptyState.vue
    ├── composables/        # Composable functions
    │   └── useTimeFormat.ts
    ├── utils/              # Utility functions
    │   ├── request.ts      # HTTP request wrapper (Axios)
    │   └── pinyinSearch.ts # Pinyin initial search utility
    └── assets/             # Static assets (CSS, images)
        ├── base.css
        ├── main.css
        ├── electron.svg
        └── wavy-lines.svg
```

### Dependencies

- vue
- vue-router
- pinia
- pinia-plugin-persistedstate
- @vitejs/plugin-vue
- axios

---

## Routing (`src/renderer/src/router/`)

Manages single-page application routing and navigation.

### Key Files

| File | Description |
|------|-------------|
| `index.ts` | Router instance creation, route table definition |
| `routes.ts` | Route definitions (paths, components, metadata) |
| `guards.ts` | Navigation guards (beforeEach, afterEach) |

### Creating a Router Instance

```typescript
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
      // Lazy-loaded route
      component: () => import('../views/About.vue')
    }
  ]
})

export default router
```

### Registering in the Vue App

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')
```

### Using in Components

```vue
<template>
  <nav>
    <router-link to="/">Home</router-link>
    <router-link to="/about">About</router-link>
  </nav>
  <router-view />
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goToAbout = () => {
  router.push('/about')
}
</script>
```

---

## State Management (`src/renderer/src/store/`)

Centralized state management using Pinia with `pinia-plugin-persistedstate` for persistence.

### Key Files

| File | Description |
|------|-------------|
| `index.ts` | Store entry point |
| `userStore.ts` | User state (name, token, login status) |
| `noticeStore.ts` | Notification state (clipboard text, display status) |

### Creating a Store

```typescript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
  // State
  const name = ref('')
  const token = ref('')

  // Getters
  const isLoggedIn = computed(() => !!token.value)

  // Actions
  function setUser(data: { name: string; token: string }) {
    name.value = data.name
    token.value = data.token
  }

  return { name, token, isLoggedIn, setUser }
})
```

### Registering Pinia in the App

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

### Using Stores in Components

```vue
<script setup>
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()
</script>

<template>
  <div>
    <p>Username: {{ userStore.name }}</p>
    <p>Logged in: {{ userStore.isLoggedIn }}</p>
  </div>
</template>
```

### Recommended: Using `storeToRefs`

```vue
<script setup>
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()
// keep reactivity with storeToRefs
const { name, isLoggedIn } = storeToRefs(userStore)
// actions can be destructured directly
const { setUser } = userStore
</script>

<template>
  <div>
    <p>Username: {{ name }}</p>
    <p>Logged in: {{ isLoggedIn }}</p>
  </div>
</template>
```

---

## Reusable Components (`src/renderer/src/components/`)

Cross-page reusable UI components.

### BaseDialog.vue

Unified dialog component with overlay, container, and three slots (header/content/footer).

```vue
<BaseDialog :visible="showDialog" title="Title" @close="showDialog = false">
  <p>Dialog content goes here</p>
  <template #footer>
    <button class="btn btn-secondary" @click="showDialog = false">Cancel</button>
    <button class="btn btn-primary" @click="confirm">Confirm</button>
  </template>
</BaseDialog>
```

### EmptyState.vue

Unified empty state component with icon, text, and hint description.

```vue
<EmptyState icon="search" text="No results found" hint="Try a different keyword" />
```

#### Icon Options

| Icon        | Usage                    |
|-------------|--------------------------|
| `search`    | No search results        |
| `clipboard` | Empty clipboard history  |
| `download`  | No downloads             |
| `translate` | No translation history   |
| `folder`    | Empty folder             |
| `tool`      | No tools available       |
| `success`   | Success state            |

---

## Composables (`src/renderer/src/composables/`)

Reusable logic functions.

### useTimeFormat.ts

Time and size formatting utilities: relative time, absolute time, file size, and download speed.

```typescript
import { formatTimeAgo, formatFileSize, formatSpeed } from '@/composables/useTimeFormat'

// Relative time: "just now", "5 minutes ago", "3 hours ago"
const time = formatTimeAgo(timestamp)

// File size: "1.5 MB"
const size = formatFileSize(bytes)

// Download speed: "2.3 MB/s"
const speed = formatSpeed(bytesPerSecond)
```

---

## Utility Functions (`src/renderer/src/utils/`)

### request.ts -- Axios HTTP Wrapper

Axios instance with request and response interceptors.

```typescript
import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15000
})

// Request interceptor
service.interceptors.request.use(
  (config) => {
    // Add auth tokens, etc.
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
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

**Usage:**

```typescript
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

### pinyinSearch.ts -- Pinyin Initial Search

Utility for matching text against Chinese pinyin initials. Used by the search box and clipboard search features to support fuzzy pinyin-based matching.
