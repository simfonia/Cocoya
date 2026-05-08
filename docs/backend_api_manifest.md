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
- [ ] 5. Verify all frontend `invoke` calls remain functional.
