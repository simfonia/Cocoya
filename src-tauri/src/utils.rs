use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Manager};

/// 剝除 BaseDirectory::Resource resolve() 可能回傳的 canonicalized 前綴（\\?\）
fn strip_extended_prefix(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy().to_string();
    match s.strip_prefix(r"\\?\") {
        Some(stripped) => PathBuf::from(stripped),
        None => p,
    }
}

/// 遞迴合併複製：將 src 內容複製到 dst，已存在的檔案跳過（不覆寫），回傳複製的檔案數。
/// （原 file.rs 內部函式，2026-09-17 移至 utils 供 examples seeding 共用）
pub fn copy_dir_merge(src: &std::path::Path, dst: &std::path::Path) -> Result<u64, String> {
    fs::create_dir_all(dst).map_err(|e| format!("IO_ERROR: Failed to create dir {}: {}", dst.display(), e))?;
    let mut copied: u64 = 0;
    let entries = fs::read_dir(src).map_err(|e| format!("IO_ERROR: Failed to read {}: {}", src.display(), e))?;
    for entry in entries.flatten() {
        let target = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copied += copy_dir_merge(&entry.path(), &target)?;
        } else if !target.exists() {
            fs::copy(entry.path(), &target)
                .map_err(|e| format!("IO_ERROR: Failed to copy {}: {}", entry.path().display(), e))?;
            copied += 1;
        }
    }
    Ok(copied)
}

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
        strip_extended_prefix(p)
    }

    // 開發模式：優先使用專案根目錄的 examples（修改時直接改到原始檔案）
    // ★ 必須以 is_dev_examples_dir()（repo 標記 src-tauri 目錄）守門：Release 安裝目錄
    //   （Program Files\Cocoya）也內含打包的 examples，且從捷徑啟動時 current_dir＝exe 目錄，
    //   若僅以「examples 目錄存在」判斷會誤判為 dev 而跳過 AppData seeded 副本（2026-09-17 實機 bug）。
    if is_dev_examples_dir() {
        let mut dev_path = std::env::current_dir().unwrap();
        if dev_path.ends_with("src-tauri") {
            dev_path.pop();
        }
        dev_path.push("examples");
        if dev_path.exists() {
            return normalize(dev_path);
        }
    }

    // 生產模式：優先使用 AppData 已播種（seeded）的 examples 副本（可寫、升級只補缺檔）。
    // 判定：.seeded_version 戳記存在，或目錄非空（防止 copy_dir_merge 中途失敗導致
    // 戳記永遠不寫、每次啟動都 fallback 回 Program Files——2026-09-17 實機 bug）。
    let seed_dir = get_examples_seed_dir(handle);
    if seed_dir.join(".seeded_version").exists() || dir_has_entries(&seed_dir) {
        return normalize(seed_dir);
    }

    // 生產模式 fallback：從 Resource 目錄解析 examples（維持唯讀保護的「複製並開啟」流程）
    let resource_path = handle
        .path()
        .resolve("examples", tauri::path::BaseDirectory::Resource);

    match resource_path {
        Ok(p) if p.exists() => normalize(p),
        // 最後 fallback：exe 同目錄（Resource）的 examples；極端情況（resolve 失敗）回空路徑
        _ => match handle.path().resource_dir() {
            Ok(r) => normalize(r.join("examples")),
            Err(_) => PathBuf::new()
        }
    }
}

/// examples 的 AppData 播種目錄（可寫的正本位置）：
/// %AppData%\com.cocoya.app\examples。唯讀保護流程（開啟時複製到桌面工作區）不變。
pub fn get_examples_seed_dir(handle: &AppHandle) -> PathBuf {
    match handle.path().app_data_dir() {
        Ok(base) => base.join("examples"),
        Err(_) => std::env::temp_dir().join("cocoya").join("examples"),
    }
}

/// 目錄存在且至少有一個 entry（含子目錄/檔案）
fn dir_has_entries(p: &std::path::Path) -> bool {
    p.is_dir() && fs::read_dir(p).map(|mut d| d.next().is_some()).unwrap_or(false)
}

/// 播種失敗診斷落地（Release 無 console，eprintln 看不到）：
/// 寫入 app_data_dir/examples_seed_error.log（成功後不刪除，僅覆寫最後一次錯誤）
fn log_seed_error(handle: &AppHandle, msg: &str) {
    let path = handle
        .path()
        .app_data_dir()
        .map(|d| d.join("examples_seed_error.log"))
        .unwrap_or_else(|_| std::env::temp_dir().join("cocoya_examples_seed_error.log"));
    let _ = fs::write(&path, format!("{}\n", msg));
}

/// 首次啟動／升級時，將打包在 Resource 的 examples 播種（只補缺檔，不覆寫既有檔）到
/// AppData 的可寫目錄，並寫入 .seeded_version 版本戳記。Dev 模式直接跳過（用 repo 原始檔）。
/// 失敗時回傳 false（get_examples_path 會 fallback 回 Resource examples，行為不壞）。
pub fn ensure_examples_seeded(handle: &AppHandle) -> bool {
    if is_dev_examples_dir() {
        return false;
    }
    let src = match handle.path().resolve("examples", tauri::path::BaseDirectory::Resource) {
        Ok(p) => strip_extended_prefix(p),
        Err(e) => {
            let m = format!("[examples-seed] resolve resource failed: {}", e);
            eprintln!("{}", m);
            log_seed_error(handle, &m);
            return false;
        }
    };
    if !src.exists() {
        let m = format!("[examples-seed] resource examples not found: {}", src.display());
        eprintln!("{}", m);
        log_seed_error(handle, &m);
        return false;
    }
    let dst = get_examples_seed_dir(handle);
    match copy_dir_merge(&src, &dst) {
        Ok(_) => {
            let version = handle.package_info().version.to_string();
            let _ = fs::write(dst.join(".seeded_version"), version);
            true
        }
        Err(e) => {
            let m = format!(
                "[examples-seed] copy failed (src={} dst={}): {}",
                src.display(),
                dst.display(),
                e
            );
            eprintln!("{}", m);
            log_seed_error(handle, &m);
            false
        }
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
