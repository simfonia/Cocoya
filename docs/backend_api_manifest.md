# Cocoya Rust Backend API Manifest (Modularization Plan)

This document serves as the Technical Reference and Source of Truth (SSOT) for the Tauri commands in `src/lib.rs`. It is used to track functional parity during the modularization refactor.

## Command Modules (`src/commands/*.rs`)

### Python Commands (`python.rs`)
| Command Name | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `run_python` | Executes Python code, streams stdout/stderr to frontend | Migrated | `commands/python.rs` |
| `stop_python` | Kills the running Python process for the specific window | Migrated | `commands/python.rs` |
| `check_environment` | Checks for required Python packages (cv2, mediapipe, etc.) | Migrated | `commands/python.rs` |

### File Commands (`file.rs`)
| Command Name | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `get_manifest` | Loads and returns `core_manifest.json` content | Migrated | `commands/file.rs` |
| `get_module_toolbox` | Reads a specific module's `toolbox.xml` | Migrated | `commands/file.rs` |
| `open_file` | Handles file picking, locking, and backup checks | Migrated | `commands/file.rs` |
| `save_file` | Saves XML to disk, handles locks and backup cleanup | Migrated | `commands/file.rs` |
| `auto_backup` | Creates a hidden `.bak` or temp backup file | Migrated | `commands/file.rs` |
| `clear_backup` | Removes backup files after successful save or discard | Migrated | `commands/file.rs` |
| `reject_recovery` | Archives existing backup files if recovery is rejected | Migrated | `commands/file.rs` |
| `check_startup_backup` | Scans for orphan backups on startup for recovery | Migrated | `commands/file.rs` |

### MCU Commands (`mcu.rs`)
| Command Name | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `get_serial_ports` | Lists available serial ports with smart labeling | Migrated | `commands/mcu.rs` |
| `deploy_mcu` | Invokes `deploy_mcu.py` to upload code to hardware | Migrated | `commands/mcu.rs` |
| `open_serial_monitor` | Starts serial monitor mode via `deploy_mcu.py` | Migrated | `commands/mcu.rs` |
| `setup_stable_mode` | Configures MCU for stable mode (mpremote based) | Migrated | `commands/mcu.rs` |
| `erase_filesystem` | Rebuilds the MCU filesystem (formatting) | Migrated | `commands/mcu.rs` |
| `reset_firmware` | Burns MicroPython firmware to RPI-RP2 drive | Migrated | `commands/mcu.rs` |
| `set_window_focus` | Releases/re-acquires serial monitor on window focus change (Multi-window handover) | Migrated | `commands/mcu.rs` |

### App Commands (`app.rs`)
| Command Name | Description | Status | Target Module |
| :--- | :--- | :--- | :--- |
| `create_window` | Spawns a new editor window with unique label | Migrated | `commands/app.rs` |
| `set_window_title` | Updates the native window title | Migrated | `commands/app.rs` |
| `get_version` | Returns application version from Cargo.toml | Migrated | `commands/app.rs` |
| `set_dirty` | Updates the dirty state tracker for the window | Migrated | `commands/app.rs` |
| `close_window` | Triggers window closure | Migrated | `commands/app.rs` |

## Shared Core Components

| Component | Description | Status | Target File |
| :--- | :--- | :--- | :--- |
| `AppState` | Global state (processes, paths, locks, dirty states) | Migrated | `state.rs` |
| `OpenFileResult` | Struct for file opening response | Migrated | `commands/file.rs` |
| `SerialPortResult` | Struct for serial port discovery response | Migrated | `commands/mcu.rs` |
| `get_deployer_path` | Helper to locate `deploy_mcu.py` | Migrated | `utils.rs` |
| `on_window_event` | Window lifecycle management (closing, cleanup) | Migrated | `lib.rs` |

## Migration Checklist
- [x] 1. Create `state.rs`, `utils.rs`, and `commands/` directory.
- [x] 2. Move `AppState` and related logic.
- [x] 3. Migrate commands category by category.
- [x] 4. Re-assemble `lib.rs` with new modular imports.
- [x] 5. Verify all frontend `invoke` calls remain functional.

---
## Command Signatures (Parameters) -- SSOT for Rust<->JS parity

Derived from `#[tauri::command] fn` in `src-tauri/src/commands/*.rs`. `window`/`state`/`handle` are Tauri-injected (JS does NOT pass them); JS only passes the Params (JS-passed) column. Naming follows camelCase<->snake_case (Tauri 2.10.3 auto-maps) -- see AGENTS.md "Tauri cross-language Invoke signature sync rules".
Notation: `key?` = Optional. **Rule: changing a Rust signature -> immediately update this table AND the JS call site** (guards against `invalid args '<name>' for command '<cmd>'`).

| Module | Command | Params (Rust, JS-passed) | JS Invoke Keys | Return |
|---|---|---|---|---|
| app | create_window   | -- | {} | Result<(), String> |
| app | set_window_title | title: String | {title} | Result<(), String> |
| app | get_version      | -- | {} | String |
| app | set_dirty        | is_dirty: bool | {isDirty} | () |
| app | close_window     | -- | {} | () |
| app | pick_python_path | -- | {} | Result<String, String> |
| app | open_help        | help_id: String | {helpId} | Result<(), String> |
| python | run_python     | code: String, python_path: String | {code, pythonPath} | Result<(), String> |
| python | stop_python    | -- | {} | Result<(), String> |
| python | start_training | project_name, task_type, backend, ssh_config: Option<Value> | {projectName, taskType, backend, sshConfig?} | Result<(), String> |
| python | start_sidecar  | python_path: String | {pythonPath} | Result<(), String> |
| python | sidecar_send   | command: String, payload: String | {command, payload} | Result<String, String> |
| python | stop_sidecar   | -- | {} | Result<(), String> |
| python | export_dataset | spec_json, source_folder_path, python_path: String | {specJson, sourceFolderPath, pythonPath} | Result<String, String> |
| python | check_environment | python_path: String | {pythonPath} | Result<serde_json::Value, String> |
| mcu | get_serial_ports    | -- | {} | Result<Vec<SerialPortResult>, String> |
| mcu | setup_stable_mode   | port: String, lang: String | {port, lang} | Result<(), String> |
| mcu | deploy_mcu          | python_path, port, code, serial_upload_only: bool, lang | {pythonPath, port, code, serialUploadOnly, lang} | Result<(), String> |
| mcu | open_serial_monitor | port: String, python_path, lang | {port, pythonPath, lang} | Result<(), String> |
| mcu | erase_filesystem    | port: String, python_path, lang | {port, pythonPath, lang} | Result<(), String> |
| mcu | reset_firmware      | model: String, should_clear: bool, serial_port: Option<String> | {model, shouldClear, serialPort?} | Result<(), String> |
| mcu | set_window_focus    | focused: bool | {focused} | Result<(), String> |
| file | get_manifest       | -- | {} | Result<serde_json::Value, String> |
| file | get_module_toolbox  | path: String | {path} | Result<String, String> |
| file | get_project_anchor  | -- | {} | ProjectAnchor（serde camelCase：`isAnchored` / `projectRoot`；呼叫端勿以 snake_case 讀欄位） |
| file | open_file          | -- | {} | Result<OpenFileResult, String> |
| file | open_examples      | -- | {} | Result<OpenFileResult, String> |
| file | save_file          | xml, save_as: bool, force_examples: Option<bool> | {xml, saveAs, forceExamples?} | Result<String, String> |
| file | auto_backup        | xml: String | {xml} | Result<(), String> |
| file | check_startup_backup | -- | {} | Option<String> |
| file | clear_backup       | -- | {} | Result<(), String> |
| file | reject_recovery    | -- | {} | Result<(), String> |
| file | delete_file        | path: String | {path} | Result<(), String> |
| file | pick_folder        | -- | {} | Result<PickFolderResult, String> |
| file | dataset_save_progress | folder_path, project_name, spec_json: String | {folderPath, projectName, specJson} | Result<String, String>（Err 以 `CODE: message` 前綴回傳：`PROJECT_NAME_INVALID` / `IO_ERROR`） |
| file | dataset_load_progress  | folder_path: String | {folderPath} | Result<DatasetProgressResult, String>；DatasetProgressResult 含 hasProgress, spec?, path, errorCode?（無檔案時 `PROGRESS_NOT_FOUND`）。2026-08-26 精簡：folderPath 必為 canonical 目錄，direct 讀取，fallback 掃描已移除 |
| （bridge message）| getProjectAnchor | requestId: String | {requestId} | 無 Rust 指令；VSIX 由 cocoyaManager 以 currentFilePath 回覆、Tauri 由 tauri.js invoke get_project_anchor 後回覆 `projectAnchorResult { isAnchored, projectRoot }`。供 Dataset Manager 進入閘使用 |
| file | dataset_import_from_folder | source_path, project_name: String, confirmed: bool | {sourcePath, projectName, confirmed} | Result<DatasetImportResult, String>；DatasetImportResult 含 action（`use`/`confirm_required`/`copied`）, path?, canonicalDir, copiedFiles?, images, labelCounts, labelMap。決策契約：資料集必須位於 `<專案根>/dataset/<資料集名稱>`（project_name 參數 = 資料集名稱）；來源在外且 confirmed=true 時遞迴複製（不覆寫已存在檔案）後掃描 canonical |
| dataset | dataset_upload_chunk | file_id, chunk_index, total_chunks, zip_data_chunk, project_name, is_last | {fileId, chunkIndex, totalChunks, zipDataChunk, projectName, isLast} | Result<Option<String>, String> |
| training | open_report  | report_path: String | {reportPath} | Result<(), String> |
| training | find_latest_training_report | -- | {} | Result<Vec<ReportInfo>, String> |
