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
    // 開發模式：優先使用專案根目錄的 examples（修改時直接改到原始檔案）
    let mut dev_path = std::env::current_dir().unwrap();
    if dev_path.ends_with("src-tauri") {
        dev_path.pop();
    }
    dev_path.push("examples");
    if dev_path.exists() {
        return dev_path;
    }

    // 生產模式：從 Resource 目錄解析 examples
    let resource_path = handle
        .path()
        .resolve("examples", tauri::path::BaseDirectory::Resource);

    match resource_path {
        Ok(p) if p.exists() => p,
        _ => dev_path // 最後 fallback
    }
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
