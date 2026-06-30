/**
 * Claude Code 状态监控服务
 * @description 通过 Hook 脚本拦截 Claude Code CLI 的事件，提供权限请求交互
 *
 * 工作流程：
 * 1. 安装 Hook 脚本到 ~/.claude/settings.json
 * 2. 启动 HTTP 服务器监听 127.0.0.1:17861
 * 3. Claude Code 触发 Hook → HTTP POST → 主进程收到事件
 * 4. 权限请求：暂存 HTTP 响应，显示权限确认窗口
 * 5. 用户点击按钮 → 写回 HTTP 响应 → Claude Code 继续执行
 */
import { app } from 'electron'
import http from 'http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import log from 'electron-log'
import { windowFactory } from '../frame'

/** 权限决策类型 */
export type PermissionDecision = 'allow' | 'always' | 'deny'

/** Hook 事件类型 */
export interface ClaudeCodeHookEvent {
  id: string
  sessionId: string
  eventName: string
  timestamp: number
  toolName: string | null
  raw: Record<string, unknown>
}

/** 权限等待器 */
interface PermissionWaiter {
  response: http.ServerResponse
  timer: ReturnType<typeof setTimeout>
  event: ClaudeCodeHookEvent
}

/** 权限请求信息（发送给渲染进程） */
export interface PermissionRequestInfo {
  sessionId: string
  toolName: string
  command: string
  description: string
}

// ── 常量 ──
const DEFAULT_PORT = 17861
/** 权限等待超时：10 分钟后回退到 Claude Code 默认交互 */
const PERMISSION_WAIT_TIMEOUT_MS = 10 * 60 * 1000
/** Hook 脚本标识，用于识别和清理托管的 Hook */
const MANAGED_MARKER = 'electron-vite-learn-claude-code'
/** 监听的 Hook 事件列表 */
const HOOK_EVENTS: Array<{ name: string; matcher?: string; timeout?: number }> = [
  { name: 'SessionStart' },
  { name: 'SessionEnd' },
  { name: 'Stop' },
  { name: 'StopFailure' },
  { name: 'PermissionRequest', matcher: '*', timeout: 86400 }
]

// ── 工具函数 ──
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function buildManagedCommand(scriptPath: string, eventName: string): string {
  return `${shellQuote(process.execPath)} ${shellQuote(scriptPath)} ${shellQuote(eventName)} # ${MANAGED_MARKER}`
}

function managedHook(command: string, matcher?: string, timeout?: number): Record<string, unknown> {
  const hook: Record<string, unknown> = { type: 'command', command }
  if (typeof timeout === 'number') hook.timeout = timeout
  const group: Record<string, unknown> = { hooks: [hook] }
  if (matcher) group.matcher = matcher
  return group
}

function removeManagedGroups(groups: unknown): Record<string, unknown>[] {
  if (!Array.isArray(groups)) return []
  return groups
    .map((item) => asRecord(item))
    .map((group) => {
      const hooks = Array.isArray(group.hooks) ? group.hooks : []
      return {
        ...group,
        hooks: hooks.filter((hook) => !String(asRecord(hook).command ?? '').includes(MANAGED_MARKER))
      }
    })
    .filter((group) => Array.isArray(group.hooks) && group.hooks.length > 0)
}

/**
 * 生成 Hook 脚本内容
 * @param port - HTTP 服务器端口
 * @returns Hook 脚本的 CommonJS 代码
 */
function createHookScript(port: number): string {
  return `
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hookEventName = process.argv[2] || null;
let input = '';

function normalize(value) {
  return String(value || '').replace(/\\\\/g, '/').toLowerCase();
}

function readJsonLine(filePath, fromEnd) {
  try {
    const text = fs.readFileSync(filePath, 'utf8').trim();
    const lines = text.split(/\\r?\\n/);
    const selected = fromEnd ? lines.slice(-80).reverse() : lines.slice(0, 80);
    let _parsed = null;
    selected.some((line) => {
      try { _parsed = JSON.parse(line); return true; } catch (_) { return false; }
    });
    return _parsed;
  } catch (_) {}
  return null;
}

function entryCwd(filePath) {
  const first = readJsonLine(filePath, false);
  if (first && typeof first.cwd === 'string' && first.cwd) return first.cwd;
  const recent = readJsonLine(filePath, true);
  if (recent && typeof recent.cwd === 'string' && recent.cwd) return recent.cwd;
  return null;
}

function collectJsonlFiles(dir, output, deadline) {
  if (Date.now() > deadline || output.length > 240) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  let _done = false;
  entries.forEach((entry) => {
    if (_done) return;
    if (Date.now() > deadline || output.length > 240) { _done = true; return; }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'subagents') collectJsonlFiles(fullPath, output, deadline);
      return;
    }
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      try { output.push({ path: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs }); } catch (_) {}
    }
  });
}

function latestTranscriptForCwd(cwd) {
  const root = path.join(os.homedir(), '.claude', 'projects');
  const files = [];
  collectJsonlFiles(root, files, Date.now() + 650);
  const normalizedCwd = normalize(cwd);
  const recentFiles = files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 80);
  const _matched = recentFiles.find((file) => {
    const fileCwd = entryCwd(file.path);
    return fileCwd && normalize(fileCwd) === normalizedCwd;
  });
  if (_matched) return _matched.path;
  return recentFiles[0] ? recentFiles[0].path : null;
}

function enrichPayload(payload) {
  const cwd = payload.cwd || payload.project_dir || payload.projectDir || process.cwd();
  if (!payload.cwd) payload.cwd = cwd;
  if (!payload.transcript_path && !payload.transcriptPath) {
    const transcriptPath = latestTranscriptForCwd(cwd);
    if (transcriptPath) payload.transcript_path = transcriptPath;
  }
  return payload;
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = input.trim() ? JSON.parse(input) : {}; } catch (error) { payload = { parseError: String(error), raw: input }; }
  if (hookEventName && !payload.hook_event_name) payload.hook_event_name = hookEventName;
  payload = enrichPayload(payload);
  const body = JSON.stringify(payload);
  const isPermission = hookEventName === 'PermissionRequest';

  const req = http.request({
    hostname: '127.0.0.1',
    port: ${port},
    path: '/claude-code/hook',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    timeout: isPermission ? ${PERMISSION_WAIT_TIMEOUT_MS + 5000} : 1500
  }, res => {
    let resBody = '';
    res.setEncoding('utf8');
    res.on('data', c => { resBody += c; });
    res.on('end', () => {
      if (isPermission) {
        try {
          const parsed = JSON.parse(resBody || '{}');
          const decision = parsed && parsed.decision;
          if (decision === 'deny') {
            process.stdout.write(JSON.stringify({
              continue: true,
              suppressOutput: true,
              hookSpecificOutput: {
                hookEventName: 'PermissionRequest',
                decision: { behavior: 'deny', message: 'User denied the permission request', interrupt: false }
              }
            }));
          } else if (decision === 'allow' || decision === 'always') {
            process.stdout.write(JSON.stringify({
              continue: true,
              suppressOutput: true,
              hookSpecificOutput: {
                hookEventName: 'PermissionRequest',
                decision: { behavior: 'allow' }
              }
            }));
          }
        } catch (_) {}
      }
      process.exit(0);
    });
  });

  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.on('error', () => process.exit(0));
  req.write(body);
  req.end();
});

if (hookEventName !== 'PermissionRequest') setTimeout(() => process.exit(0), 2500);
`
}

class ClaudeCodeService {
  private server: http.Server | null = null
  private port = DEFAULT_PORT
  private settingsPath: string = ''
  private hookScriptPath: string = ''
  /** 等待用户授权决策的 Hook 请求 */
  private permissionWaiters = new Map<string, PermissionWaiter>()
  /** 事件 ID 计数器 */
  private eventCounter = 0
  /** 活跃会话计数 */
  private sessionCount = 0
  /** 隐藏状态通知的定时器 */
  private hideTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 初始化服务
   * - 计算文件路径
   * - 注册 IPC 通道
   * - 自动安装 Hook 并启动 HTTP 服务器
   */
  async init(): Promise<void> {
    this.settingsPath = join(app.getPath('home'), '.claude', 'settings.json')
    this.hookScriptPath = join(app.getPath('userData'), 'claude-code-hook.cjs')
    this.registerIPC()

    // 自动安装 Hook 并启动 HTTP 服务器
    try {
      await this.installHook()
      log.info('[ClaudeCode] Hook 自动安装成功')
    } catch (error) {
      log.warn('[ClaudeCode] Hook 自动安装失败（非致命）:', error)
    }

    log.info('[ClaudeCode] 服务初始化完成')
  }

  /**
   * 注册 IPC 通道
   * @description 使用 to-service-ClaudeCodeService 前缀，遵循项目规范
   */
  private registerIPC(): void {
    const { ipcMain } = require('electron')

    // 安装 Hook
    ipcMain.handle('to-service-ClaudeCodeService:installHook', async () => {
      return this.installHook()
    })

    // 卸载 Hook
    ipcMain.handle('to-service-ClaudeCodeService:uninstallHook', async () => {
      return this.uninstallHook()
    })

    // 解决权限请求
    ipcMain.handle(
      'to-service-ClaudeCodeService:resolvePermission',
      async (_event: unknown, sessionId: string, decision: PermissionDecision) => {
        return this.resolvePermission(sessionId, decision)
      }
    )

    // 检查 Hook 是否已安装
    ipcMain.handle('to-service-ClaudeCodeService:isInstalled', async () => {
      return this.isHookInstalled()
    })

    // 检查服务器是否运行
    ipcMain.handle('to-service-ClaudeCodeService:isRunning', async () => {
      return this.server !== null
    })
  }

  /**
   * 启动 HTTP 服务器
   * @description 监听 127.0.0.1:17861，接收 Hook 脚本的 HTTP POST 请求
   */
  async startServer(): Promise<void> {
    if (this.server) return

    // 写入 Hook 脚本文件
    mkdirSync(dirname(this.hookScriptPath), { recursive: true })
    writeFileSync(this.hookScriptPath, createHookScript(this.port), 'utf-8')

    await new Promise<void>((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res))
      this.server.listen(this.port, '127.0.0.1', () => {
        log.info(`[ClaudeCode] HTTP 服务器已启动: http://127.0.0.1:${this.port}/claude-code/hook`)
        resolve()
      })
      this.server.on('error', (err) => {
        log.error('[ClaudeCode] HTTP 服务器启动失败:', err)
        this.server = null
        resolve()
      })
    })
  }

  /**
   * 停止 HTTP 服务器
   * @description 释放所有等待中的权限请求，关闭服务器
   */
  stopServer(): void {
    if (!this.server) return

    // 释放所有等待中的权限请求
    Array.from(this.permissionWaiters.keys()).forEach((sessionId) => {
      this.respondPermission(sessionId, null)
    })

    this.server.close()
    this.server = null
    log.info('[ClaudeCode] HTTP 服务器已停止')
  }

  /**
   * 处理 HTTP 请求
   * @description 接收 Hook 脚本发送的事件，权限请求会被暂存等待用户决策
   */
  private handleRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
    if (request.method !== 'POST' || request.url !== '/claude-code/hook') {
      response.writeHead(404)
      response.end()
      return
    }

    let body = ''
    request.setEncoding('utf-8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      try {
        const payload = asRecord(JSON.parse(body || '{}'))
        const eventName = String(payload.hook_event_name || payload.hookEventName || '')
        const sessionId = String(payload.session_id || payload.sessionId || 'unknown')

        // 构造事件对象
        const event: ClaudeCodeHookEvent = {
          id: `evt_${++this.eventCounter}_${Date.now()}`,
          sessionId,
          eventName,
          timestamp: Date.now(),
          toolName: this.extractToolName(payload),
          raw: payload
        }

        log.info(`[ClaudeCode] 收到事件: ${eventName} (session: ${sessionId})`)

        // 权限请求：暂存响应，等待用户决策
        if (eventName === 'PermissionRequest') {
          this.respondPermission(sessionId, null) // 清理同会话的旧等待
          const timer = setTimeout(() => {
            this.respondPermission(sessionId, null)
          }, PERMISSION_WAIT_TIMEOUT_MS)
          this.permissionWaiters.set(sessionId, { response, timer, event })

          // 提取权限请求信息并显示确认窗口
          const permissionInfo = this.extractPermissionInfo(event)

          // 显示"等待权限"状态
          windowFactory.getNoticeManager().showClaudeCodeStatus(
            'waiting_permission',
            `⏳ 等待权限: ${permissionInfo.toolName}`
          )

          this.showPermissionNotice(permissionInfo)
          return
        }

        // 非权限请求：显示简短通知
        this.showEventNotification(event)

        // 立即返回 200
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: true }))
      } catch (error) {
        log.error('[ClaudeCode] 处理请求失败:', error)
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: String(error) }))
      }
    })
  }

  /**
   * 从 Hook payload 中提取工具名称
   */
  private extractToolName(payload: Record<string, unknown>): string | null {
    // 尝试多种可能的字段名
    const toolName = payload.tool_name || payload.toolName
    if (typeof toolName === 'string') return toolName

    // 从 tool_input 中提取
    const toolInput = asRecord(payload.tool_input || payload.toolInput || payload.input)
    if (toolInput.name) return String(toolInput.name)

    return null
  }

  /**
   * 从权限请求事件中提取权限请求信息
   */
  private extractPermissionInfo(event: ClaudeCodeHookEvent): PermissionRequestInfo {
    const raw = event.raw
    const toolInput = asRecord(raw.tool_input || raw.toolInput || raw.input)
    const toolName = event.toolName || String(toolInput.name || 'Unknown')
    const command = typeof toolInput.command === 'string' ? toolInput.command : ''
    const description = typeof toolInput.description === 'string' ? toolInput.description : ''

    return {
      sessionId: event.sessionId,
      toolName,
      command,
      description
    }
  }

  /**
   * 显示权限确认窗口
   * @description 创建 PermissionNoticeFrame 并显示权限请求信息
   */
  private showPermissionNotice(info: PermissionRequestInfo): void {
    const noticeFrame = windowFactory.getPermissionNoticeFrame()
    noticeFrame.showPermissionNotice(info)
    log.info(`[ClaudeCode] 显示权限确认窗口: ${info.toolName}`)
  }

  /**
   * 显示事件通知
   * @description 非权限事件通过 NoticeManager 更新常驻状态通知
   */
  private showEventNotification(event: ClaudeCodeHookEvent): void {
    const noticeManager = windowFactory.getNoticeManager()

    switch (event.eventName) {
      case 'SessionStart':
        this.sessionCount++
        this.cancelHideTimer()
        // 显示"会话运行中"状态
        noticeManager.showClaudeCodeStatus('running', '🟢 Claude Code 会话运行中')
        // 同时显示一个简短通知
        noticeManager.show({
          text: '🟢 Claude Code 会话已开始',
          duration: 3000
        })
        break

      case 'SessionEnd':
        this.sessionCount = Math.max(0, this.sessionCount - 1)
        if (this.sessionCount === 0) {
          // 延迟 3 秒后隐藏状态通知
          this.hideTimer = setTimeout(() => {
            noticeManager.hideClaudeCodeStatus()
          }, 3000)
        }
        // 显示简短通知
        noticeManager.show({
          text: '🏁 Claude Code 会话已结束',
          duration: 3000
        })
        break

      case 'Stop':
        // 更新状态为"任务完成"
        noticeManager.updateClaudeCodeStatus('completed', '✅ 任务完成')
        // 2 秒后恢复为"运行中"
        setTimeout(() => {
          if (this.sessionCount > 0) {
            noticeManager.updateClaudeCodeStatus('running', '🟢 Claude Code 会话运行中')
          }
        }, 2000)
        break

      case 'StopFailure':
        // 更新状态为"任务异常结束"
        noticeManager.updateClaudeCodeStatus('completed', '❌ 任务异常结束')
        // 2 秒后恢复为"运行中"
        setTimeout(() => {
          if (this.sessionCount > 0) {
            noticeManager.updateClaudeCodeStatus('running', '🟢 Claude Code 会话运行中')
          }
        }, 2000)
        break

      default:
        // 其他事件不处理
        return
    }
  }

  /**
   * 向暂存的 Hook 请求写回授权决策
   * @param sessionId - 会话 ID
   * @param decision - 授权决策，null 表示超时/取消
   * @returns 是否成功写回
   */
  private respondPermission(sessionId: string, decision: PermissionDecision | null): boolean {
    const waiter = this.permissionWaiters.get(sessionId)
    if (!waiter) return false

    clearTimeout(waiter.timer)
    this.permissionWaiters.delete(sessionId)

    try {
      waiter.response.writeHead(200, { 'content-type': 'application/json' })
      waiter.response.end(JSON.stringify({ ok: true, decision }))
    } catch {
      // 响应已结束，忽略
    }

    log.info(`[ClaudeCode] 权限决策已写回: session=${sessionId}, decision=${decision}`)
    return true
  }

  /**
   * 解决权限请求（供 IPC 调用）
   * @param sessionId - 会话 ID
   * @param decision - 用户的授权决策
   */
  resolvePermission(sessionId: string, decision: PermissionDecision): void {
    this.respondPermission(sessionId, decision)
  }

  /**
   * 安装 Hook 到 ~/.claude/settings.json
   * @returns 操作结果
   */
  async installHook(): Promise<{ success: boolean; message: string }> {
    try {
      await this.startServer()

      mkdirSync(dirname(this.settingsPath), { recursive: true })

      // 读取现有配置
      let root: Record<string, unknown> = {}
      if (existsSync(this.settingsPath)) {
        root = asRecord(JSON.parse(readFileSync(this.settingsPath, 'utf-8')))
      }

      // 管理 hooks 配置
      const hooks = asRecord(root.hooks)
      HOOK_EVENTS.forEach((spec) => {
        const currentGroups = removeManagedGroups(hooks[spec.name])
        hooks[spec.name] = [...currentGroups, managedHook(buildManagedCommand(this.hookScriptPath, spec.name), spec.matcher, spec.timeout)]
      })

      // 写入配置
      writeFileSync(this.settingsPath, JSON.stringify({ ...root, hooks }, null, 2), 'utf-8')

      log.info('[ClaudeCode] Hook 已安装')
      return { success: true, message: 'Claude Code 监控 Hook 已启用' }
    } catch (error) {
      log.error('[ClaudeCode] 安装 Hook 失败:', error)
      return { success: false, message: String(error) }
    }
  }

  /**
   * 卸载 Hook
   * @returns 操作结果
   */
  async uninstallHook(): Promise<{ success: boolean; message: string }> {
    try {
      if (!existsSync(this.settingsPath)) {
        return { success: true, message: 'Claude Code 配置不存在' }
      }

      const root = asRecord(JSON.parse(readFileSync(this.settingsPath, 'utf-8')))
      const hooks = asRecord(root.hooks)

      // 清理所有托管的 Hook 分组
      Object.keys(hooks).forEach((name) => {
        const currentGroups = removeManagedGroups(hooks[name])
        if (currentGroups.length > 0) {
          hooks[name] = currentGroups
        } else {
          delete hooks[name]
        }
      })

      // 写入配置
      const nextRoot = Object.keys(hooks).length > 0 ? { ...root, hooks } : { ...root }
      if (Object.keys(hooks).length === 0) delete nextRoot.hooks
      writeFileSync(this.settingsPath, JSON.stringify(nextRoot, null, 2), 'utf-8')

      this.stopServer()
      log.info('[ClaudeCode] Hook 已卸载')
      return { success: true, message: 'Claude Code 监控 Hook 已关闭' }
    } catch (error) {
      log.error('[ClaudeCode] 卸载 Hook 失败:', error)
      return { success: false, message: String(error) }
    }
  }

  /**
   * 检查 Hook 是否已安装
   */
  isHookInstalled(): boolean {
    try {
      if (!existsSync(this.settingsPath)) return false
      return readFileSync(this.settingsPath, 'utf-8').includes(MANAGED_MARKER)
    } catch {
      return false
    }
  }

  /**
   * 取消隐藏定时器
   */
  private cancelHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }

  /**
   * 销毁服务（应用退出时调用）
   */
  destroy(): void {
    this.cancelHideTimer()
    this.stopServer()
    // 销毁状态通知窗口
    windowFactory.getNoticeManager().destroyClaudeCodeStatus()
    log.info('[ClaudeCode] 服务已销毁')
  }
}

export const claudeCodeService = new ClaudeCodeService()
