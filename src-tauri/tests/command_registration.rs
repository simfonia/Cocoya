//! src-tauri/tests/command_registration.rs — `#[tauri::command]` 註冊完整性守門
//!
//! # 為何需要這個測試
//!
//! P2-5（Rust 拆檔）的教訓：**編譯通過 ≠ 搬對了**。
//! `#[tauri::command]` 只是產生一個巨集 wrapper；**若忘了加進
//! `tauri::generate_handler![...]`，編譯完全通過**，但前端 `invoke('xxx')`
//! 在執行期會得到 "command not found"，且症狀是「功能無聲失效」而非報錯。
//!
//! 這個坑特別危險，因為：
//!   - 沒有編譯期訊號
//!   - 只有實際點到該功能才會發現
//!   - 拆檔時最容易漏（原本在同一個檔案，註冊清單要重新列）
//!
//! 本測試比對「`#[tauri::command]` 定義」與「`generate_handler!` 註冊」兩份清單，
//! 任一方向不一致即報錯。
//!
//! # 為何掃描原始碼而非編譯期檢查
//!
//! 理想做法是讓編譯器幫我們驗證（自製巨集列舉所有 command），
//! 但那需要大幅重構 `generate_handler!` 的展開方式，屬於架構變更而非測試。
//! 掃描原始碼是零侵入的次佳方案，且能明確指出「哪個 command、哪一檔、哪一行」。

use std::fs;
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf()
}

fn list_rs(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            list_rs(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            out.push(path);
        }
    }
}

/// 收集所有 `#[tauri::command]` 函式名 → 定義位置。
fn scan_defined_commands() -> Vec<(String, String)> {
    let src_dir = repo_root().join("src");
    let mut files = Vec::new();
    list_rs(&src_dir, &mut files);

    let mut out = Vec::new();
    for file in files {
        let rel = file
            .strip_prefix(repo_root())
            .unwrap_or(&file)
            .to_string_lossy()
            .replace('\\', "/");
        let content = match fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let lines: Vec<&str> = content.lines().collect();

        for (i, line) in lines.iter().enumerate() {
            if line.trim() != "#[tauri::command]" {
                continue;
            }
            for j in (i + 1)..(i + 4).min(lines.len()) {
                let l = lines[j].trim();
                if l.starts_with("//") || l.starts_with("#[") || l.is_empty() {
                    continue;
                }
                // 取 `fn <name>`（允許 pub / async 前置）
                if let Some(pos) = l.find("fn ") {
                    let after = &l[pos + 3..];
                    let name: String = after
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '_')
                        .collect();
                    if !name.is_empty() {
                        out.push((name, format!("{}:{}", rel, i + 1)));
                    }
                }
                break;
            }
        }
    }
    out
}

/// 解析 `lib.rs` 中 `tauri::generate_handler![ ... ]` 內註冊的項目。
///
/// 取最後一段（Rust 的 command 路徑慣例為 `commands::module::name`）作為比對鍵，
/// 因為同一個 command 可能以不同模組路徑註冊。
fn parse_registered_commands() -> Vec<String> {
    let lib = fs::read_to_string(repo_root().join("src").join("lib.rs")).unwrap_or_default();
    let start = match lib.find("generate_handler!") {
        Some(s) => s,
        None => return Vec::new(),
    };
    let end = match lib[start..].find("])") {
        Some(e) => start + e,
        None => lib.len(),
    };
    let block = &lib[start..end];

    block
        .split(',')
        .filter_map(|item| {
            let t = item.trim();
            if t.is_empty() || t.starts_with("//") {
                None
            } else {
                Some(t.rsplit("::").next().unwrap_or(t).to_string())
            }
        })
        .collect()
}

#[test]
fn lib_rs_registers_commands() {
    // 自檢：必須能解析到註冊清單，否則後續斷言是假綠
    let registered = parse_registered_commands();
    assert!(
        registered.len() >= 40,
        "只從 lib.rs 解析到 {} 個註冊 command（預期 >= 40）；\
         generate_handler! 區塊的解析方式可能已失效",
        registered.len()
    );
}

#[test]
fn command_scanner_finds_definitions() {
    // 自檢：掃描器必須找得到 command，否則下面的比對形同虛設
    let defined = scan_defined_commands();
    assert!(
        defined.len() >= 40,
        "只掃到 {} 個 #[tauri::command]（預期 >= 40）；掃描器可能失效",
        defined.len()
    );
}

#[test]
fn every_defined_command_is_registered() {
    // [2026-10-04 P3-3] `start_training` 已連同整條舊訓練鏈刪除，故無需白名單。
    // 若日後新增 command 卻未註冊，必須在此附原因並確認真的存在。
    const KNOWN_UNREGISTERED: &[&str] = &[];

    let registered: Vec<String> = parse_registered_commands();
    let offenders: Vec<String> = scan_defined_commands()
        .into_iter()
        .filter(|(name, _)| !registered.contains(name))
        .filter(|(name, _)| !KNOWN_UNREGISTERED.contains(&name.as_str()))
        .map(|(name, loc)| {
            format!(
                "{} 未註冊進 generate_handler! —— 前端 invoke 會得到 command not found",
                loc
            )
        })
        .collect();

    assert!(
        offenders.is_empty(),
        "以下 #[tauri::command] 未註冊（編譯通過但執行期失效，P2-5 同型坑）：\n  {}",
        offenders.join("\n  ")
    );
}

#[test]
fn no_registered_command_is_missing_its_definition() {
    // 反方向：註冊了卻沒有定義 —— 這會讓 generate_handler! 編譯失敗，
    // 但若日後有人改了展開方式，可能不再有編譯期保護，故一併釘死。
    let defined: Vec<String> = scan_defined_commands().into_iter().map(|(n, _)| n).collect();
    let dangling: Vec<String> = parse_registered_commands()
        .into_iter()
        .filter(|n| !defined.contains(n))
        .collect();

    assert!(
        dangling.is_empty(),
        "generate_handler! 註冊了不存在的 command：\n  {}",
        dangling.join("\n  ")
    );
}