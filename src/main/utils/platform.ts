/**
 * 平台相关工具函数
 * @description 处理 macOS/Windows 平台差异
 */
import { screen } from 'electron'

/**
 * 获取屏幕底部安全间距（考虑 macOS Dock）
 * @param baseMargin - 基础间距（像素）
 * @returns 实际间距（macOS 会额外加上 Dock 高度）
 */
export function getBottomMargin(baseMargin: number): number {
  if (process.platform === 'darwin') {
    // macOS: 获取工作区域与屏幕底部的差值（即 Dock 高度）
    const display = screen.getPrimaryDisplay()
    const { workArea, bounds } = display
    // bounds 是整个屏幕，workArea 是排除 Dock/菜单栏的区域
    // Dock 高度 = 屏幕底部 - 工作区底部
    const dockHeight = bounds.y + bounds.height - (workArea.y + workArea.height)
    return baseMargin + dockHeight
  }
  return baseMargin
}

/**
 * 判断是否为 macOS 平台
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin'
}
