import { createRouter, createWebHashHistory } from 'vue-router'

import { afterEach, beforeEach } from '@renderer/router/guards'
import { AppRoutes } from '@renderer/router/routes'
const router = createRouter({
  history: createWebHashHistory(),
  routes: AppRoutes
})

router.beforeEach(beforeEach)
router.afterEach(afterEach)
export default router
