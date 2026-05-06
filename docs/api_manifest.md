# Cocoya Webview API Manifest

This document serves as the Technical Reference and Source of Truth (SSOT) for the public APIs of `CocoyaApp` and `CocoyaUI`. It is used to track functional parity during refactoring.

## CocoyaApp (`ui/src/main.js`)

| Method / Property | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `workspace` | Blockly Workspace instance | Original | `app/workspace.js` |
| `currentPlatform` | Current hardware platform (MicroPython/PC) | Original | `app/config.js` |
| `init()` | Entry point for initialization | Original | `app/lifecycle.js` |
| `setupThemeSync()` | Auto-sync theme with VS Code/System | Original | `app/config.js` |
| `setupIndentSelector()` | UI listener for indentation size | Original | `app/config.js` |
| `setupPlatformSelector()` | UI listener for platform switching | Original | `app/config.js` |
| `switchPlatform(p)` | Core logic to switch platform | Original | `app/config.js` |
| `setPlatformUI(p)` | Updates UI components for new platform | Original | `app/config.js` |
| `buildToolboxXml(...)` | Dynamically builds Toolbox XML | Original | `app/lifecycle.js` |
| `setupWindowListeners()` | Bridge message listener setup | Original | `app/lifecycle.js` |
| `initializeCocoya(...)` | Main Blockly injection and setup sequence | Original | `app/lifecycle.js` |
| `triggerAutoBackup()` | Debounced auto-backup trigger | Original | `app/persistence.js` |
| `checkAutoBackup(xml)` | Recovery logic for backups | Original | `app/persistence.js` |
| `registerPlugins()` | Register custom Blockly fields/plugins | Original | `app/workspace.js` |
| `initMinimap()` | Initialize the positioned minimap | Original | `app/workspace.js` |
| `setupMinimapToggle()` | UI logic for minimap collapse/expand | Original | `app/workspace.js` |
| `refreshMinimap()` | Force sync main workspace to minimap | Original | `app/workspace.js` |
| `setupBlocklyPrompts()` | Override Blockly.dialog with Bridge calls | Original | `app/lifecycle.js` |
| `registerVariablesCallback()` | Toolbox category callback for variables | Original | `app/workspace.js` |
| `setupWorkspaceListeners()` | Main workspace change listener (Dirty/Sync) | Original | `app/workspace.js` |
| `triggerBlockStateUpdate()` | Orphan block detection and graying out | Original | `app/workspace.js` |
| `triggerCodeUpdate()` | Debounced Python code generation | Original | `app/lifecycle.js` |
| `setDirty(bool)` | Manages dirty state and notifies backend | Original | `app/persistence.js` |
| `handlePromptResponse(m)` | Processes dialog input from backend | Original | `app/lifecycle.js` |
| `handleToolboxData(m)` | Processes module XML from backend | Original | `app/lifecycle.js` |
| `loadWorkspace(xml, ...)` | Loads XML into workspace | Original | `app/persistence.js` |
| `resetWorkspace()` | Clears workspace and sets default blocks | Original | `app/persistence.js` |
| `onSaveCompleted(fn)` | Callback after successful save | Original | `app/persistence.js` |
| `createDefaultBlocks()` | Injects starting blocks based on platform | Original | `app/lifecycle.js` |

## CocoyaUI (`ui/src/ui_manager.js`)

| Method / Property | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `renderPythonPreview(raw)` | Renders code with indentation guides | Original | `ui/renderer.js` |
| `syncSelection(id)` | Highlights code lines for selected block | Original | `ui/renderer.js` |
| `setDirty(bool)` | UI feedback (pink border) for dirty state | Original | `ui/base.js` |
| `updateFileStatus(fn)` | Updates filename in toolbar and window title | Original | `ui/base.js` |
| `applyI18n()` | Replaces %{BKY_...} placeholders in DOM | Original | `ui/base.js` |
| `updateSerialPorts(ports)` | Updates the serial port dropdown | Original | `ui/hardware.js` |
| `updateRunTooltip(p)` | Updates Run button tooltip based on platform | Original | `ui/hardware.js` |
| `updateSettingsMenu(p)` | Shows/hides MCU settings (Reset Firmware) | Original | `ui/hardware.js` |
| `flashButton(id, color)` | Visual feedback for button actions | Original | `ui/dialogs.js` |
| `openQuickPick(options)` | Custom list selection UI | Original | `ui/dialogs.js` |
| `initTerminal()` | Sets up the built-in terminal UI | Migrated | `ui/terminal.js` |
| `appendTerminal(text, ...)` | Appends logs to the terminal | Migrated | `ui/terminal.js` |
| `setUpdateStatus(data)` | Shows update progress in UI | Original | `ui/base.js` |
| `updateEnvironmentStatus(r)` | Shows Python package status in UI | Original | `ui/hardware.js` |
| `initToolbar(cb)` | Sets up all toolbar button click listeners | Original | `ui/base.js` |
