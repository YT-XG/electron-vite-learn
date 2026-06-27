/**
 * 窗口框架统一导出
 * @description 统一管理所有窗口 Frame 类
 */

// 基类
export { default as BaseFrame } from './BaseFrame'

// 具体实现
export { default as MainFrame } from './MainFrame'
export { default as NoticeFrame } from './NoticeFrame'
export { default as UpdateFrame } from './UpdateFrame'
export { default as MusicFrame } from './MusicFrame'
export { default as TestFrame } from './TestFrame'
export { default as OpenDialogFrame } from './OpenDialogFrame'

// 窗口工厂
export { default as WindowFactory, windowFactory } from './WindowFactory'
