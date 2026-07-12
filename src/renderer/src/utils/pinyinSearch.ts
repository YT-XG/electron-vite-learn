/**
 * 拼音首字母搜索工具
 * @description 使用 pinyin-pro 库实现中文拼音首字母模糊匹配
 *              覆盖所有 Unicode 汉字，不再依赖手写映射表
 */
import { pinyin } from 'pinyin-pro'

/**
 * 获取字符串的拼音首字母
 * @param str - 输入字符串
 * @returns 拼音首字母（去空格，小写）
 */
function getPinyinInitials(str: string): string {
  // pinyin-pro 返回空格分隔的每个字的首字母
  // 例: "中文" → "z w", "Hello世界" → "h e l l o s j"
  return pinyin(str, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '')
}

/**
 * 搜索结果项接口
 */
export interface SearchableItem {
  id: string
  name: string
  aliases?: string[]
  category: string
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
  item: SearchableItem
  score: number
  matchType: 'exact' | 'prefix' | 'pinyin' | 'fuzzy'
}

/**
 * 拼音首字母搜索
 * @param items - 可搜索的项目列表
 * @param query - 搜索关键词
 * @returns 搜索结果，按分数排序
 */
export function pinyinSearch<T extends SearchableItem>(items: T[], query: string): SearchResult[] {
  if (!query.trim()) return []

  const lowerQuery = query.toLowerCase()
  const results: SearchResult[] = []

  for (const item of items) {
    const name = item.name.toLowerCase()
    const pinyinInitials = getPinyinInitials(item.name).toLowerCase()
    const aliases = (item.aliases || []).map(a => a.toLowerCase())

    let score = 0
    let matchType: SearchResult['matchType'] = 'fuzzy'

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
    else if (pinyinInitials.startsWith(lowerQuery)) {
      score = 60
      matchType = 'pinyin'
    }
    // 包含匹配
    else if (name.includes(lowerQuery)) {
      score = 40
      matchType = 'fuzzy'
    }
    // 拼音包含匹配
    else if (pinyinInitials.includes(lowerQuery)) {
      score = 30
      matchType = 'fuzzy'
    }

    if (score > 0) {
      results.push({ item, score, matchType })
    }
  }

  // 按分数降序排序
  return results.sort((a, b) => b.score - a.score)
}
