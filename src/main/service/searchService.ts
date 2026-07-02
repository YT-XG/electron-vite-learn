import { shell } from 'electron'
import { windowFactory } from '../frame'

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
      action: function () { windowFactory.createMarkdownPreviewFrame().show() }
    },
    {
      id: 'clipboard-manager',
      name: '剪贴板管理',
      aliases: ['cb', '剪贴板', '复制'],
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
      id: 'settings',
      name: '设置',
      aliases: ['sz', '设置', 'settings'],
      category: 'tool',
      icon: '⚙️',
      description: '应用设置',
      action: function () { windowFactory.getMainPageFrame().showAndPage('settings') }
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

      let score = 0
      let matchType: SearchResultItem['matchType'] = 'fuzzy'

      // 精确匹配
      if (name === lowerQuery) {
        score = 100
        matchType = 'exact'
      }
      // 前缀匹配
      else if (name.startsWith(lowerQuery)) {
        score = 80
        matchType = 'prefix'
      }
      // 别名前缀匹配
      else if (aliases.some(a => a.startsWith(lowerQuery))) {
        score = 70
        matchType = 'prefix'
      }
      // 拼音首字母匹配
      else if (pinyin.startsWith(lowerQuery)) {
        score = 60
        matchType = 'pinyin'
      }
      // 包含匹配
      else if (name.includes(lowerQuery)) {
        score = 40
        matchType = 'fuzzy'
      }
      // 拼音包含匹配
      else if (pinyin.includes(lowerQuery)) {
        score = 30
        matchType = 'fuzzy'
      }

      if (score > 0) {
        results.push({
          ...tool,
          score,
          matchType
        })
      }
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
      console.error('搜索剪贴板失败:', error)
      return []
    }
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
      '格': 'g', '式': 's', '化': 'h',
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
