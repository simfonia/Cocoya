# Cocoya Webview API Manifest

This document serves as the Technical Reference and Source of Truth (SSOT) for the public APIs of `CocoyaApp` and `CocoyaUI`. It is used to track functional parity during refactoring.

## CocoyaUtils (`ui/src/utils.js`)

| Method / Property | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `TAG_START` | Invisible tag start (\u0001) | Migrated | `utils/core.js` |
| `TAG_END` | Invisible tag end (\u0002) | Migrated | `utils/core.js` |
| `extractIds(line)` | Extracts ID markers from code lines | Migrated | `utils/core.js` |
| `fixIndent(code, i)` | Fixes indentation for static code snippets | Migrated | `utils/core.js` |
| `filterToolboxXML(x, p)` | Filters blocks based on platform | Migrated | `utils/toolbox.js` |
| `setupGeneratorOverrides()` | Applies indentation and sync patches | Migrated | `utils/generators.js` |
| `Mutator.execute(...)` | Enhanced undo/redo for mutator blocks | Migrated | `utils/mutator.js` |
| `BlockSearcher.buildIndex(w)` | Indexes blocks for search | Migrated | `utils/search.js` |
| `BlockSearcher.search(q)` | Performs block search | Migrated | `utils/search.js` |
| `BlockSearcher.inject(w)` | Injects search UI into toolbox | Migrated | `utils/search.js` |

## CocoyaApp (`ui/src/main.js`)

| Method / Property | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `workspace` | Blockly Workspace instance | Migrated | `app/workspace.js` |
| `currentPlatform` | Current hardware platform (MicroPython/PC) | Migrated | `app/config.js` |
| `init()` | Entry point for initialization | Migrated | `app/lifecycle.js` |
| `setupThemeSync()` | Auto-sync theme with VS Code/System | Migrated | `app/config.js` |
| `setupIndentSelector()` | UI listener for indentation size | Migrated | `app/config.js` |
| `setupPlatformSelector()` | UI listener for platform switching | Migrated | `app/config.js` |
| `switchPlatform(p)` | Core logic to switch platform | Migrated | `app/config.js` |
| `setPlatformUI(p)` | Updates UI components for new platform | Migrated | `app/config.js` |
| `buildToolboxXml(...)` | Dynamically builds Toolbox XML | Migrated | `app/lifecycle.js` |
| `setupWindowListeners()` | Bridge message listener setup | Migrated | `app/lifecycle.js` |
| `initializeCocoya(...)` | Main Blockly injection and setup sequence | Migrated | `app/lifecycle.js` |
| `triggerAutoBackup()` | Debounced auto-backup trigger | Migrated | `app/persistence.js` |
| `checkAutoBackup(xml)` | Recovery logic for backups | Migrated | `app/persistence.js` |
| `registerPlugins()` | Register custom Blockly fields/plugins | Migrated | `app/workspace.js` |
| `initMinimap()` | Initialize the positioned minimap | Migrated | `app/workspace.js` |
| `setupMinimapToggle()` | UI logic for minimap collapse/expand | Migrated | `app/workspace.js` |
| `refreshMinimap()` | Force sync main workspace to minimap | Migrated | `app/workspace.js` |
| `setupBlocklyPrompts()` | Override Blockly.dialog with Bridge calls | Migrated | `app/lifecycle.js` |
| `registerVariablesCallback()` | Toolbox category callback for variables | Migrated | `app/workspace.js` |
| `setupWorkspaceListeners()` | Main workspace change listener (Dirty/Sync) | Migrated | `app/workspace.js` |
| `triggerBlockStateUpdate()` | Orphan block detection and graying out | Migrated | `app/workspace.js` |
| `triggerCodeUpdate()` | Debounced Python code generation | Migrated | `app/workspace.js` |
| `setDirty(bool)` | Manages dirty state and notifies backend | Migrated | `app/persistence.js` |
| `handlePromptResponse(m)` | Processes dialog input from backend | Migrated | `app/lifecycle.js` |
| `handleToolboxData(m)` | Processes module XML from backend | Migrated | `app/lifecycle.js` |
| `loadWorkspace(xml, ...)` | Loads XML into workspace | Migrated | `app/persistence.js` |
| `resetWorkspace()` | Clears workspace and sets default blocks | Migrated | `app/persistence.js` |
| `onSaveCompleted(fn)` | Callback after successful save | Migrated | `app/persistence.js` |
| `createDefaultBlocks()` | Injects starting blocks based on platform | Migrated | `app/lifecycle.js` |

## AppController (`ui/src/app/controller.js`)

| Method / Property | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `handleCommand(m)` | Main message router for backend events | Migrated | `app/controller.js` |
| `dispatch(cmd, p)` | Frontend command dispatcher to backend | Migrated | `app/controller.js` |

## CocoyaUI (`ui/src/ui_manager.js`)

| Method / Property | Description | Status | Target Module |
| `renderPythonPreview(raw)` | Renders code with indentation guides | Migrated | `ui/renderer.js` |
| `syncSelection(id)` | Highlights code lines for selected block | Migrated | `ui/renderer.js` |
| `setDirty(bool)` | UI feedback (pink border) for dirty state | Migrated | `ui/base.js` |
| `updateFileStatus(fn)` | Updates filename in toolbar and window title | Migrated | `ui/base.js` |
| `applyI18n()` | Replaces %{BKY_...} placeholders in DOM | Migrated | `ui/base.js` |
| `updateSerialPorts(ports)` | Updates the serial port dropdown | Migrated | `ui/hardware.js` |
| `updateRunTooltip(p)` | Updates Run button tooltip based on platform | Migrated | `ui/hardware.js` |
| `updateSettingsMenu(p)` | Shows/hides MCU settings (Reset Firmware) | Migrated | `ui/hardware.js` |
| `flashButton(id, color)` | Visual feedback for button actions | Migrated | `ui/dialogs.js` |
| `showQuickPick(options)` | Custom list selection UI | Migrated | `ui/dialogs.js` |
| `closeQuickPick(result)` | Closes the custom list selection UI | Migrated | `ui/dialogs.js` |
| `showLoadingModal(msg)` | Shows global loading spinner | Migrated | `ui/dialogs.js` |
| `hideLoadingModal()` | Hides global loading spinner | Migrated | `ui/dialogs.js` |
| `showSaveConfirm(msg)` | VS Code-style 3-button save dialog | Migrated | `ui/dialogs.js` |
| `applyHighlightColor(c)` | Updates CSS variables for code highlighting | Migrated | `ui/dialogs.js` |
| `initToolbar(cb)` | Sets up all toolbar button click listeners | Migrated | `ui/base.js` |
| `setUpdateStatus(data)` | Shows update progress in UI | Migrated | `ui/base.js` |
