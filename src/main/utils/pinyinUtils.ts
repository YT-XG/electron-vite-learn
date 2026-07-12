/**
 * 拼音首字母工具
 * @description 使用 pinyin-pro 库实现中文拼音首字母提取与匹配
 *              覆盖所有 Unicode 汉字，不再依赖手写映射表
 *
 * 使用说明：
 *   getPinyinInitials('新增退货中心')  => 'xzthzx'
 *   matchPinyin('新增退货中心', 'xz')  => true
 */
import { pinyin } from 'pinyin-pro'

/**
 * 获取字符串的拼音首字母
 * @param str - 输入字符串
 * @returns 拼音首字母串（小写），非中文/字母数字字符被忽略
 *
 * @example
 * getPinyinInitials('新增退货中心') => 'xzthzx'
 * getPinyinInitials('Hello World') => 'helloworld'
 * getPinyinInitials('API 测试') => 'apics'
 */
export function getPinyinInitials(str: string): string {
  // pinyin-pro 返回空格分隔的每个字/字符的首字母
  // 例: "中文" → "z w", "Hello World" → "H e l l o   W o r l d"
  // 去空格 → 转小写 → 得到连续的首字母串
  return pinyin(str, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '').toLowerCase()
}

/**
 * 判断字符串的拼音首字母是否匹配查询
 * @param text - 原始文本
 * @param query - 拼音首字母查询（小写）
 * @returns 是否匹配
 *
 * @example
 * matchPinyin('新增退货中心', 'xzthzx') => true  // 完整匹配
 * matchPinyin('新增退货中心', 'xz') => true        // 前缀匹配
 * matchPinyin('新增退货中心', 'thzx') => true      // 中间匹配
 * matchPinyin('新增退货中心', 'abc') => false       // 不匹配
 */
export function matchPinyin(text: string, query: string): boolean {
  if (!query || !text) return false
  const pinyin = getPinyinInitials(text)
  const lowerQuery = query.toLowerCase()
  return pinyin.includes(lowerQuery)
}

/**
 * 搜索数组中的项，支持拼音首字母匹配
 * @param items - 要搜索的项列表
 * @param query - 搜索关键词
 * @param textField - 项中用于匹配的字段名
 * @returns 拼音匹配的项
 */
export function filterByPinyin<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  textField: keyof T = 'content' as keyof T
): T[] {
  if (!query.trim() || !items.length) return []
  const lowerQuery = query.toLowerCase()
  return items.filter((item) => {
    const text = String(item[textField] ?? '')
    return matchPinyin(text, lowerQuery)
  })
}
