/**
 * 路由导航守卫
 * @description 前置守卫
 * @returns true 表示放行
 */
export const beforeEach = (): boolean => {
  return true
}

/**
 * 路由导航后置守卫
 * @description 后置守卫（当前为空实现，供后续扩展）
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export const afterEach = (): void => {}