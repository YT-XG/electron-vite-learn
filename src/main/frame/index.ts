/**
 * 窗口框架统一导出
 * @description 统一管理所有窗口 Frame 类
 */

// 基类
export { default as BaseFrame } from './BaseFrame'

// 具体实现
export { default as NoticeNewFrame } from './NoticeNewFrame'
export { default as UpdateNewFrame } from './UpdateNewFrame'
export { default as MainPageFrame } from './MainPageFrame'
export { default as PermissionNoticeFrame } from './PermissionNoticeFrame'
export { default as JsonToolFrame } from './JsonToolFrame'

// 窗口工厂
export { default as WindowFactory, windowFactory } from './WindowFactory'
