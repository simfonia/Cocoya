use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_resource_path(handle: &AppHandle, relative_path: &str) -> PathBuf {
    let resource_path = handle
        .path()
        .resolve(format!("resources/{}", relative_path), tauri::path::BaseDirectory::Resource);

    match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            // Fallback: Development mode
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") {
                dev_path.pop();
            }
            dev_path.push("ui");
            dev_path.push("src");
            
            for part in relative_path.split('/') {
                dev_path.push(part);
            }
            dev_path
        }
    }
}

pub fn get_deployer_path(handle: &AppHandle) -> PathBuf {
    let resource_path = handle.path().resolve("resources/deploy_mcu.py", tauri::path::BaseDirectory::Resource);
    match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") {
                dev_path.pop();
            }
            dev_path.push("resources");
            dev_path.push("deploy_mcu.py");
            dev_path
        }
    }
}

pub fn get_examples_path(handle: &AppHandle) -> PathBuf {
    // 修復：BaseDirectory::Resource 的 resolve() 可能回傳 canonicalized 路徑（\\?\ 前綴），
    // 而檔案對話框回傳普通路徑 → starts_with 比對永遠失敗（範例唯讀保護會被跳過）→ 統一剝除前綴
    fn normalize(p: PathBuf) -> PathBuf {
        let s = p.to_string_lossy().to_string();
        match s.strip_prefix(r"\\?\") {
            Some(stripped) => PathBuf::from(stripped),
            None => p,
        }
    }

    // 開發模式：優先使用專案根目錄的 examples（修改時直接改到原始檔案）
    let mut dev_path = std::env::current_dir().unwrap();
    if dev_path.ends_with("src-tauri") {
        dev_path.pop();
    }
    dev_path.push("examples");
    if dev_path.exists() {
        return normalize(dev_path);
    }

    // 生產模式：從 Resource 目錄解析 examples
    let resource_path = handle
        .path()
        .resolve("examples", tauri::path::BaseDirectory::Resource);

    match resource_path {
        Ok(p) if p.exists() => normalize(p),
        _ => dev_path // 最後 fallback
    }
}

pub fn get_train_templates_path(handle: &AppHandle) -> PathBuf {
    // 修復：BaseDirectory::Resource 的 resolve() 可能回傳 canonicalized 路徑（\\?\ 前綴），
    // \\?\ 模式下 Windows 不正規化 '..' 與混合斜線（同 dataset_sidecar.py WinError 123 坑），
    // Python 端 import/子進程路徑處理都會出問題 → 統一在此剝除前綴
    fn normalize(p: PathBuf) -> PathBuf {
        let s = p.to_string_lossy().to_string();
        match s.strip_prefix(r"\\?\") {
            Some(stripped) => PathBuf::from(stripped),
            None => p,
        }
    }

    // 開發模式：優先使用專案根目錄的 train_templates
    let mut dev_path = std::env::current_dir().unwrap();
    if dev_path.ends_with("src-tauri") {
        dev_path.pop();
    }
    dev_path.push("resources");
    dev_path.push("train_templates");
    if dev_path.exists() {
        return normalize(dev_path);
    }

    // 生產模式：從 Resource 目錄解析
    let resource_path = handle
        .path()
        .resolve("resources/train_templates", tauri::path::BaseDirectory::Resource);

    match resource_path {
        Ok(p) if p.exists() => normalize(p),
        _ => dev_path // 最後 fallback
    }
}

/// 判斷目前 examples 是否為 repo 開發模式原始檔（可直接開啟修改、不需複製）
/// 注意：不可用「examples 目錄存在」判斷——Release 安裝目錄（C:\Program Files\Cocoya）
/// 也內含打包的 examples，會被誤判為 dev。改以 repo 標記（src-tauri 目錄）判定。
pub fn is_dev_examples_dir() -> bool {
    let mut dev_path = std::env::current_dir().unwrap();
    if dev_path.ends_with("src-tauri") {
        dev_path.pop();
    }
    dev_path.push("src-tauri");
    dev_path.exists()
}

pub fn get_firmware_dir(handle: &AppHandle, model: &str) -> PathBuf {
    let resource_path = handle.path().resolve(
        format!("resources/firmware/MicroPython/{}", model),
        tauri::path::BaseDirectory::Resource
    );

    match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            // Fallback: Development mode
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") {
                dev_path.pop();
            }
            dev_path.push("resources");
            dev_path.push("firmware");
            dev_path.push("MicroPython");
            dev_path.push(model);
            dev_path
        }
    }
}
