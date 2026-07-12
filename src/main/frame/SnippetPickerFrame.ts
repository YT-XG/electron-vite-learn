import { app, BrowserWindow, BrowserWindowConstructorOptions, clipboard, screen } from 'electron'
import { join } from 'path'
import BaseFrame from './BaseFrame'
import { clipboardService } from '../service/clipboardService'
import { inputService } from '../service/inputService'
import { getPinyinInitials } from '../utils/pinyinUtils'

/**
 * 片段选择窗口
 * @description 全局快捷键 Ctrl+Shift+V 呼出，搜索并快速插入已保存的片段
 *              支持变量模板（{{变量名}}）粘贴前弹出输入框替换
 */
export default class SnippetPickerFrame extends BaseFrame {
  /** 窗口宽度 */
  static readonly WIDTH = 480

  /** 窗口高度 */
  static readonly HEIGHT = 360

  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: SnippetPickerFrame.WIDTH,
    height: SnippetPickerFrame.HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  }

  /** 路由路径 */
  protected readonly routePath: string = '/snippetPicker'

  /** 是否正在显示 */
  #isVisible = false

  /**
   * 重写创建方法
   */
  create(): BrowserWindow {
    const window = super.create()
    window.hide()

    // 失去焦点时隐藏（延迟执行，避免通知窗口抢焦点时立即隐藏）
    window.on('blur', () => {
      setTimeout(() => {
        if (this.isAlive() && this.window!.isVisible()) {
          this.hide()
        }
      }, 200)
    })

    return window
  }

  /**
   * 切换显示/隐藏
   */
  toggle(): void {
    if (this.#isVisible) {
      this.hide()
    } else {
      this.show()
    }
  }

  /**
   * 显示片段选择窗口
   */
  show(): void {
    if (!this.isAlive()) {
      this.create()
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()

      this.window!.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          // 通知渲染进程清空状态
          this.sendOne('to-renderer-SnippetPicker:show')
          this.window?.setOpacity(1)
          this.#isVisible = true
        }, 30)
      })
    } else if (!this.window!.isVisible()) {
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()
      setTimeout(() => {
        this.sendOne('to-renderer-SnippetPicker:show')
        this.window?.setOpacity(1)
        this.#isVisible = true
      }, 30)
    }
  }

  /**
   * 隐藏窗口并让系统焦点恢复到上一个应用（粘贴前调用）
   * @description 模仿 MainPageFrame.minimizeForPaste() 的模式
   *  - Windows: 先移除 alwaysOnTop，再 minimize → Windows 自动恢复焦点
   *  - macOS: hide() + app.hide() → 系统回到上一个应用
   * @returns Promise，解析时机 = 焦点已转移
   */
  dismissForPaste(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isAlive() || !this.window || this.window.isDestroyed()) {
        resolve()
        return
      }
      this.#isVisible = false
      // 移除 alwaysOnTop，让 minimize 能正确传递焦点
      this.window.setAlwaysOnTop(false)

      if (process.platform === 'darwin') {
        // macOS: 隐藏窗口 + 隐藏整个应用
        this.window.hide()
        app.hide()
        setTimeout(() => {
          app.show()
          resolve()
        }, 200)
      } else {
        // Windows: minimize → 系统自动把焦点还给上一个前台窗口
        this.window.minimize()
        // 等焦点稳定
        setTimeout(resolve, 200)
      }
    })
  }

  /**
   * 隐藏片段选择窗口
   */
  hide(): void {
    if (this.isAlive() && this.window!.isVisible()) {
      this.window!.setOpacity(0)
      setTimeout(() => {
        this.window?.hide()
        this.#isVisible = false
      }, 150)
    }
  }

  /**
   * 将窗口定位到屏幕正中心
   */
  #centerOnScreen(): void {
    if (!this.window || this.window.isDestroyed()) return

    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    const width = this.window.getSize()[0]
    const height = this.window.getSize()[1]

    const x = Math.round(workArea.x + (workArea.width - width) / 2)
    const y = Math.round(workArea.y + (workArea.height - height) / 2)

    this.window.setPosition(x, y)
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 获取最近剪贴板历史（搜索框为空时展示）
    this.recvTwo('to-main-SnippetPicker:getRecentHistory', () => {
      const history = clipboardService.getAll(50, 0)
      const favorites = clipboardService.getFavorites()

      // 合并：片段优先（固定），然后历史记录（按内容去重）
      const seen = new Set<string>()
      const merged: Array<Record<string, unknown>> = []

      for (const item of favorites) {
        if (!seen.has(item.content)) {
          seen.add(item.content)
          merged.push({ ...item, source: 'favorite' as const })
        }
      }
      for (const item of history) {
        if (!seen.has(item.content)) {
          seen.add(item.content)
          merged.push({ ...item, source: 'history' as const })
        }
      }

      return merged
    })

    // 搜索片段 + 剪贴板历史（同时支持拼音首字母搜索）
    this.recvTwo('to-main-SnippetPicker:search', (_event, keyword: string) => {
      if (!keyword.trim()) return []

      // 1. SQL LIKE 搜索
      const historyResults = clipboardService.search(keyword)
      const favoriteResults = clipboardService.searchFavorites(keyword)

      // 2. 拼音首字母补充搜索（对最近 200 条历史和全部片段做拼音匹配）
      const pinyinKeyword = getPinyinInitials(keyword).toLowerCase()
      let pinyinHistory: Array<{ id: number; content: string; created_at: number }> = []
      let pinyinFavorites: Array<{ id: number; content: string; category: string; description: string; created_at: number }> = []

      if (pinyinKeyword && /[a-z]/.test(pinyinKeyword)) {
        // 拼音匹配只对包含字母的查询有意义
        const recentHistory = clipboardService.getAll(200, 0)
        const allFavorites = clipboardService.getFavorites()

        pinyinHistory = recentHistory.filter((item) =>
          !historyResults.some((h) => h.id === item.id) && // 去重：SQL 已匹配的不再重复
          getPinyinInitials(item.content).toLowerCase().includes(pinyinKeyword)
        )
        pinyinFavorites = allFavorites.filter((item) =>
          !favoriteResults.some((f) => f.id === item.id) && // 去重
          getPinyinInitials(item.content).toLowerCase().includes(pinyinKeyword)
        )
      }

      // 3. 合并结果：按内容去重（同一内容优先保留片段，带分类/描述）
      const seen = new Set<string>()
      const merged: Array<Record<string, unknown>> = []

      // 先加片段（优先级高）
      for (const item of favoriteResults) {
        if (!seen.has(item.content)) {
          seen.add(item.content)
          merged.push({ ...item, source: 'favorite' as const })
        }
      }
      // 再加历史（跳过已出现的内容）
      for (const item of historyResults) {
        if (!seen.has(item.content)) {
          seen.add(item.content)
          merged.push({ ...item, source: 'history' as const })
        }
      }
      // 再加拼音匹配的片段
      for (const item of pinyinFavorites) {
        if (!seen.has(item.content)) {
          seen.add(item.content)
          merged.push({ ...item, source: 'favorite' as const })
        }
      }
      // 最后加拼音匹配的历史
      for (const item of pinyinHistory) {
        if (!seen.has(item.content)) {
          seen.add(item.content)
          merged.push({ ...item, source: 'history' as const })
        }
      }

      return merged
    })

    // 复制片段内容并粘贴到上一个窗口（无变量）
    this.recvOne('to-main-SnippetPicker:paste', async (_event, content: string) => {
      if (!content) return
      // 写入系统剪贴板
      clipboard.writeText(content)
      // 同步剪贴板监控缓存，避免粘贴的内容被重复保存为历史记录
      clipboardService.syncMonitorCache()
      // 隐藏窗口 + 恢复焦点到上一个应用
      await this.dismissForPaste()
      // 发送 Ctrl+V 粘贴
      inputService.pasteToPreviousWindow()
    })

    // 隐藏选择窗口
    this.recvOne('to-main-SnippetPicker:hide', () => {
      this.hide()
    })
  }
}
