use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::collections::HashMap;
use std::fs;
use tauri::{State, Window, Emitter};
use crate::state::AppState;

/// 過濾 ANSI 色碼序列（如 `\x1b[1m`, `\x1b[32m` 等）
/// 確保終端機輸出與 VSIX 版一致（VSCode 終端機原生處理色碼）
fn strip_ansi_codes(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // ESC 字元，開始 ANSI 序列
            if chars.peek() == Some(&'[') {
                chars.next(); // 消費 '['
                // 消費直到遇到 letter（序列結束符）
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            } else {
                // 單獨 ESC 字元，保留
                result.push(c);
            }
        } else {
            result.push(c);
        }
    }
    result
}

// SSOT: Python 套件檢查清單（從 config/python_modules.json 同步）
// 當修改 config/python_modules.json 時，必須同步更新此常數
const PYTHON_MODULES_JSON: &str = r#"[{"id":"serial","name":"pyserial","description":"MCU 通訊"},{"id":"esptool","name":"esptool (Firmware)","description":"ESP32 韌體燒錄","pipPackage":"esptool==4.7.0"},{"id":"cv2","name":"opencv-python","description":"OpenCV - 影像處理"},{"id":"mediapipe","name":"mediapipe","description":"MediaPipe - 姿態/人臉/手勢偵測"},{"id":"PIL","name":"Pillow (Image)","description":"Pillow - 影像處理"},{"id":"tensorflow","name":"tensorflow","description":"深度學習框架"},{"id":"numpy","name":"numpy","description":"數值計算"},{"id":"sklearn","name":"scikit-learn","description":"機器學習工具（class_weight）"},{"id":"matplotlib","name":"matplotlib","description":"訓練報告視覺化"},{"id":"paramiko","name":"paramiko (SSH)","description":"SSH/SFTP 連線（遠端訓練）"}]"#;

/// 終止子進程（含其子孫）。
/// Windows：`Child::kill()` 只終止直接子進程，而 `pip install` 會 spawn build backend
/// 子進程（tensorflow 等必經）。若只 kill 直接子進程，pip 子孫會殘留、持有檔案鎖，
/// 導致「中止安裝」看似成功卻無法重試 → 故改用 `taskkill /F /T` 殺整棵進程樹。
/// 其他平台無此問題，維持 `kill()`。
pub fn kill_tree(child: &mut std::process::Child) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let pid = child.id().to_string();
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
        // 保險：taskkill 失敗（如進程已結束）時仍嘗試直接 kill
        let _ = child.kill();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = child.kill();
    }
}


#[tauri::command]
pub async fn run_python(
    window: Window,
    handle: tauri::AppHandle,
    state: State<'_, AppState>,
    code: String,
    python_path: String,
) -> Result<(), String> {
    // 1. 停止該視窗的舊程序
    stop_python(window.clone(), state.clone()).await?;

    // 2. 準備暫存檔案
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join(format!("cocoya_run_{}.py", window.label()));
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    // 3. 啟動進程
    // 設定工作目錄為當前檔案的專案目錄（與 VSIX 一致），確保相對路徑（如 dataset/）能正確解析
    let current_path = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).cloned()
    };

    let work_dir = match current_path {
        Some(ref p) => p.parent().map(|d| d.to_path_buf()).unwrap_or_else(|| {
            let mut dev = std::env::current_dir().unwrap();
            if dev.ends_with("src-tauri") { dev.pop(); }
            dev
        }),
        None => {
            let mut dev = std::env::current_dir().unwrap();
            if dev.ends_with("src-tauri") { dev.pop(); }
            dev
        }
    };

    // 唯讀工作目錄防護：避免腳本相對路徑輸出（如 model/、dataset/）落到
    // Program Files 等唯讀位置而產生 PermissionError 深 traceback
    let probe_path = work_dir.join(".cocoya_write_probe");
    let work_dir_writable = fs::write(&probe_path, b"ok").is_ok();
    let _ = fs::remove_file(&probe_path);
    if !work_dir_writable {
        let _ = window.emit_to(&window.label().to_string(), "python-error", format!(
            "錯誤: 專案工作目錄不可寫（{}）。\n內建範例為唯讀，請重新開啟範例並選擇「複製並開啟」，或先另存專案到可寫位置（如 文件\\Cocoya\\Projects）再執行。",
            work_dir.display()
        ));
        return Ok(());
    }

    let mut cmd = Command::new(&python_path);
    // 編碼修復：Windows pipe 下 Python 預設輸出 cp950，Rust 端以 UTF-8 解讀會亂碼
    cmd.env("PYTHONIOENCODING", "utf-8")
       .env("PYTHONUTF8", "1");
    // 訓練模板路徑權威注入（release 從 Resource 解析，dev 從專案根），供產生碼 train_model() 使用
    cmd.env("COCOYA_TRAIN_TEMPLATES", crate::utils::get_train_templates_path(&handle));
    cmd.arg("-u") // Unbuffered mode
        .arg(&script_path)
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows: 隱藏 console 視窗
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start Python: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // 將進程存入狀態以便停止
    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

    // 4. 即時串流日誌到前端
    // 對齊 VSIX 版：顯示實際執行命令，讓使用者知道使用了哪個腳本
    let own_label = window.label().to_string();
    // 精準單播：只發給本視窗，避免多視窗終端機互相污染
    let _ = window.emit_to(&own_label, "python-log", format!(
        "& \"{}\" \"{}\"\n",
        python_path, script_path.display()
    ));

    let run_stdout_label = own_label.clone();

    let window_clone = window.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) => break, // EOF
                Ok(_) => {
                    // 用 from_utf8_lossy 處理編碼，避免中文亂碼
                    let raw = String::from_utf8_lossy(&buffer);
                    // 過濾 ANSI 色碼，對齊 VSIX 終端機輸出
                    let cleaned = strip_ansi_codes(&raw);
                    let _ = window_clone.emit_to(&run_stdout_label, "python-log", cleaned);
                }
                Err(_) => break,
            }
        }
    });

    // stderr 使用獨立事件，前端可用不同樣式顯示
    // 不再混入 stdout 串流，避免亂碼片段出現在正常輸出中
    let run_stderr_label = own_label.clone();

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) => break, // EOF
                Ok(_) => {
                    let raw = String::from_utf8_lossy(&buffer);
                    let cleaned = strip_ansi_codes(&raw);
                    let _ = window_clone_err.emit_to(&run_stderr_label, "python-error", cleaned);
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_python(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut procs = state.python_processes.lock().unwrap();
        if let Some(mut child) = procs.remove(window.label()) {
            let _ = child.kill();
        }
    }
    // 一併釋放該視窗的串列埠監看（若有），避免與執行/部署資源重疊；
    // 並清除 serial_wants：按「停止」是明確終止意圖，重新聚焦不應自動重開監看
    let own_label = window.label().to_string();
    let _ = crate::commands::mcu::stop_serial_monitor(state.clone(), own_label.clone());
    state.serial_wants.lock().unwrap().remove(&own_label);
    Ok(())
}

#[tauri::command]
pub async fn start_training(
    window: Window,
    handle: tauri::AppHandle,
    state: State<'_, AppState>,
    project_name: String,
    task_type: String,
    backend: String,
    ssh_config: Option<serde_json::Value>,
) -> Result<(), String> {
    use std::io::Write;
    
    let sidecar_path = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("resources")
        .join("dataset_manager")
        .join("dataset_sidecar.py");
    
    let mut cmd = Command::new("python");
    // 編碼修復：同 run_python，強制 UTF-8 IO，避免 cp950 亂碼
    cmd.env("PYTHONIOENCODING", "utf-8")
       .env("PYTHONUTF8", "1")
       .env("COCOYA_TRAIN_TEMPLATES", crate::utils::get_train_templates_path(&handle));
    cmd.arg(&sidecar_path)
       .stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    let mut child = cmd.spawn().map_err(|e| format!("Failed to start sidecar: {}", e))?;
    
    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;
    
    // 構建指令
    let mut command_msg = serde_json::json!({
        "command": "trainLocal",
        "requestId": "train_".to_string() + &uuid::Uuid::new_v4().to_string(),
        "projectName": project_name,
        "taskType": task_type
    });
    
    let own_label = window.label().to_string();

    // 如果是 DGX 模式，加入 SSH 配置
    if backend == "dgx" && ssh_config.is_some() {
        // 這裡應該處理 DGX 訓練流程
        // 目前先專注在本地訓練
        window.emit_to(&own_label, "training-error", serde_json::json!({
            "error": "DGX 訓練功能開發中，請使用本地訓練"
        })).ok();
        return Err("DGX training not implemented yet".to_string());
    }
    
    // 發送指令到 sidecar
    let cmd_str = serde_json::to_string(&command_msg).map_err(|e| e.to_string())?;
    stdin.write_all(cmd_str.as_bytes()).map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    drop(stdin);
    
    // 讀取回應
    let train_stdout_label = own_label.clone();

    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&l) {
                    if json.get("type") == Some(&serde_json::Value::String("event".to_string())) {
                        if json.get("event") == Some(&serde_json::Value::String("trainingLog".to_string())) {
                            let _ = window_clone.emit_to(&train_stdout_label, "training-log", json.get("data"));
                        }
                    } else if json.get("type") == Some(&serde_json::Value::String("response".to_string())) {
                        let _ = window_clone.emit_to(&train_stdout_label, "training-complete", json);
                    }
                }
            }
        }
    });
    
    // 讀取 stderr
    let train_stderr_label = own_label.clone();

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone_err.emit_to(&train_stderr_label, "training-error", serde_json::json!({"error": l}));
            }
        }
    });
    
    // 等待進程結束
    let status = child.wait().map_err(|e| e.to_string())?;
    
    if status.success() {
        Ok(())
    } else {
        Err(format!("Training process failed with exit code: {:?}", status.code()))
    }
}

#[tauri::command]
pub async fn check_environment(python_path: String) -> Result<serde_json::Value, String> {
    // 從 SSOT JSON 解析模組清單
    let module_defs: Vec<serde_json::Value> = serde_json::from_str(PYTHON_MODULES_JSON).map_err(|e| e.to_string())?;
    let module_ids: Vec<String> = module_defs.iter()
        .filter_map(|m| m.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();
    
    // 建立 Python 檢查腳本
    // 除套件狀態外，額外回報 sys.executable / python 版本：
    // 預設值是字面字串 `python`（靠 OS PATH 查找），使用者無從得知實際解析到哪個直譯器；
    // 且 Windows 的 App Execution Alias（WindowsApps\python.exe 商店 stub）會讓 python
    // 「看似存在但不可用」。回報真實路徑是「路徑無效」能被明確診斷的前提。
    let modules_json = serde_json::json!(module_ids).to_string();
    let check_script = format!(
        r#"
import importlib.util
import json
import platform
import sys

modules = {}
results = {{}}
for m in modules:
    try:
        results[m] = importlib.util.find_spec(m) is not None
    except:
        results[m] = False
print(json.dumps({{
    "results": results,
    "pythonResolvedPath": sys.executable,
    "pythonVersion": platform.python_version()
}}))
"#,
        modules_json
    );

    let mut cmd = Command::new(&python_path);
    cmd.arg("-c").arg(&check_script);
    // UTF-8 I/O 鐵律：Windows 子進程輸出若為 cp950，父端以 UTF-8 解讀會亂碼
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    // 路徑無效（spawn 失敗）不再回 Err：改回 Ok 並帶 pythonValid:false。
    // 原因：回 Err 會讓 Tauri invoke reject，前端只 console.error、不派發 environmentStatus
    // → modal 永遠停在「正在偵測…」（無提示的無限轉圈）。回 Ok 讓前端能明確顯示錯誤。
    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => {
            let mut results: HashMap<String, bool> = HashMap::new();
            for m in &module_ids {
                results.insert(m.clone(), false);
            }
            return Ok(serde_json::json!({
                "results": results,
                "modules": module_defs,
                "pythonValid": false,
                "pythonResolvedPath": "",
                "pythonVersion": "",
                "pythonError": e.to_string()
            }));
        }
    };

    // spawn 成功但 exit code 非 0：Python 存在但執行檢查腳本失敗（如損毀安裝／商店 stub）
    // → pythonValid 亦為 false，避免與「Python 正常但未安裝套件」混淆
    let (results, resolved_path, version, valid): (HashMap<String, bool>, String, String, bool) =
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            let parsed: serde_json::Value =
                serde_json::from_str(out_str.trim()).unwrap_or(serde_json::json!({}));
            let results: HashMap<String, bool> = parsed
                .get("results")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            let resolved = parsed.get("pythonResolvedPath").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let ver = parsed.get("pythonVersion").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (results, resolved, ver, true)
        } else {
            let mut results = HashMap::new();
            for m in &module_ids {
                results.insert(m.clone(), false);
            }
            (results, String::new(), String::new(), false)
        };

    // 直接使用 SSOT 的模組定義
    let modules: Vec<serde_json::Value> = module_defs.into_iter()
        .filter(|m| {
            let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
            module_ids.iter().any(|x| x == id)
        })
        .collect();

    Ok(serde_json::json!({
        "results": results,
        "modules": modules,
        "pythonValid": valid,
        "pythonResolvedPath": resolved_path,
        "pythonVersion": version
    }))
}

/// 將子進程輸出串流到前端（`install-module-log`）。
/// 抽成共用函式避免 stdout/stderr 兩份重複程式碼。
fn stream_install_output<R: std::io::Read + Send + 'static>(
    reader: R,
    window: Window,
    label: String,
    module_id: String,
    stream: &'static str,
) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) => break, // EOF
                Ok(_) => {
                    let raw = String::from_utf8_lossy(&buffer).to_string();
                    let _ = window.emit_to(&label, "install-module-log", serde_json::json!({
                        "moduleId": module_id,
                        "text": strip_ansi_codes(&raw),
                        "stream": stream
                    }));
                }
                Err(_) => break,
            }
        }
    });
}

/// 安裝單一 Python 套件（pip install）。
///
/// 為什麼不沿用 `run_python`：
/// 1. `run_python` 開頭會呼叫 `stop_python`，會殺掉使用者正在執行的程式，
///    並釋放該視窗的串列埠監看（在專案中開環境設定裝套件時會誤殺）。
/// 2. `run_python` 不回報 exit code，前端無法得知安裝完成／失敗
///    → 形成「安裝完 modal 不會更新為已安裝」。
///
/// 本命令以獨立進程 + 獨立事件回報：
/// - `install-module-log`  { moduleId, text, stream: "out"|"err" }
/// - `install-module-done` { moduleId, success, exitCode, aborted }
#[tauri::command]
pub async fn install_python_module(
    window: Window,
    state: State<'_, AppState>,
    python_path: String,
    module_id: String,
    pip_package: String,
) -> Result<(), String> {
    let own_label = window.label().to_string();

    // 防連點／防並行：同一視窗同時只允許一個 pip 安裝（並行 pip 會互相鎖檔）
    {
        let procs = state.install_processes.lock().unwrap();
        if procs.contains_key(&own_label) {
            return Err("INSTALL_ALREADY_RUNNING".to_string());
        }
    }

    let pip_pkg = if pip_package.trim().is_empty() {
        module_id.clone()
    } else {
        pip_package.trim().to_string()
    };

    let mut cmd = Command::new(&python_path);
    // --progress-bar off：pip 預設進度條以 \r 原地刷新，逐行讀取會產生大量破碎行；
    // 關閉後輸出即為乾淨的行式日誌（這是「在 modal 內顯示進度」可行的關鍵）
    cmd.args([
        "-m", "pip", "install", &pip_pkg,
        "--user",
        "--no-warn-script-location",
        "--progress-bar", "off",
        "--disable-pip-version-check",
    ]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start pip: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // 存入獨立 map 供 abort_install_module 取用（不動 python_processes）
    {
        let mut procs = state.install_processes.lock().unwrap();
        procs.insert(own_label.clone(), child);
    }

    let _ = window.emit_to(&own_label, "install-module-log", serde_json::json!({
        "moduleId": module_id,
        "text": format!("$ pip install {} --user\n", pip_pkg),
        "stream": "out"
    }));

    stream_install_output(stdout, window.clone(), own_label.clone(), module_id.clone(), "out");
    stream_install_output(stderr, window.clone(), own_label.clone(), module_id.clone(), "err");

    // 等待結束：輪詢 try_wait（每 250ms），鎖僅短暫持有，
    // 讓 abort_install_module 隨時能取得鎖執行 kill，雙方不會互相阻塞。
    // 註：abort 會先移除 map 項目，此時本執行緒靜默結束（done 事件由 abort 發出）。
    let wait_label = own_label.clone();
    let wait_mod = module_id.clone();
    let window_wait = window.clone();
    let install_procs = state.install_processes.clone();
    std::thread::spawn(move || {
        let exit_code: Option<i32> = loop {
            std::thread::sleep(std::time::Duration::from_millis(250));
            let mut procs = install_procs.lock().unwrap();
            match procs.get_mut(&wait_label) {
                Some(child) => match child.try_wait() {
                    Ok(Some(status)) => {
                        procs.remove(&wait_label);
                        break status.code();
                    }
                    Ok(None) => { /* 仍在執行 */ }
                    Err(_) => {
                        procs.remove(&wait_label);
                        break None;
                    }
                },
                None => return, // 已被 abort 移除
            }
        };

        let _ = window_wait.emit_to(&wait_label, "install-module-done", serde_json::json!({
            "moduleId": wait_mod,
            "success": exit_code == Some(0),
            "exitCode": exit_code,
            "aborted": false
        }));
    });

    Ok(())
}

/// 中止當前視窗進行中的 pip 安裝（該視窗的佇列由前端負責清空）。
///
/// 精準用詞：這是「中止安裝」＝終止子進程，**不是**「卸載」（移除已安裝套件）。
/// pip 安裝不是原子操作，中止後不會 rollback；已下載的 wheel 留在 pip 快取
/// （無害，重新安裝時會重用）。
#[tauri::command]
pub async fn abort_install_module(
    window: Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let own_label = window.label().to_string();

    let mut child = {
        let mut procs = state.install_processes.lock().unwrap();
        match procs.remove(&own_label) {
            Some(c) => c,
            None => return Ok(()), // 沒有進行中的安裝
        }
    };

    // kill_tree：Windows 下必須殺整棵進程樹（pip 會 spawn build backend 子進程）
    kill_tree(&mut child);

    let _ = window.emit_to(&own_label, "install-module-done", serde_json::json!({
        "moduleId": serde_json::Value::Null,
        "success": false,
        "exitCode": serde_json::Value::Null,
        "aborted": true
    }));

    Ok(())
}
