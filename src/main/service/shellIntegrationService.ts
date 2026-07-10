/**
 * Shell 集成服务
 * @description 管理文件资源管理器的右键菜单集成
 * - Windows: 注册表 HKCU\Software\Classes\*\shell\ShareWithPrism
 * - macOS:   Automator 工作流 ~/Library/Services/分享到妙妙屋.workflow
 */
import { app } from 'electron'
import { exec } from 'child_process'
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import log from 'electron-log'

const execAsync = promisify(exec)

/** 菜单显示名称 */
const MENU_NAME = '分享到妙妙屋'

/** Windows 注册表路径 */
const REG_KEY = 'HKCU\\Software\\Classes\\*\\shell\\ShareWithPrism'

/** macOS Services 路径 */
const MACOS_SERVICES_DIR = join(
  require('os').homedir(),
  'Library',
  'Services'
)

/** macOS 工作流名称 */
const MACOS_WORKFLOW_NAME = `${MENU_NAME}.workflow`

/**
 * Shell 集成服务
 * @description 单例服务，管理文件资源管理器右键菜单
 */
class ShellIntegrationService {
  /**
   * 注册右键菜单
   * @description Windows 写入注册表，macOS 创建 Automator 工作流
   */
  async register(): Promise<void> {
    try {
      if (process.platform === 'win32') {
        await this.#registerWindows()
      } else if (process.platform === 'darwin') {
        await this.#registerMacOS()
      }
    } catch (err) {
      log.error('[ShellIntegration] 注册失败:', err)
      throw err
    }
  }

  /**
   * 注销右键菜单
   */
  async unregister(): Promise<void> {
    try {
      if (process.platform === 'win32') {
        await this.#unregisterWindows()
      } else if (process.platform === 'darwin') {
        await this.#unregisterMacOS()
      }
    } catch (err) {
      log.error('[ShellIntegration] 注销失败:', err)
      throw err
    }
  }

  /**
   * 检查右键菜单是否已注册
   * @returns 是否已注册
   */
  async isRegistered(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        return await this.#isRegisteredWindows()
      } else if (process.platform === 'darwin') {
        return await this.#isRegisteredMacOS()
      }
      return false
    } catch {
      return false
    }
  }

  // ── Windows 注册表 ──

  /**
   * Windows: 写入注册表
   *
   * 原理：注册表直接调用 PowerShell -File psf.ps1，不经过 cmd.exe。
   *       PowerShell -WindowStyle Hidden 完全无窗口。
   *       脚本将文件路径写入 %TEMP%\psf，然后尝试 HTTP 通知正在运行的应用。
   *       应用未运行时启动 Electron 隐藏窗口（单例锁让新实例立即退出）。
   *
   * HKCU\Software\Classes\*\shell\ShareWithPrism
   *   @="分享到妙妙屋"
   *   Icon="C:\path\to\prism.exe"
   *   MultiSelectModel="Document"
   * HKCU\Software\Classes\*\shell\ShareWithPrism\command
   *   @="powershell -WindowStyle Hidden ... -File \"%TEMP%\\psf.ps1\" \"%1\""
   */
  async #registerWindows(): Promise<void> {
    const exePath = app.getPath('exe')
    const appPath = app.getAppPath()
    const isDevExe = exePath.includes('node_modules')

    // ── 创建 psf.ps1（写 userData 目录，路径固定，无需 %TEMP% 环境变量） ──
    // 用单引号包围路径避免 PowerShell 解释特殊字符
    // exePath/appPath 中的单引号用 '' 转义（PowerShell 单引号转义规则）
    const ps1FilePath = join(app.getPath('userData'), 'psf.ps1')
    const escapedExe = exePath.replace(/'/g, "''")
    const escapedApp = appPath.replace(/'/g, "''")
    // 启动 Electron 的命令行参数部分
    const startArgs = isDevExe
      ? `-FilePath '${escapedExe}' -ArgumentList '${escapedApp}'`
      : `-FilePath '${escapedExe}'`

    const psScript = [
      '# 收集文件路径（来自 PowerShell -File 参数 $args）',
      '$paths = @($args | % { $_ })',
      'if ($paths.Count -eq 0) { exit }',
      '',
      '# 写入临时文件（供应用冷启动时读取）',
      '$tf = [IO.Path]::Combine($env:TEMP, "psf")',
      '[IO.File]::WriteAllText($tf, [string]::Join("|", $paths), [Text.Encoding]::UTF8)',
      '',
      '# 尝试 HTTP 通知正在运行的应用',
      '$pf = [IO.Path]::Combine($env:TEMP, "psf-port")',
      'if (Test-Path $pf) {',
      '  try {',
      '    $port = [IO.File]::ReadAllText($pf).Trim()',
      '    $body = @{ paths = $paths } | ConvertTo-Json',
      '    $null = Invoke-WebRequest -Uri "http://localhost:$port/share-local-files" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 2',
      '    exit 0',
      '  } catch { }',
      '}',
      '',
      '# 应用未运行，启动它（隐藏窗口，单例锁让新实例立即退出）',
      `Start-Process ${startArgs} -WindowStyle Hidden`
    ].join('\r\n')
    writeFileSync(ps1FilePath, psScript, 'utf-8')
    log.info('[ShellIntegration] psf.ps1 已创建:', ps1FilePath)

    // ── 注册表项 ──
    await execAsync(`REG ADD "${REG_KEY}" /ve /t REG_SZ /d "${MENU_NAME}" /f`)
    await execAsync(`REG ADD "${REG_KEY}" /v "Icon" /t REG_SZ /d "${exePath}" /f`)
    await execAsync(`REG ADD "${REG_KEY}" /v "MultiSelectModel" /t REG_SZ /d "Document" /f`)
    const cmdKey = `${REG_KEY}\\command`
    // 直接调用 PowerShell -File，无 cmd.exe 中转，无窗口
    // 路径已固定（userData），无需 %TEMP% 环境变量，REG ADD 无引号冲突
    const cmdValue = `powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "${ps1FilePath}" "%1"`
    const escapedValue = cmdValue.replace(/"/g, '\\"')
    await execAsync(`REG ADD "${cmdKey}" /ve /t REG_SZ /d "${escapedValue}" /f`)

    log.info('[ShellIntegration] Windows 右键菜单已注册（无窗口模式）')
  }

  /**
   * Windows: 删除注册表
   */
  async #unregisterWindows(): Promise<void> {
    await execAsync(`REG DELETE "${REG_KEY}" /f`).catch(() => {
      // 键不存在时忽略错误
    })
    // 清理辅助脚本（userData 目录）
    try {
      const fp = join(app.getPath('userData'), 'psf.ps1')
      if (existsSync(fp)) rmSync(fp)
    } catch { /* ignore */ }
    log.info('[ShellIntegration] Windows 右键菜单已注销')
  }

  /**
   * Windows: 检查注册表是否存在
   */
  async #isRegisteredWindows(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`REG QUERY "${REG_KEY}"`)
      return stdout.includes('ShareWithPrism')
    } catch {
      return false
    }
  }

  // ── macOS Automator Service ──

  /**
   * macOS: 创建 Automator 工作流
   * 生成 ~/Library/Services/分享到妙妙屋.workflow/Contents/{Info.plist, document.wflow}
   * 工作流接收 Finder 中的文件，通过 open -b 启动应用并传入文件路径
   */
  async #registerMacOS(): Promise<void> {
    const workflowPath = join(MACOS_SERVICES_DIR, MACOS_WORKFLOW_NAME)
    const contentsPath = join(workflowPath, 'Contents')
    const bundleId = app.getName() || 'com.electron.app'

    // 创建目录
    mkdirSync(contentsPath, { recursive: true })

    // Info.plist
    const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>${MENU_NAME}</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSRequiredContext</key>
      <dict>
        <key>NSExtensionServiceAllowsAnyApplication</key>
        <false/>
      </dict>
      <key>NSSendFileTypes</key>
      <array>
        <string>public.item</string>
      </array>
    </dict>
  </array>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>automator</string>
  <key>CFBundleIdentifier</key>
  <string>com.prism.share-service</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${MENU_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleSignature</key>
  <string>????</string>
  <key>CFBundleVersion</key>
  <string>1</string>
</dict>
</plist>`

    // document.wflow - Automator workflow definition
    // 使用 Run Shell Script action 接收文件路径并启动应用
    const wflow = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key>
  <string></string>
  <key>AMApplicationVersion</key>
  <string>2.10</string>
  <key>AMDocumentVersion</key>
  <string>2</string>
  <key>AMSerializer</key>
  <string>com.apple.Automator</string>
  <key>AMWorkflowActions</key>
  <array>
    <dict>
      <key>AMActionVersion</key>
      <string>2.0.5</string>
      <key>AMApplication</key>
      <string>iCal</string>
      <key>AMParameterProperties</key>
      <dict>
        <key>CMDocumentIsFilePath</key>
        <false/>
        <key>CMServiceHandlesFileURLs</key>
        <false/>
        <key>CMServiceHandlesURLs</key>
        <false/>
        <key>CMServiceHandlesText</key>
        <false/>
        <key>command</key>
        <string>for f in "$@"
do
  paths="$paths $f"
done
open -b "${bundleId}" --args --send-files $paths</string>
        <key>inputMethod</key>
        <string>as arguments</string>
        <key>settings</key>
        <dict>
          <key>output</key>
          <string>replace</string>
          <key>shell</key>
          <string>/bin/bash</string>
        </dict>
      </dict>
      <key>BundleIdentifier</key>
      <string>com.apple.automator.RunShellScript</string>
      <key>CFBundleIdentifier</key>
      <string>com.apple.automator.RunShellScript</string>
      <key>IsRequired</key>
      <false/>
      <key>Name</key>
      <string>Run Shell Script</string>
      <key>UUID</key>
      <string>prism-share-service-${Date.now()}</string>
    </dict>
  </array>
  <key>AMWorkflowBuildVersion</key>
  <string>0</string>
  <key>AMWorkflowType</key>
  <string>Service</string>
  <key>ApplicationVersion</key>
  <string>8.0</string>
</dict>
</plist>`

    writeFileSync(join(contentsPath, 'Info.plist'), infoPlist, 'utf-8')
    writeFileSync(join(contentsPath, 'document.wflow'), wflow, 'utf-8')

    log.info('[ShellIntegration] macOS 右键菜单已注册')
  }

  /**
   * macOS: 删除工作流
   */
  async #unregisterMacOS(): Promise<void> {
    const workflowPath = join(MACOS_SERVICES_DIR, MACOS_WORKFLOW_NAME)
    if (existsSync(workflowPath)) {
      rmSync(workflowPath, { recursive: true, force: true })
    }
    log.info('[ShellIntegration] macOS 右键菜单已注销')
  }

  /**
   * macOS: 检查工作流是否存在
   */
  async #isRegisteredMacOS(): Promise<boolean> {
    const workflowPath = join(MACOS_SERVICES_DIR, MACOS_WORKFLOW_NAME)
    return existsSync(workflowPath)
  }
}

// 导出单例
export const shellIntegrationService = new ShellIntegrationService()
