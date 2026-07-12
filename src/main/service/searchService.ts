import { shell } from 'electron'
import log from 'electron-log'
import { windowFactory, popupManager, NoticeNewFrame, UpdateNewFrame } from '../frame'

/**
 * 工具定义接口
 */
export interface Tool {
  id: string
  name: string
  aliases: string[]
  category: string
  icon: string
  description: string
  action: () => void
}

/**
 * 搜索结果项接口
 */
export interface SearchResultItem {
  id: string
  name: string
  aliases: string[]
  category: string
  icon: string
  description: string
  score: number
  matchType: 'exact' | 'prefix' | 'pinyin' | 'fuzzy'
}

/**
 * 搜索服务
 * @description 统一管理工具、剪贴板、应用的搜索逻辑
 */
class SearchService {
  /** 工具列表 */
  private tools: Tool[] = [
    {
      id: 'markdown-preview',
      name: 'Markdown 预览',
      aliases: ['md', '预览', 'markdown'],
      category: 'tool',
      icon: '📝',
      description: '实时 Markdown 分屏预览',
      action: function () {
        // 先隐藏主界面，再显示 Markdown 预览窗口
        const mainPage = windowFactory.getMainPageFrame()
        if (mainPage.isAlive()) {
          // 使用 close() 方法隐藏窗口（BaseFrame 会调用 window.hide()）
          mainPage.close()
        }
        windowFactory.createMarkdownPreviewFrame().show()
      }
    },
    {
      id: 'clipboard-manager',
      name: '剪贴板管理',
      aliases: ['cb', '剪贴板', '复制', 'jqb'],
      category: 'tool',
      icon: '📋',
      description: '查看和管理剪贴板历史',
      action: function () { windowFactory.getMainPageFrame().showAndPage('clipboard') }
    },
    {
      id: 'translate',
      name: '翻译',
      aliases: ['fy', '翻译', 'translate'],
      category: 'tool',
      icon: '🌐',
      description: '多语言文本翻译',
      action: function () { windowFactory.getMainPageFrame().showAndPage('translate') }
    },
    {
      id: 'download-manager',
      name: '下载管理',
      aliases: ['xiazai', '下载', 'download'],
      category: 'tool',
      icon: '📥',
      description: '查看和管理下载任务',
      action: function () { windowFactory.getMainPageFrame().showAndPage('download') }
    },
    {
      id: 'check-update',
      name: '检查更新',
      aliases: ['gx', '更新', 'update'],
      category: 'tool',
      icon: '🔄',
      description: '检查应用是否有新版本',
      action: function () {
        // 显示检查更新通知
        popupManager.showNotice(
          () => {
            const frame = new NoticeNewFrame()
            frame.setMsg({ data: '正在检查更新...' })
            return frame.create()
          },
          { type: 'notice', width: 500, height: 60 },
          { text: '正在检查更新...', duration: 3000 }
        )
        // 调用 UpdateNewFrame 检查更新
        const updateFrame = new UpdateNewFrame()
        updateFrame
          .checkForUpdates()
          .then((res) => {
            popupManager.showNotice(
              () => {
                const frame = new NoticeNewFrame()
                frame.setMsg({ data: res?.msg || '检查更新完成' })
                return frame.create()
              },
              { type: 'notice', width: 500, height: 60 },
              { text: res?.msg || '检查更新完成', duration: 5000 }
            )
          })
          .catch((err) => {
            popupManager.showNotice(
              () => {
                const frame = new NoticeNewFrame()
                frame.setMsg({ data: '检查更新失败: ' + (err.message || '未知错误') })
                return frame.create()
              },
              { type: 'notice', width: 500, height: 60 },
              { text: '检查更新失败: ' + (err.message || '未知错误'), duration: 5000 }
            )
          })
      }
    },
    {
      id: 'settings',
      name: '设置',
      aliases: ['sz', '设置', 'settings'],
      category: 'tool',
      icon: '⚙️',
      description: '应用设置',
      action: function () { windowFactory.getMainPageFrame().showAndPage('settings') }
    },
    {
      id: 'shortcuts',
      name: '快捷键',
      aliases: ['kj', '快捷键', 'shortcuts', 'shortcut'],
      category: 'tool',
      icon: '⌨️',
      description: '自定义应用快捷键',
      action: function () { windowFactory.getMainPageFrame().showAndPage('shortcuts') }
    },
    {
      id: 'json-tool',
      name: 'JSON 工具',
      aliases: ['json', 'json工具', '格式化'],
      category: 'tool',
      icon: '🔧',
      description: 'JSON 格式化、压缩、转义、校验',
      action: function () {
        // 先隐藏主界面，再打开 JSON 工具窗口
        const mainPage = windowFactory.getMainPageFrame()
        if (mainPage.isAlive()) {
          mainPage.close()
        }
        windowFactory.createJsonToolFrame().show()
      }
    },
    {
      id: 'online',
      name: '联机',
      aliases: ['lj', '局域网', '网络', '设备发现', 'online'],
      category: 'tool',
      icon: '🌐',
      description: '查看在线设备，管理局域网连接',
      action: function () { windowFactory.getMainPageFrame().showAndPage('online') }
    },
    {
      id: 'file-transfer',
      name: '文件互传',
      aliases: ['wjhc', 'wj', '文件传输', 'filetransfer', 'lan', '局域网', '传输'],
      category: 'tool',
      icon: '📁',
      description: '局域网文件互传',
      action: function () { windowFactory.getMainPageFrame().showAndPage('fileTransfer') }
    }
  ]

  /**
   * 获取所有工具列表
   * @returns 工具列表
   */
  getTools(): Tool[] {
    return this.tools
  }

  /**
   * 搜索工具
   * @param query - 搜索关键词
   * @returns 搜索结果
   */
  searchTools(query: string): SearchResultItem[] {
    if (!query.trim()) return []

    const lowerQuery = query.toLowerCase()
    const results: SearchResultItem[] = []

    for (const tool of this.tools) {
      const name = tool.name.toLowerCase()
      const pinyin = this.getPinyinInitials(tool.name).toLowerCase()
      const aliases = tool.aliases.map(a => a.toLowerCase())
      const description = tool.description.toLowerCase()

      // 匹配规则：优先级从高到低，首条命中即终止
      const matchRules: Array<{ test: () => boolean; score: number; matchType: SearchResultItem['matchType'] }> = [
        { test: () => name === lowerQuery, score: 100, matchType: 'exact' },
        { test: () => name.startsWith(lowerQuery), score: 80, matchType: 'prefix' },
        { test: () => aliases.some(a => a === lowerQuery), score: 75, matchType: 'exact' },
        { test: () => aliases.some(a => a.startsWith(lowerQuery)), score: 70, matchType: 'prefix' },
        { test: () => pinyin.startsWith(lowerQuery), score: 60, matchType: 'pinyin' },
        { test: () => name.includes(lowerQuery), score: 40, matchType: 'fuzzy' },
        { test: () => aliases.some(a => a.includes(lowerQuery)), score: 35, matchType: 'fuzzy' },
        { test: () => pinyin.includes(lowerQuery), score: 30, matchType: 'fuzzy' },
        { test: () => this.isPinyinFuzzyMatch(pinyin, lowerQuery), score: 25, matchType: 'fuzzy' },
        { test: () => description.includes(lowerQuery), score: 20, matchType: 'fuzzy' },
      ]

      const matched = matchRules.find(r => r.test())
      if (!matched) continue

      results.push({
        id: tool.id,
        name: tool.name,
        aliases: tool.aliases,
        category: tool.category,
        icon: tool.icon,
        description: tool.description,
        score: matched.score,
        matchType: matched.matchType
      })
    }

    return results.sort((a, b) => b.score - a.score)
  }

  /**
   * 搜索剪贴板历史
   * @param query - 搜索关键词
   * @returns 搜索结果
   */
  async searchClipboard(query: string): Promise<SearchResultItem[]> {
    if (!query.trim()) return []

    try {
      // 动态导入剪贴板服务
      const { clipboardService } = await import('./clipboardService')
      const history = clipboardService.search(query)

      return history.slice(0, 10).map((item, index) => ({
        id: `clipboard-${item.id}`,
        name: item.content.substring(0, 50) + (item.content.length > 50 ? '...' : ''),
        aliases: [],
        category: 'clipboard',
        icon: '📋',
        description: item.content,
        score: 100 - index,
        matchType: 'fuzzy' as const
      }))
    } catch (error) {
      log.error('[SearchService] 搜索剪贴板失败:', error)
      return []
    }
  }

  /**
   * 搜索应用
   * @param query - 搜索关键词
   * @returns 搜索结果（当前返回空数组，预留扩展）
   */
  searchApps(_query: string): SearchResultItem[] {
    // 预留：后续可集成系统应用搜索（如 Windows 开始菜单、macOS Spotlight）
    return []
  }

  /**
   * 打开文件/文件夹
   * @param path - 文件路径
   */
  openFile(path: string): void {
    shell.openPath(path)
  }

  /**
   * 打开网页
   * @param url - 网址
   */
  openUrl(url: string): void {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    shell.openExternal(url)
  }

  /**
   * 执行工具动作
   * @param toolId - 工具 ID
   */
  executeTool(toolId: string): void {
    const tool = this.tools.find(t => t.id === toolId)
    if (tool) {
      tool.action()
    }
  }

  /**
   * 拼音模糊匹配：查询词的每个字符按顺序出现在拼音中
   * @param pinyin - 目标拼音
   * @param query - 查询词
   * @returns 是否匹配
   */
  private isPinyinFuzzyMatch(pinyin: string, query: string): boolean {
    let pinyinIndex = 0
    for (let i = 0; i < query.length; i++) {
      const char = query[i]
      // 在拼音中查找这个字符
      const found = pinyin.indexOf(char, pinyinIndex)
      if (found === -1) {
        return false
      }
      pinyinIndex = found + 1
    }
    return true
  }

  /**
   * 获取字符串的拼音首字母
   * @param str - 输入字符串
   * @returns 拼音首字母
   */
  private getPinyinInitials(str: string): string {
    const pinyinMap: Record<string, string> = {
      '预': 'y', '览': 'l', '倒': 'd', '计': 'j', '时': 's',
      '剪': 'j', '贴': 't', '板': 'b', '管': 'g', '理': 'l',
      '翻': 'f', '译': 'y', '设': 's', '置': 'z', '下': 'x',
      '载': 'z', '工': 'g', '具': 'j', '箱': 'x', '搜': 's',
      '索': 's', '框': 'k', '马': 'm', '克': 'k', '号': 'h',
      '颜': 'y', '色': 's', '取': 'q', '屏': 'p', '幕': 'm',
      '格': 'g', '式': 's', '化': 'h', '文': 'w', '件': 'j',
      '互': 'h', '传': 'c', '检': 'j', '查': 'c', '更': 'g',
      '新': 'x', '快': 'k', '捷': 'j', '键': 'j',
    }

    let result = ''
    let lastChar = ''
    for (const char of str) {
      if (pinyinMap[char]) {
        result += pinyinMap[char]
        lastChar = char
      } else if (/[a-zA-Z0-9]/.test(char)) {
        // 英文字母：如果是新单词的开头，取首字母
        if (!lastChar || !/[a-zA-Z]/.test(lastChar)) {
          result += char.toLowerCase()
        }
        lastChar = char
      } else {
        lastChar = char
      }
    }
    return result
  }
}

// 导出单例
export const searchService = new SearchService()
