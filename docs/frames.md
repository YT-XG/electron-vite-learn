# Window Frame Modules

> Documentation for all window frame modules in the Electron-Vite-Learn project.
> Extracted and consolidated from `CLAUDE.md`.

---

## Table of Contents

1. [Window Architecture Overview](#window-architecture-overview)
2. [BaseFrame](#baseframe)
3. [WindowFactory](#windowfactory)
4. [PopupManager](#popupmanager)
5. [PopupItem](#popupitem)
6. [NoticeNewFrame](#noticenewframe)
7. [PermissionNoticeFrame](#permissionnoticeframe)
8. [UpdateNewFrame](#updatenewframe)
9. [MainPageFrame](#mainpageframe)
10. [SearchBoxFrame](#searchboxframe)
11. [MarkdownPreviewFrame](#markdownpreviewframe)
12. [ContextMenuFrame](#contextmenuframe)
13. [SnippetPickerFrame](#snippetpickerframe)
14. [ShareSelectFrame](#shareselectframe)

---

## Window Architecture Overview

The window system is organized into two distinct categories, managed by separate managers:

- **Normal Windows** -- managed by `WindowFactory`
- **Notification Popups** -- managed by `PopupManager`

### Design Patterns

- **Factory Pattern**: `WindowFactory` creates and manages normal window lifecycles
- **Template Method Pattern**: `BaseFrame` provides reusable window creation, destruction, and IPC logic
- **Mediator Pattern**: `PopupManager` coordinates notification windows (slot allocation, animation timing)

### Key Rules

- All windows **must** inherit `BaseFrame`
- `BaseFrame` is the **only** place that calls `new BrowserWindow()`
- Window communication follows strict naming conventions (see [BaseFrame IPC](#ipc-communication-methods))

### Architecture Diagram

```
WindowFactory                          PopupManager
  ├── MainPageFrame                      ├── slots[5] 固定槽位
  ├── SearchBoxFrame                     ├── NoticeNewFrame
  ├── MarkdownPreviewFrame               ├── UpdateNewFrame
  ├── ContextMenuFrame                   ├── PermissionNoticeFrame
  ├── JsonToolFrame                      └── ShareSelectFrame (通过 PopupManager 显示)
  ├── SnippetPickerFrame
  └── ShareSelectFrame (通过 WindowFactory 创建)

所有窗口都继承 BaseFrame（唯一 new BrowserWindow 入口）
```

### Source Directory

All frame modules are located under `src/main/frame/`.

```
src/main/frame/
  ├── index.ts                 # Unified exports
  ├── BaseFrame.ts             # Window base class
  ├── WindowFactory.ts         # Window factory
  ├── PopupManager.ts          # Popup manager (notifications)
  ├── PopupItem.ts             # Popup metadata wrapper
  ├── MainPageFrame.ts         # Main application window
  ├── SearchBoxFrame.ts        # Global search box
  ├── MarkdownPreviewFrame.ts  # Markdown preview
  ├── ContextMenuFrame.ts      # Right-click menu
  ├── SnippetPickerFrame.ts    # Snippet picker
  ├── ShareSelectFrame.ts      # Device selection popup
  ├── NoticeNewFrame.ts        # Notification popup
  ├── PermissionNoticeFrame.ts # Claude Code permission popup
  └── UpdateNewFrame.ts        # Update notification popup
```

---

## BaseFrame

**File**: `src/main/frame/BaseFrame.ts`

The base class for all window types. Encapsulates common window creation, destruction, and IPC registration logic.

### Responsibilities

- Creating `BrowserWindow` instances (the only class that directly instantiates one)
- Registering and cleaning up IPC handlers
- Managing window lifecycle (show, hide, close, destroy)
- Providing a standard communication interface between main and renderer processes

### IPC Communication Methods

All Frame classes use these four standardized communication methods:

| Method      | Direction       | Type     | Description                              |
|-------------|-----------------|----------|------------------------------------------|
| `recvOne`   | Renderer -> Main  | Notification | Renderer sends a one-way message to main    |
| `recvTwo`   | Renderer -> Main  | Request  | Renderer sends a request and expects a reply |
| `sendOne`   | Main -> Renderer | Notification | Main sends a one-way message to renderer    |
| `sendTwo`   | Main -> Renderer | Request  | Main sends a request and expects a reply     |

### Channel Naming Convention

- Renderer -> Main: `to-main-{主进程窗口名}:{方法名}`
- Main -> Renderer: `to-renderer-{渲染组件名}:{方法名}`

### Usage Example

```typescript
import BaseFrame from './BaseFrame'

export default class MyFrame extends BaseFrame {
  protected readonly options: BrowserWindowConstructorOptions = { /* ... */ }
  protected readonly routePath: string = '/myRoute'

  protected registerIPC(): void {
    super.registerIPC()

    // Renderer -> Main one-way (notification)
    this.recvOne('to-main-MyFrame:onReady', () => {
      console.log('Renderer is ready')
    })

    // Renderer -> Main two-way (request)
    this.recvTwo('to-main-MyFrame:getData', (event, id) => {
      return { id, name: 'test' }
    })

    // Main -> Renderer one-way (notification)
    this.sendOne('to-renderer-MyPage:updateAvailable', { version: '1.0.0' })

    // Main -> Renderer two-way (request, waits for renderer response)
    const rendererData = await this.sendTwo('to-renderer-MyPage:getUserInfo', 5000, userId)
  }
}
```

---

## WindowFactory

**File**: `src/main/frame/WindowFactory.ts`

Manages the creation and lifecycle of **normal** (non-popup) windows.

### Managed Windows

| Window              | Description                              |
|---------------------|------------------------------------------|
| MainPageFrame       | Main application window                  |
| SearchBoxFrame      | Global search box                        |
| MarkdownPreviewFrame| Markdown multi-tab preview               |
| ContextMenuFrame    | Right-click context menu                 |
| JsonToolFrame       | JSON tool window                         |
| SnippetPickerFrame  | Snippet selection window                 |
| ShareSelectFrame    | Device selection for text sharing        |

### Usage Examples

```typescript
import { windowFactory } from './frame'

// Show main page centered
windowFactory.getMainPageFrame().showCentered()

// Create and show markdown preview
windowFactory.createMarkdownPreviewFrame().show()

// Show context menu at specific coordinates
windowFactory.showContextMenu(x, y, items)

// Show notification via factory convenience method
windowFactory.showNotice({
  text: 'Copied text content',
  showTranslate: true,
  duration: 5000
})

// Get the popup manager
const popupManager = windowFactory.getPopupManager()

// Show update window
windowFactory.showUpdateNew({ version: '1.0.1', description: 'Bug fixes' })
```

---

## PopupManager

**File**: `src/main/frame/PopupManager.ts`

Manages all notification popup windows. Coordinates slot allocation, animation timing, and lifecycle.

### Key Features

- **Singleton**: Exported as `popupManager`
- **5 fixed slots**: Stack from bottom-right of the screen
  - Slot 0 is at the bottom, slot 4 is at the top
  - New notifications fill the lowest available empty slot
  - Each slot's Y coordinate is calculated once at creation time based on filled slots below it
- **Slot spacing**: Fixed `8px` between all notification types
- **Animation model**: CSS-driven (renderer process handles transitions)
  - Main process positions the window at final (x, y) coordinates
  - Main sends `{ action: 'enter' | 'exit' }` via IPC
  - Renderer CSS transitions handle slide-in/slide-out (from/to the right)
  - Main waits 350ms for CSS animation to complete before destroying the window
- **macOS compatibility**: Uses `getBottomMargin()` to auto-adjust for Dock height
- **Does not steal focus**: Uses `showInactive()` so active windows (e.g., search box) are not disturbed

### Notification Types

| Method                   | Description                                       |
|--------------------------|---------------------------------------------------|
| `showNotice`             | Normal notification (clipboard, updates, etc.)    |
| `showClaudeStatus`       | Persistent Claude Code status notification        |
| `showPermissionNotice`   | Claude Code permission confirmation popup         |
| `showUpdateNotice`       | Update notification window                        |
| `destroySlotByIndex`     | Destroy a persistent notification by slot index   |

### Lazy Cleanup

`getFreeSlot()` automatically cleans up any slots whose windows were destroyed externally.

### Max Capacity Behavior

When all 5 slots are full and a new notification arrives, the oldest existing notification is destroyed to make room.

### Usage Examples

```typescript
import { popupManager, NoticeNewFrame } from './frame'

// Show a normal notification
popupManager.showNotice(
  () => {
    const frame = new NoticeNewFrame()
    frame.setMsg('Copied content', true)
    return frame.create()
  },
  { type: 'notice', width: 500, height: 60 },
  { text: 'Copied content', duration: 5000 }
)

// Show Claude Code status notification
popupManager.showClaudeStatus('🟢 Session running', createFn, updateFn)
popupManager.hideClaudeStatus()

// Show permission notice
popupManager.showPermissionNotice(
  createFn,
  { type: 'permission', width: 520, height: 140 },
  showFn
)
popupManager.destroyPermissionNotice()

// Show update notice
popupManager.showUpdateNotice(
  createFn,
  { type: 'update', width: 380, height: 280 },
  showFn
)
```

### IPC Interface

Sent by PopupManager to control animations:

- `to-renderer-{框架名}:animate` -- Controls enter/exit animations (payload: `{ action: 'enter' | 'exit' }`)

---

## PopupItem

**File**: `src/main/frame/PopupItem.ts`

A lightweight metadata wrapper around a `BrowserWindow` instance, used exclusively by `PopupManager`.

### Purpose

- Holds the window instance and associated metadata (slot index, type, creation time)
- Provides PopupManager with a uniform interface for managing notifications without directly accessing `BrowserWindow` internals

---

## NoticeNewFrame

**File**: `src/main/frame/NoticeNewFrame.ts`

A slide-in notification popup that appears from the bottom-right of the screen.

### Visual Design

- Blue-pink gradient capsule style
- Window size matches content (non-fullscreen)
- PopupManager uses `setBounds` for precise position and size control
- Notification card is right-aligned within the window
- Card width auto-adapts to text content (160px ~ 500px)
- Transparent areas allow mouse events to pass through (only the card area is interactive)
- Frameless, transparent window

### Animations

- **Entry**: Slides in from the right side of the screen (CSS `translateX` transition)
- **Exit**: Slides out to the right side of the screen (CSS `translateX` transition)

### Behavior

- **Does not steal focus**: Uses `showInactive()` to avoid disrupting foreground windows (e.g., search box)
- **Translate button**: Shown only for clipboard text notifications; hidden for other notifications (e.g., update checks)
- **Open Link button**: Auto-detects URLs in the notification text; if a link is found, shows a green gradient button that opens the URL in the system default browser
- **Claude Code status notifications**: Supports a persistent notification mode via `isPersistent` property -- displays a "Claude" badge and does not auto-destroy

### IPC Interface

| Channel                                      | Direction | Description                                      |
|----------------------------------------------|-----------|--------------------------------------------------|
| `to-main-NoticeNewFrame:ready`               | Renderer -> Main | Renderer is ready, triggers message sending   |
| `to-renderer-NoticeNewFrame:sendMsg`         | Main -> Renderer | Send notification message (triggers enter animation) |
| `to-renderer-NoticeNewFrame:animate`         | Main -> Renderer | Control exit animation `{ action: 'exit' }`    |
| `to-main-NoticeNewFrame:mouse-enter-card`    | Renderer -> Main | Mouse enters card area (disable mouse-through) |
| `to-main-NoticeNewFrame:mouse-leave-card`    | Renderer -> Main | Mouse leaves card area (restore mouse-through) |
| `to-main-NoticeNewFrame:translate`           | Renderer -> Main | Translate button clicked, open translate page   |
| `to-main-NoticeNewFrame:openLink`            | Renderer -> Main | Open link in system default browser              |
| `to-main-NoticeNewFrame:openJsonTool`        | Renderer -> Main | Open JSON tool window                            |
| `to-main-NoticeNewFrame:share`               | Renderer -> Main | Share button clicked, open device selection popup |
| `to-main-NoticeNewFrame:copyReceivedText`    | Renderer -> Main | Copy received text to system clipboard           |
| `to-main-NoticeNewFrame:closeReceivedText`   | Renderer -> Main | Close received-text persistent notification      |

### Usage Example

```typescript
import { popupManager, NoticeNewFrame } from './frame'

popupManager.showNotice(
  () => {
    const frame = new NoticeNewFrame()
    frame.setMsg('Notification content')
    return frame.create()
  },
  { type: 'notice', width: 500, height: 60 },
  { text: 'Notification content', duration: 5000 }
)
```

---

## PermissionNoticeFrame

**File**: `src/main/frame/PermissionNoticeFrame.ts`

A permission confirmation popup for Claude Code tool access requests.

### Visual Design

- Bottom-center positioned
- Blue-pink gradient capsule style
- Transparent, frameless window
- Mouse-through on transparent areas (only the card area is interactive)
- Glassmorphism card style

### Behavior

- **Does not steal focus**: Uses `showInactive()` to avoid disrupting foreground windows
- **Three buttons**: Deny / Approve / Approve All (the "close" button is shown for `AskUserQuestion` tool)
- **Auto-hide**: Window fades out automatically when permission is resolved or times out
- **Auto-close**: When `PreToolUse`/`PostToolUse` events are received while the permission popup is still displayed, it is automatically hidden (applies to both `AskUserQuestion` and regular permission requests)
- On button click, notifies the main process via IPC, which writes back the HTTP response to unblock Claude Code

### IPC Interface

| Channel                                         | Direction       | Description                                    |
|-------------------------------------------------|-----------------|------------------------------------------------|
| `to-renderer-PermissionNoticeFrame:show`        | Main -> Renderer | Show permission confirmation window             |
| `to-renderer-PermissionNoticeFrame:hide`        | Main -> Renderer | Hide window (after permission resolved)         |
| `to-main-PermissionNoticeFrame:resolve`         | Renderer -> Main | User clicked a button                          |
| `to-main-PermissionNoticeFrame:destroy`         | Renderer -> Main | Destroy window (after animation completes)      |
| `to-main-PermissionNoticeFrame:mouse-enter-card` | Renderer -> Main | Mouse enters card area                         |
| `to-main-PermissionNoticeFrame:mouse-leave-card` | Renderer -> Main | Mouse leaves card area                         |

### Usage Example

```typescript
import { windowFactory } from './frame'

// Show permission confirmation (called automatically by claudeCodeService)
const noticeFrame = windowFactory.getPermissionNoticeFrame()
noticeFrame.showPermissionNotice({
  sessionId: 'xxx',
  toolName: 'Bash',
  command: 'rm -rf /tmp/test',
  description: ''
})
```

---

## UpdateNewFrame

**File**: `src/main/frame/UpdateNewFrame.ts`

An update prompt window that appears at the bottom-center of the screen, supporting both LAN (local network) and GitHub update sources.

### Visual Design

- Bottom-center positioned, 60px from the bottom (macOS auto-adapts for Dock height)
- Created on demand (not auto-started)
- Glassmorphism card style, transparent frameless window
- Blue-pink color scheme (`#3d8bff` / `#ff6ab0`)
- Entry/exit CSS animations (pop-up / collapse)
- Decorative rotating ring at the bottom

### Features

- Displays version number, release notes, and download progress bar
- **LAN updates**: Reads `latest.yml` from SMB shared folder for version info
- **Local cache check**: Checks if the version is already downloaded locally before downloading
- **Download progress**: Real-time progress display
- **Install button**: Shown after download completes
- **Cross-platform installation**:
  - Windows: Launches `.exe` installer
  - macOS: Supports `.dmg` (mounts it) and `.app` (direct launch)
- **Cross-platform path validation**: Auto-detects platform and provides friendly error messages (macOS prompts to mount shared folder)
- **Auto-cleanup**: Clears old installers from the `update-cache` directory before installation
- **Configurable server URL**: Users can configure the update server path in Settings

### IPC Interface

| Channel                    | Direction | Description                        |
|----------------------------|-----------|------------------------------------|
| `update-new:ready`         | Renderer -> Main | Renderer ready, trigger update check     |
| `update-new:download`      | Renderer -> Main | Request download                    |
| `update-new:install`       | Renderer -> Main | Request installation                |
| `update-new:hide`          | Renderer -> Main | Hide window                        |
| `update-new:destroy`       | Renderer -> Main | Destroy window                     |
| `lan-update-progress`      | Main -> Renderer | Send download progress             |
| `lan-update-downloaded`    | Main -> Renderer | Download completed notification    |
| `lan-update-error`         | Main -> Renderer | Send error information             |

### Default Server URL Configuration

- **Windows default**: `\\10.15.8.28\dist` (UNC path)
- **macOS default**: `/Volumes/dist` (SMB mount path -- macOS users mount the shared folder via Finder, no manual path entry needed)
- Configurable via Settings page ("Settings -> Update Server")

### Usage Example

```typescript
import { windowFactory } from './frame'

// Show update window (created on demand)
windowFactory.showUpdateNew({
  version: '1.0.1',
  description: 'Fixed some bugs'
})

// Hide update window
windowFactory.getUpdateNewFrame().hide()
```

---

## MainPageFrame

**File**: `src/main/frame/MainPageFrame.ts`

The main frameless application window, opened by left-clicking the tray icon.

### Window Configuration

- 800x600 frameless, transparent window (minimum size 600x450)
- `alwaysOnTop: true` -- always floats above other windows
- `resizable: true` -- supports drag-to-resize
- Initial position: center of the screen
- Left-click tray icon toggles show/hide

### Visual Features

- Custom title bar: app name + version + minimize/close buttons
- Top gradient bar (blue -> pink, brand identity)
- Entry animation: scale + opacity elastic transition
- Sidebar layout: left menu (collapsible) + right content area

### Special Behaviors

- **Translate jump**: Supports navigating from notification popup directly to the translate page with auto-filled text
- **Cross-platform focus restoration**:
  - Windows: `minimize()` automatically restores focus to the previous window
  - macOS: `hide()` + `app.hide()` hides the entire app so system focus returns to the previous application

### IPC Interface

| Channel                                   | Direction | Description                                  |
|-------------------------------------------|-----------|----------------------------------------------|
| `main-page:minimize`                      | Renderer -> Main | Minimize window                              |
| `main-page:ready`                         | Renderer -> Main | Renderer ready, trigger version info send    |
| `main-page:version`                       | Main -> Renderer | Send app version number                      |
| `to-main-MainPage:openTranslate`          | Renderer -> Main | Navigate to translate page from clipboard history |
| `to-renderer-MainPage:setPage`            | Main -> Renderer | Send page navigation instruction              |
| `close-window`                            | Renderer -> Main | Close/hide window (inherited from BaseFrame) |

### Public Methods

| Method                            | Description                                              |
|-----------------------------------|----------------------------------------------------------|
| `showCentered()`                  | Toggle show/hide at screen center                        |
| `showAndTranslate(text)`          | Show window and navigate to translate page (no exit animation) |
| `openTranslate(text)`             | Open translate page with specified text (window must already be visible) |

### Usage Example

```typescript
import { windowFactory } from './frame'

// Left-click tray auto-calls this
windowFactory.getMainPageFrame().showCentered()

// Show window and navigate to translate page (from notification)
windowFactory.getMainPageFrame().showAndTranslate('Text to translate')
```

---

## SearchBoxFrame

**File**: `src/main/frame/SearchBoxFrame.ts`

A global search box that can be summoned via keyboard shortcut.

### Window Configuration

- Screen-centered position
- Frosted glass (blur) effect
- `Ctrl+K` / `⌘K` shortcut to toggle show/hide

### Features

- Supports Pinyin initial-based search for Chinese text
- Searches across: tools, clipboard history, apps, files, web pages
- Preload script is correctly loaded (webPreferences conflict resolved)

### IPC Interface

| Channel                              | Direction       | Description              |
|--------------------------------------|-----------------|--------------------------|
| `to-main-SearchBox:searchTools`      | Renderer -> Main | Search tools              |
| `to-main-SearchBox:searchClipboard`  | Renderer -> Main | Search clipboard history  |
| `to-main-SearchBox:executeTool`      | Renderer -> Main | Execute a tool            |
| `to-main-SearchBox:hide`             | Renderer -> Main | Hide the search box       |

### Usage Example

```typescript
import { windowFactory } from './frame'

// Show search box
windowFactory.getSearchBoxFrame().show()

// Hide search box
windowFactory.getSearchBoxFrame().hide()

// Toggle show/hide
windowFactory.getSearchBoxFrame().toggle()
```

---

## MarkdownPreviewFrame

**File**: `src/main/frame/MarkdownPreviewFrame.ts`

A multi-tab, split-screen Markdown preview window.

### Window Configuration

- `transparent: true` -- transparent background matching the renderer canvas
- `frame: false` -- frameless
- Window size matches renderer content (900x600)

### Layout

- Left panel: Markdown editor
- Right panel: Live preview (rendered HTML)

### Features

- **Multi-tab support**: Open multiple Markdown files simultaneously
- **Drag-and-drop**: Drop `.md` files to open them
- **Save** (`Ctrl+S`): Existing files save in-place; new files trigger a file-save dialog
- **Right-click menu**: Uses a standalone `ContextMenuFrame` window (not clipped by parent window boundaries)
- **Line break handling**: Single line breaks are converted to `<br>` (via markdown-it `breaks` option)

### IPC Interface

| Channel                                        | Direction       | Description                                             |
|------------------------------------------------|-----------------|---------------------------------------------------------|
| `to-main-MarkdownPreview:readFile`             | Renderer -> Main | Read a file                                             |
| `to-main-MarkdownPreview:saveFile`             | Renderer -> Main | Save file to specified path                             |
| `to-main-MarkdownPreview:saveFileAs`           | Renderer -> Main | Save as (opens file-save dialog)                        |
| `to-main-MarkdownPreview:minimize`             | Renderer -> Main | Minimize window                                         |
| `to-main-MarkdownPreview:toggleMaximize`       | Renderer -> Main | Toggle maximize                                         |
| `to-main-MarkdownPreview:close`                | Renderer -> Main | Close window                                            |
| `to-main-MarkdownPreview:showContextMenu`      | Renderer -> Main | Show right-click menu (forwards to ContextMenuFrame)    |
| `to-main-MarkdownPreview:openWithContent`      | Renderer -> Main | Open from clipboard with content (new tab)              |
| `to-renderer-MarkdownPreview:newTab`           | Main -> Renderer | Create new tab and populate with content                |

### Usage Example

```typescript
import { windowFactory } from './frame'

// Create and show Markdown preview window
windowFactory.createMarkdownPreviewFrame().show()
```

---

## ContextMenuFrame

**File**: `src/main/frame/ContextMenuFrame.ts`

A standalone, transparent right-click context menu window for the Markdown editor.

### Window Configuration

- `transparent: true` -- transparent background
- `frame: false` -- frameless
- `skipTaskbar: true` -- not shown in taskbar
- `alwaysOnTop: true` -- always on top
- Size adjusts dynamically based on the number of menu items

### Features

- **Independent window**: Not constrained by the parent window's boundaries
- **Auto-positioning**: Automatically adjusts position to stay within screen bounds
- **Auto-hide on blur**: Listens for the `blur` event and hides itself when focus is lost
- **Broadcast communication**: Menu actions are broadcast to all windows via `BroadcastChannel`
- After clicking a menu item, focus returns to the Markdown preview window

### IPC Interface

| Channel                                | Direction       | Description                           |
|----------------------------------------|-----------------|---------------------------------------|
| `to-main-ContextMenu:click`            | Renderer -> Main | A menu item was clicked                |
| `to-main-ContextMenu:close`            | Renderer -> Main | Close the menu                        |
| `to-renderer-ContextMenu:show`         | Main -> Renderer | Show menu (sends menu data to renderer) |
| `broadcast:context-menu-action`        | Broadcast        | Broadcast menu action to all windows   |

### Usage Example

```typescript
import { windowFactory } from './frame'

// Show right-click menu at specific coordinates
windowFactory.showContextMenu(x, y, items)
```

---

## SnippetPickerFrame

**File**: `src/main/frame/SnippetPickerFrame.ts`

A snippet selection window summoned by the `Ctrl+Shift+V` keyboard shortcut.

### Features

- **Quick search**: Search and filter snippets by name or content
- **Quick insert**: Select a snippet to instantly insert it at the cursor position
- **Variable template support**: Supports template variables within snippets for dynamic content insertion

### Usage

```typescript
import { windowFactory } from './frame'

// The snippet picker is typically toggled by its keyboard shortcut
// Ctrl+Shift+V (or Cmd+Shift+V on macOS)
```

---

## ShareSelectFrame

**File**: `src/main/frame/ShareSelectFrame.ts`

A device selection popup displayed when sharing text to another device on the local network.

### Features

- Displays a list of online devices discovered on the local network
- Selecting a device sends the shared text to that device via HTTP POST
- Devices are discovered via the `fileTransferService`

### IPC Interface

| Channel                                        | Direction       | Description                               |
|------------------------------------------------|-----------------|-------------------------------------------|
| `to-service-TextShareService:getOnlineDevices` | Renderer -> Main | Get list of online devices                 |
| `to-service-TextShareService:sendText`         | Renderer -> Main | Send text to target device                 |
| `to-service-TextShareService:getLastReceivedText` | Renderer -> Main | Get most recently received text            |

### Workflow

```
Sending side: Clipboard notification -> Click share button -> ShareSelectFrame (select device) -> POST /share-text
Receiving side: HTTP Server -> textShareService.onReceiveText() -> PopupManager -> Persistent notification
```
