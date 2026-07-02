/**
 * 拼音首字母搜索工具
 * @description 支持中文拼音首字母模糊匹配
 */

/**
 * 拼音首字母映射表（常用汉字）
 */
const PINYIN_MAP: Record<string, string> = {
  '预': 'y', '览': 'l', '倒': 'd', '计': 'j', '时': 's',
  '剪': 'j', '贴': 't', '板': 'b', '管': 'g', '理': 'l',
  '翻': 'f', '译': 'y', '设': 's', '置': 'z', '下': 'x',
  '载': 'z', '工': 'g', '具': 'j', '箱': 'x', '搜': 's',
  '索': 's', '框': 'k', '马': 'm', '克': 'k', '号': 'h',
  '颜': 'y', '色': 's', '取': 'q', '屏': 'p', '幕': 'm',
  '格': 'g', '式': 's', '化': 'h',
  '算': 's', '器': 'q', '记': 'j', '事': 's',
  '本': 'b', '密': 'm', '码': 'm', '生': 's', '成': 'c',
  '随': 's', '机': 'j', '数': 's',
  '正': 'z', '则': 'z', '表': 'b', '达': 'd',
  '编': 'b', '解': 'j',
  '进': 'j', '制': 'z', '转': 'z', '换': 'h',
  '地': 'd', '址': 'z', '查': 'c',
  '端': 'd', '口': 'k', '扫': 's', '描': 'm',
  '网': 'w', '页': 'y', '截': 'j', '图': 't',
  '文': 'w', '件': 'j', '压': 'y', '缩': 's',
  '备': 'b', '忘': 'w', '录': 'l',
  '日': 'r', '历': 'l', '提': 't', '醒': 'x',
  '快': 'k', '捷': 'j', '指': 'z', '令': 'l',
  '代': 'd', '片': 'p', '段': 'd',
  '选': 'x', '择': 'z',
  '字': 'z', '体': 't',
  '主': 'z', '题': 't', '切': 'q',
  '背': 'b', '景': 'j',
  '壁': 'b', '纸': 'z',
  '系': 'x', '统': 't', '信': 'x', '息': 'x',
  '性': 'x', '能': 'n', '监': 'j', '控': 'k',
  '络': 'l', '状': 'z', '态': 't',
  '磁': 'c', '盘': 'p', '空': 'k', '间': 'j',
  '程': 'c',
  '服': 'f', '务': 'w',
  '据': 'j', '库': 'k',
  '接': 'j',
  '邮': 'y', '发': 'f', '送': 's',
  '短': 'd', '验': 'y', '证': 'z',
  '支': 'z', '付': 'f', '宝': 'b', '微': 'w',
  '二': 'e', '维': 'w',
  '条': 't', '形': 'x',
  '追': 'z', '踪': 'g',
  '身': 's', '份': 'f',
  '银': 'y', '行': 'h', '卡': 'k',
  '加': 'j',
  '档': 'd',
  '频': 'p',
}

/**
 * 获取字符串的拼音首字母
 * @param str - 输入字符串
 * @returns 拼音首字母
 */
function getPinyinInitials(str: string): string {
  let result = ''
  for (const char of str) {
    if (PINYIN_MAP[char]) {
      result += PINYIN_MAP[char]
    } else if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toLowerCase()
    }
  }
  return result
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
    const pinyin = getPinyinInitials(item.name).toLowerCase()
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
      results.push({ item, score, matchType })
    }
  }

  // 按分数降序排序
  return results.sort((a, b) => b.score - a.score)
}
