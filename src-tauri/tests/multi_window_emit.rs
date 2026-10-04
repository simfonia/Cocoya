//! src-tauri/tests/multi_window_emit.rs — 多視窗事件發送守門（emit_to 鐵則）
//!
//! # 為何需要這個測試
//!
//! AGENTS.md「多視窗完整性協議」的**精準通訊（emit_to 鐵則）**：
//! 發送「視窗專屬」事件時**一律**使用 `window.emit_to(&label, ...)`；
//! **嚴禁**使用全域廣播的 `emit`（含 `window_clone.emit(...)`）。
//!
//! 違規後果不是報錯，而是**事件送達每個視窗的 listener** ——
//! 多視窗終端機／對話框互相污染，且症狀隨開窗數量變化而變（難以重現）。
//!
//! 現況：23 處全部使用 `emit_to`，鐵則已被遵守。本守門防止未來退化。
//!
//! # 已知且刻意的例外
//!
//! `emit_to(&window.label().to_string(), ...)` 這種寫法雖然繞了彎，
//! 但**仍是 emit_to**，語意正確，故不列入違規。
//!
//! 本守門**只擋全域廣播**（`emit` / `emit_all` / `emit_filter`），
//! 不評判 `emit_to` 的第一個參數是否合理（那是另一個問題）。

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

/// 找出所有全域廣播呼叫（`emit(`、`emit_all(`、`emit_filter(`）。
///
/// 判讀需排除：
/// - `emit_to(` / `emit_to_once(`（正確寫法）
/// - 註解行
/// - 屬性存取如 `.emit(` 前的識別字已是 emit_to 的情況
fn find_global_broadcasts() -> Vec<(String, usize, String)> {
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

        for (i, line) in content.lines().enumerate() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("//") || trimmed.starts_with("///") || trimmed.starts_with("*") {
                continue;
            }
            for banned in ["emit_all(", "emit_filter(", "emit("] {
                // needle 已含結尾括號：`emit_to(` 不會匹配 `emit(`（emit 後面接的是 _）
                let needle = format!(".{}", banned);
                if let Some(idx) = line.find(&needle) {
                    // 跳過行內註解（含 // 的整行，或 // 之後的內容）
                    let before = line[..idx].trim_end();
                    if !before.ends_with("//") && !before.ends_with("//*") {
                        out.push((rel.clone(), i + 1, line.trim().to_string()));
                    }
                }
            }
        }
    }
    out
}

#[test]
fn emit_scanner_finds_the_known_good_baseline() {
    // 自檢：掃描器必須找得到 emit_to，否則「沒有違規」會是假綠
    let src_dir = repo_root().join("src");
    let mut files = Vec::new();
    list_rs(&src_dir, &mut files);
    let emit_to_count: usize = files
        .iter()
        .filter_map(|f| fs::read_to_string(f).ok())
        .map(|c| c.matches("emit_to(").count())
        .sum();

    assert!(
        emit_to_count >= 20,
        "只找到 {} 處 emit_to（預期 >= 20）；掃描器可能失效，\
         「無全域廣播」的結論會是假綠",
        emit_to_count
    );
}

#[test]
fn no_global_broadcast_is_used() {
    let offenders = find_global_broadcasts();
    let detail: Vec<String> = offenders
        .iter()
        .map(|(f, l, src)| format!("{}:{}  {}", f, l, src))
        .collect();

    assert!(
        offenders.is_empty(),
        "偵測到全域廣播（多視窗下會互相污染，AGENTS.md emit_to 鐵則）：\n  {}",
        detail.join("\n  ")
    );
}