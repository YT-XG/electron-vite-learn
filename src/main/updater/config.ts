/**
 * 局域网更新配置
 * @description 定义更新服务器地址、缓存目录等配置项
 */

import { app } from 'electron'
import { join } from 'path'

/** 更新配置接口 */
export interface UpdateConfig {
  /** 局域网更新服务器地址（SMB 路径，如 \\DESKTOP-PC\releases） */
  serverUrl: string
  /** 本地缓存目录 */
  cacheDir: string
  /** 网络请求超时时间（毫秒） */
  timeout: number
  /** 最新版本文件名 */
  latestFileName: string
}

/** 默认更新配置 */
export const defaultUpdateConfig: UpdateConfig = {
  // 局域网更新服务器地址（可通过环境变量 OVERUPDATE_SERVER_URL 覆盖）
  serverUrl: process.env.UPDATE_SERVER_URL || '\\\\10.15.8.28\\releases',
  // 本地缓存目录
  cacheDir: join(app.getPath('userData'), 'update-cache'),
  // 超时时间 30 秒
  timeout: 30000,
  // 最新版本文件名
  latestFileName: 'latest.yml'
}

/**
 * 获取更新配置
 * @param overrides - 配置覆盖项
 * @returns 完整的更新配置
 */
export function getUpdateConfig(overrides?: Partial<UpdateConfig>): UpdateConfig {
  return {
    ...defaultUpdateConfig,
    ...overrides
  }
}
