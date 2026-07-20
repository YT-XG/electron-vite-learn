/**
 * 模拟输入服务
 * @description 封装键盘模拟功能，支持跨平台的 Ctrl+V / Cmd+V 粘贴操作
 *
 * 设计思路（v2 — 简化版）：
 *   放弃 PowerShell 绕弯方案（Alt 键技巧会触发目标窗口菜单栏）。
 *
 *   粘贴流程完全依赖 Windows 原生行为：
 *   1. MainPageFrame.minimizeForPaste() 先移除 alwaysOnTop 再最小化
 *      → Windows 自动把焦点恢复给上一个前台窗口（100% 可靠）
 *   2. 等 300ms 让焦点稳定
 *   3. nut-js 发送 Ctrl+V（使用 SendInput，无需前台权限）
 *   4. 降级方案：PowerShell SendKeys（不包含 Alt 污染）
 *
 *   macOS/Linux: 直接用 nut-js
 */
import { keyboard, Key } from '@nut-tree/nut-js'
import { ipcMain } from 'electron'
import { platform } from 'os'
import { execSync } from 'child_process'
import log from 'electron-log'

class InputService {
  /** 是否已初始化 */
  #initialized = false

  /** 跨平台修饰键：macOS 用 Command，其他平台用 Ctrl */
  private MODIFIER_KEY: Key = Key.LeftControl

  constructor() {
    // 构造函数不做任何可能崩溃的操作（如加载 @nut-tree/nut-js 原生模块）
    // 实际初始化放到 init() 方法中，由 app.whenReady 统一调度
  }

  /**
   * 初始化服务
   * @description 延迟初始化 @nut-tree/nut-js 原生模块，确保在 app.whenReady 内执行
   *              这样如果在 macOS 上因为 Accessibility 权限或架构不匹配导致崩溃，
   *              也能被 uncaughtException 处理器捕获
   */
  async init(): Promise<void> {
    if (this.#initialized) return
    this.#initialized = true

    try {
      this.MODIFIER_KEY = platform() === 'darwin' ? Key.LeftSuper : Key.LeftControl
      keyboard.config.autoDelayMs = 100
      this.#registerIPC()
      log.info('[InputService] 初始化完成')
    } catch (err) {
      log.error('[InputService] 初始化失败（nut-js 原生模块可能不兼容）:', err)
      // 不抛出异常，让应用在其他功能正常的情况下继续运行
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  粘贴操作
  // ═══════════════════════════════════════════════════════════════

  /**
   * 模拟粘贴操作（Ctrl+V 或 Cmd+V）
   * 主方案：@nut-tree/nut-js（Windows 底层用 SendInput，无需聚焦权限）
   */
  async paste(): Promise<void> {
    await keyboard.pressKey(this.MODIFIER_KEY, Key.V)
    await keyboard.releaseKey(this.MODIFIER_KEY, Key.V)
  }

  /**
   * 降级方案：PowerShell SendKeys 模拟粘贴
   * 仅作为 nut-js 失效时的兜底（不含 Alt 污染）
   */
  async #pasteFallback(): Promise<boolean> {
    if (platform() !== 'win32') return false

    try {
      execSync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
        { encoding: 'utf-8', timeout: 3000 }
      )
      return true
    } catch (err) {
      log.warn('[InputService] Fallback paste failed:', err)
      return false
    }
  }

  /**
   * 执行业务粘贴
   * 主方案：nut-js → 降级：PowerShell SendKeys
   */
  async pasteToPreviousWindow(): Promise<void> {
    // 主方案：nut-js Ctrl+V（Windows 使用 SendInput，跨平台统一）
    try {
      await this.paste()
      return
    } catch (err) {
      log.warn('[InputService] nut-js paste failed, try fallback:', err)
    }

    // 降级方案
    const ok = await this.#pasteFallback()
    if (!ok) {
      log.error('[InputService] 所有粘贴方案均失败')
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  IPC 注册
  // ═══════════════════════════════════════════════════════════════

  /** 注册 IPC 通道 */
  #registerIPC(): void {
    // 恢复焦点到上一个窗口并粘贴
    ipcMain.handle('input:paste-to-previous', async () => {
      await this.pasteToPreviousWindow()
    })

    // 仅模拟粘贴（不恢复焦点）
    ipcMain.handle('input:paste', async () => {
      await this.paste()
    })
  }
}

export const inputService = new InputService()
