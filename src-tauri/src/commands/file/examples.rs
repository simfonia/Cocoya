// P2-5（2026-10-03）自 file.rs 拆分。內建範例：路徑守衛、複製並開啟、seed 還原
//! 純搬移：對外 API 與行為完全不變。


use std::fs;
use tauri::{AppHandle, Window, Manager};
use tauri_plugin_dialog::DialogExt;
use crate::utils::get_examples_path;


pub(crate) fn resolve_example_open_path(window: &Window, handle: &AppHandle, path: std::path::PathBuf) -> Result<std::path::PathBuf, String> {
    let examples_dir = get_examples_path(handle);
    if !path.starts_with(&examples_dir) || crate::utils::is_dev_examples_dir() {
        return Ok(path);
    }

    // 已播種的 AppData examples 副本為「可寫工作副本」（seeding 2026-09-17）：
    // 直接開啟，不再要求複製到桌面。唯讀保護僅針對 Resource（Program Files）內的範例。
    let seed_dir = crate::utils::get_examples_seed_dir(handle);
    if path.starts_with(&seed_dir) {
        return Ok(path);
    }

    let confirmed = handle.dialog()
        .message("此為內建唯讀範例，是否複製到使用者工作區（桌面\\Cocoya\\Projects）？\nThis built-in example is read-only. Copy it to your user workspace?")
        .title("Cocoya")
        .parent(window)
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
            "複製並開啟".into(),
            "取消".into(),
        ))
        .blocking_show();
    if !confirmed {
        return Err("EXAMPLES_READ_ONLY".into());
    }

    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid example path".to_string())?
        .to_string();
    let src_dir = path.parent().ok_or_else(|| "Invalid example path".to_string())?.to_path_buf();

    // 2026-09-16：複製目的地由「文件」改為「桌面」（使用者指示）
    let desktop = handle.path().desktop_dir().map_err(|e| e.to_string())?;
    let projects_root = desktop.join("Cocoya").join("Projects");
    fs::create_dir_all(&projects_root).map_err(|e| e.to_string())?;

    // 複製粒度判斷：
    // - 專案型範例（資料夾含 dataset/ 或 model/，多個相關 xml 共用資料集/模型輸出）→ 整包複製
    // - 單檔型範例（Basic/πCar/Mediapipe 等互相獨立的 xml）→ 只複製該 xml 與共用子資料夾
    //   （如 Mediapipe/resources/，維持 xml 內相對路徑引用可用；不複製其他 .xml 兄弟範例）
    let is_project_example = src_dir.join("dataset").is_dir() || src_dir.join("model").is_dir();

    let base_name = if is_project_example {
        src_dir.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("example")
            .to_string()
    } else {
        path.file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("example")
            .to_string()
    };
    let mut dst_dir = projects_root.join(&base_name);
    let mut n = 2;
    while dst_dir.exists() {
        dst_dir = projects_root.join(format!("{}_{}", base_name, n));
        n += 1;
    }

    if is_project_example {
        copy_dir_recursive(&src_dir, &dst_dir)?;
    } else {
        fs::create_dir_all(&dst_dir).map_err(|e| e.to_string())?;
        fs::copy(path, dst_dir.join(&file_name)).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                copy_dir_recursive(&entry.path(), &dst_dir.join(entry.file_name()))?;
            }
        }
    }
    Ok(dst_dir.join(file_name))
}

/// 遞迴複製資料夾（不覆寫目標，因為呼叫端已確保 dst 不存在）
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
