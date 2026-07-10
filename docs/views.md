# Page View Components

All page view components reside in `src/renderer/src/views/`. They are Vue 3 single-file components rendered inside Electron BrowserWindows, each associated with a corresponding Frame class in the main process.

---

## About.vue

**File:** `src/renderer/src/views/About.vue`

The About page displays application information such as version, build details, and credits. It is a simple informational view accessible from the main page sidebar navigation.

---

## Notice.vue / NoticeNew.vue

**Files:**
- `src/renderer/src/views/Notice.vue`
- `src/renderer/src/views/NoticeNew.vue`

Notification popup windows displayed when clipboard content changes. The older `Notice.vue` shows copied text (max two lines, overflow ellipsis) with drag support, a close button, and auto-dismiss after 10 seconds.

`NoticeNew.vue` is the current notification implementation with blue-pink gradient capsule styling and the following features:

- Single-line text display in a capsule-shaped card
- Width auto-adapts from 160px to 500px based on text length
- Entry animation: slides in from the right (CSS `translateX` transition)
- Exit animation: slides out to the right (CSS `translateX` transition)
- Transparent background with mouse passthrough (interactive only over the card area)
- Does **not steal focus** -- uses `showInactive()` to display without disrupting foreground windows
- **Translate button**: shown only for clipboard text notifications; hidden for other notifications (e.g., update checks)
- **Open link button**: auto-detects URLs in the text and shows a green gradient button to open in the default browser
- **Claude Code status notification**: persistent mode shows a "Claude" badge and never auto-destroys
- Display duration managed by `PopupManager` (customizable per notification)

---

## UpdateNew.vue

**File:** `src/renderer/src/views/UpdateNew.vue`

Update notification window that appears at the bottom-center of the screen. Features include:

- Glassmorphism card style with blue-pink color scheme (`#3d8bff` / `#ff6ab0`)
- Pop-up/collapse CSS animation
- Displays version number, release notes, and download progress bar
- Decorative rotating ring at the bottom
- LAN update: reads `latest.yml` from SMB shared folder
- Local cache check: prioritizes locally downloaded versions
- Real-time download progress display
- Install button shown after download completes
- Cross-platform installation:
  - Windows: launches `.exe` installer
  - macOS: supports `.dmg` (mount) and `.app` (direct launch)
- Cross-platform path validation with friendly platform-specific error messages
- Auto-clears old installers in `update-cache` directory before installation

**IPC channels:**
- `update-new:ready` -- renderer ready, triggers update check
- `update-new:download` -- renderer requests download
- `update-new:install` -- renderer requests installation
- `update-new:hide` -- renderer requests hide
- `update-new:destroy` -- renderer requests destroy
- `lan-update-progress` -- main process sends download progress
- `lan-update-downloaded` -- main process sends download complete
- `lan-update-error` -- main process sends error info

---

## MainPage.vue

**File:** `src/renderer/src/views/MainPage.vue`

The main application window with a sidebar layout. Opened by left-clicking the tray icon.

- 800x600 frameless transparent window (min size 600x450)
- Always on top, resizable
- Custom title bar: app name, version, minimize/close buttons
- Top gradient bar (blue to pink, brand identity)
- Entry animation: scale + opacity elastic transition
- Sidebar layout: collapsible left menu + right content area
- Menu navigation to all child pages (Clipboard, Translate, Settings, etc.)
- Translation jump support: opens the translate page with pre-filled text from notifications
- Cross-platform focus restoration:
  - Windows: `minimize()` restores focus to previous window
  - macOS: `hide()` + `app.hide()` hides the app and returns focus to the previous application

**IPC channels:**
- `main-page:minimize` -- minimize window
- `main-page:ready` -- renderer ready, triggers version send
- `main-page:version` -- main process sends app version
- `to-main-MainPage:openTranslate` -- jump to translate page from clipboard history
- `to-renderer-MainPage:setPage` -- main process sends page navigation command
- `close-window` -- close/hide window (inherited from BaseFrame)

---

## ClipboardManager.vue

**File:** `src/renderer/src/views/ClipboardManager.vue`

Clipboard history and favorites management with a dual-tab interface.

- **History / Favorites** dual-tab navigation
- Frontend search filtering across both tabs
- Click a record to auto-copy and paste to the previously focused window
- **Clear all history** with confirmation dialog
- **Add favorites manually**: input content, category, and description
- **Category management**: filter favorites by category, support custom categories (e.g., Linux commands)
- Edit favorite content inline
- **Edit in Markdown editor**: click the edit button on a history record to open it in a Markdown preview window
- Delete individual records
- Empty state hints
- Real-time list update via IPC push from the main process
- **Smart time display**: "just now", "X minutes ago", "X hours ago", or full date

---

## Translate.vue

**File:** `src/renderer/src/views/Translate.vue`

Multi-language translation page with a history log.

- Source and target language selection
- Text input and translation via `translateService` (MyMemory API by default, custom API optional)
- Translation history with pagination, delete, and clear support
- History persisted in `userData/translate.db` (sql.js SQLite)
- Auto-save successful translations to history

---

## Settings.vue

**File:** `src/renderer/src/views/Settings.vue`

Application settings page covering appearance, auto-start, update servers, and translation API configuration.

- **Appearance**: theme selection (Modern Dark Cinema style, Slate/Blue palette)
- **Auto-start**: toggle for `app.setLoginItemSettings` via `settingsService`
- **Update server**: cross-platform update source configuration
  - Windows: UNC path selector (default: `\\10.15.8.28\dist`)
  - macOS: SMB mount path input (default: `/Volumes/dist`)
  - Expandable mount instructions for macOS guiding users through Finder SMB setup
  - Update source toggle: LAN update vs GitHub Releases update
  - GitHub repo configuration (default: `YT-XG/electron-vite-learn`)
- **Translation API**: custom API URL and Key configuration (optional, falls back to MyMemory free API)
- **Claude Code status toggle**: enable/disable persistent status notifications

---

## Shortcuts.vue

**File:** `src/renderer/src/views/Shortcuts.vue`

Keyboard shortcut customization page with recording UI.

- **Global shortcut**: defaults to `CommandOrControl+Alt+V`
- **Snippet selection shortcut**: defaults to `CommandOrControl+Shift+V`
- **Search box shortcut**: defaults to `CommandOrControl+K`
- Interactive shortcut recording: press the desired key combination to capture it
- Cross-platform `CommandOrControl` format automatically adapts to Ctrl (Windows/Linux) or Cmd (macOS)
- Changes are persisted to `settings.json` and hot-reloaded immediately

---

## Online.vue

**File:** `src/renderer/src/views/Online.vue`

Online device discovery and management page for LAN communication.

- Displays a list of online devices found on the LAN
- TCP-based device discovery
- Manual device addition (IP address input)
- Subnet scan configuration
- Device status display (online/offline)
- Used by `textShareService` for peer-to-peer text sharing

---

## ShareSelect.vue

**File:** `src/renderer/src/views/ShareSelect.vue`

Device selection popup for sharing text to another LAN device.

- Displays a list of currently online devices
- Select a target device to send clipboard text
- Invoked from the notification popup's share button
- Workflow: clipboard notification -> click share -> ShareSelectFrame (pick device) -> POST `/share-text`

---

## QuickShare.vue

**File:** `src/renderer/src/views/QuickShare.vue`

File quick share popup triggered from the Explorer/Finder right-click context menu.

- Invoked via the Shell Integration Service (Windows right-click menu / macOS service registration)
- Displays available recipient devices
- Sends files to the selected LAN device

---

## SearchBox.vue

**File:** `src/renderer/src/views/SearchBox.vue`

Global search box with a frosted-glass effect, triggered by `Ctrl+K` / `Cmd+K`.

- Centered on screen with a blur backdrop
- Supports Pinyin initial-based Chinese search
- Search targets:
  - **Tools**: built-in tools (Markdown preview, clipboard manager, translate, download manager, check update, settings, shortcuts, JSON tool)
  - **Clipboard history**: search through persisted clipboard records
  - **Files**: open local files
  - **Web URLs**: open web links
- Tool search matches by name, aliases, Pinyin initials, and description (priority-ordered matching)
- Execute a tool action directly from search results (e.g., opening Markdown preview auto-hides the main page)
- `Escape` to close

**IPC channels:**
- `to-main-SearchBox:searchTools` -- search tools
- `to-main-SearchBox:searchClipboard` -- search clipboard history
- `to-main-SearchBox:executeTool` -- execute selected tool
- `to-main-SearchBox:hide` -- hide search box

---

## SnippetPicker.vue

**File:** `src/renderer/src/views/SnippetPicker.vue`

Snippet selection popup triggered by `Ctrl+Shift+V` / `Cmd+Shift+V`.

- Search and select from saved text snippets
- Supports variable templates in snippets
- Inserts selected snippet into the previously focused window
- Quick search filtering

---

## MarkdownPreview.vue

**File:** `src/renderer/src/views/MarkdownPreview.vue`

Multi-tab split-screen Markdown editor and preview.

- Left pane: Markdown editor
- Right pane: rendered HTML preview
- Multi-tab support for editing multiple files simultaneously
- Drag-and-drop `.md` files into the window
- Save (`Ctrl+S`): existing files save in-place, new files prompt a save dialog
- **Context menu**: rendered by a separate `ContextMenuFrame` window to avoid clipping by the parent window boundary
- **Line break support**: single newlines automatically convert to `<br>` (markdown-it `breaks` option enabled)
- **From clipboard**: open clipboard content as a new tab for editing

**IPC channels:**
- `to-main-MarkdownPreview:readFile` -- read file content
- `to-main-MarkdownPreview:saveFile` -- save file to path
- `to-main-MarkdownPreview:saveFileAs` -- save as (opens file dialog)
- `to-main-MarkdownPreview:minimize` -- minimize window
- `to-main-MarkdownPreview:toggleMaximize` -- toggle maximize
- `to-main-MarkdownPreview:close` -- close window
- `to-main-MarkdownPreview:showContextMenu` -- show right-click menu (forwards to ContextMenuFrame)
- `to-main-MarkdownPreview:openWithContent` -- open with clipboard content (new tab)
- `to-renderer-MarkdownPreview:newTab` -- create new tab with content

---

## ContextMenu.vue

**File:** `src/renderer/src/views/ContextMenu.vue`

Independent right-click menu window for the Markdown editor.

- Small frameless transparent window, independent of the parent window
- Dynamic menu height calculation based on item count
- Auto-positions to stay within screen bounds
- **Auto-hides on blur** (clicking a menu item or clicking outside)
- Returns focus to the Markdown preview window after item click
- Menu actions broadcast to all windows via `BroadcastChannel`
- Window configuration: `transparent`, `frameless`, `skipTaskbar`, `alwaysOnTop`, size adjusts to menu items

**IPC channels:**
- `to-main-ContextMenu:click` -- menu item clicked
- `to-main-ContextMenu:close` -- close menu
- `to-renderer-ContextMenu:show` -- show menu with data
- `broadcast:context-menu-action` -- broadcast menu action to all windows

---

## PermissionNotice.vue

**File:** `src/renderer/src/views/PermissionNotice.vue`

Permission confirmation popup for Claude Code CLI tool access requests.

- Displays tool name and command content
- Three action buttons: **Deny**, **Allow**, **Allow All** (close button shown for AskUserQuestion tool)
- Button click notifies the main process via IPC, which writes the HTTP response back to the Claude Code hook
- Transparent frameless window, blue-pink gradient capsule style
- Mouse passthrough on transparent areas
- **Does not steal focus**: uses `showInactive()` to avoid disrupting foreground windows
- **Auto-hide**: fades out when permission is resolved or times out
- **Auto-close**: when PreToolUse/PostToolUse events are received while the permission popup is still showing, it auto-hides (applies to AskUserQuestion and regular permission requests)

**IPC channels:**
- `to-renderer-PermissionNoticeFrame:show` -- main process sends permission request
- `to-renderer-PermissionNoticeFrame:hide` -- main process hides the popup (permission resolved)
- `to-main-PermissionNoticeFrame:resolve` -- user clicks a button (renderer to main)
- `to-main-PermissionNoticeFrame:destroy` -- destroy window after animation completes
- `to-main-PermissionNoticeFrame:mouse-enter-card` -- mouse enters card area
- `to-main-PermissionNoticeFrame:mouse-leave-card` -- mouse leaves card area

---

## Test.vue

**File:** `src/renderer/src/views/Test.vue`

A test/development page used for experimenting with features during development. Not intended for production use.

---

## tools/Toolbox.vue

**File:** `src/renderer/src/views/tools/Toolbox.vue`

Toolbox page providing access to utility tools.

- Organized as a sub-directory under views
- Provides a central launch point for various built-in tools
- Tools include JSON formatter/validator (accessed via `json-tool` search action) and other utilities
