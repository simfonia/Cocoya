//! src-tauri/tests/serde_contract.rs — Rust → JS 序列化契約守門
//!
//! # 為何需要這個測試
//!
//! AGENTS.md 記載了兩次**完全相同**的踩坑：
//!   - 2026-07-29 `ScanedImage.blob_url`（Rust 預設 snake → 前端 `img.blobUrl` undefined，縮圖失效）
//!   - 2026-08-10 `ProjectAnchor.is_anchored`（未加 serde → 前端 `projectRoot` undefined，
//!     導致 Tauri live 影像 savePath 無法生成、拍照不落盤）
//!
//! 兩次的共同特徵：**`cargo check` 完全通過**，因為編譯器不檢查序列化欄位名。
//! 前端已有 `_normalizeAnchor` 雙保險可救回 anchor，但**其餘 struct 沒有**。
//!
//! 本測試把 AGENTS.md 的鐵律轉成可執行斷言：跨邊界（Rust → JS）的
//! `Serialize` 結構必須有 `#[serde(rename_all = "camelCase")]`。
//!
//! # 為何是掃描原始碼而非序列化實例
//!
//! 理想做法是 `serde_json::to_value(Struct{..})` 斷言欄位名，但那需要把 11 個
//! struct 從 `pub(crate)` 提升為 `pub` 並從 lib 匯出 —— 為了測試而改動公開 API，
//! 風險大於收益。掃描原始碼是次佳但零侵入的方案。
//!
//! 若日後重構讓這些 struct 可被測試存取，**應改用序列化實例斷言**（更強，
//! 且能驗證 `#[serde(skip)]` 等進階屬性），屆時刪除本檔。

use std::fs;
use std::path::{Path, PathBuf};

/// 專案根（src-tauri/ 的上一層）。
fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf()
}

/// 遞迴列出 src/ 下所有 .rs 檔。
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

/// 一個 `#[derive(Serialize)]` struct 的資訊。
struct StructInfo {
    file: String,
    line: usize,
    name: String,
    has_camel_case: bool,
    /// 是否有 snake_case 欄位（若無則缺 rename_all 無實害）
    has_snake_field: bool,
}

/// 掃描全部 Serialize struct。
///
/// 判讀規則（刻意保守，寧可多報不可漏報）：
/// - `#[derive(... Serialize ...)]` 與 `pub struct X` 之間若出現 `rename_all`
///   即視為已設定。
/// - snake_case 欄位定義為含至少一個底線、且非全大寫常數的欄位名。
fn scan_serialize_structs() -> Vec<StructInfo> {
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
            if !line.contains("derive(") || !line.contains("Serialize") {
                continue;
            }
            // 往後找最近的 struct 宣告（允許中間夾雜屬性行）
            let mut found = None;
            for j in (i + 1)..(i + 6).min(lines.len()) {
                let l = lines[j].trim();
                if l.starts_with("//") || l.starts_with("#[") || l.is_empty() {
                    continue;
                }
                let rest = l
                    .strip_prefix("pub struct ")
                    .or_else(|| l.strip_prefix("struct "));
                if let Some(rest) = rest {
                    let name: String = rest
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '_')
                        .collect();
                    if !name.is_empty() {
                        found = Some((j, name));
                    }
                    break;
                }
            }
            let (struct_line, name) = match found {
                Some(v) => v,
                None => continue,
            };

            // 屬性區段：derive 行到 struct 行之間是否有 rename_all
            let attr_seg: String = lines[i..struct_line].join("\n");
            let has_camel_case = attr_seg.contains("camelCase");

            // struct 內容是否有 snake_case 欄位
            let mut has_snake_field = false;
            for j in (struct_line + 1)..(struct_line + 40).min(lines.len()) {
                let l = lines[j].trim();
                if l.starts_with('}') {
                    break;
                }
                let field = l
                    .strip_prefix("pub ")
                    .unwrap_or_else(|| l.strip_prefix("pub(crate) ").unwrap_or(""));
                if let Some(rest) = field.split(':').next() {
                    let fname = rest.trim();
                    if fname.contains('_')
                        && !fname.chars().all(|c| c.is_ascii_uppercase() || c == '_')
                    {
                        has_snake_field = true;
                        break;
                    }
                }
            }

            out.push(StructInfo {
                file: rel.clone(),
                line: i + 1,
                name,
                has_camel_case,
                has_snake_field,
            });
        }
    }
    out
}

#[test]
fn serialize_structs_are_discovered() {
    // 自檢：掃描器本身必須找得到東西，否則後續斷言會是「假綠」
    let structs = scan_serialize_structs();
    assert!(
        structs.len() >= 10,
        "只掃到 {} 個 Serialize struct（預期 >= 10）；掃描器可能失效，\
         本測試會變成永遠通過的假安全感",
        structs.len()
    );
}

#[test]
fn every_cross_boundary_struct_uses_camel_case() {
    // 已知例外：OpenFileResult 的 is_read_only 走「送端 snake_case」路線，
    // 前端 controller.js / persistence.js 亦全鏈使用 is_read_only，功能正常。
    //
    // ⚠️ 這是**與 AGENTS.md 鐵律相反方向**的雙保險（_normalizeAnchor 是讀端相容）：
    //   若日後有人依鐵律替它加上 rename_all，前端會立刻壞掉且無任何報錯。
    //   故以白名單釘死，並在移除白名單時強制同步改前端。
    const KNOWN_SNAKE_CASE_EXCEPTIONS: &[&str] = &["OpenFileResult"];

    let offenders: Vec<String> = scan_serialize_structs()
        .into_iter()
        .filter(|s| !s.has_camel_case)
        .filter(|s| s.has_snake_field)   // 無 snake 欄位者缺 rename_all 無實害
        .filter(|s| !KNOWN_SNAKE_CASE_EXCEPTIONS.contains(&s.name.as_str()))
        .map(|s| {
            format!(
                "{}:{} {} 含 snake_case 欄位卻無 #[serde(rename_all = \"camelCase\")]",
                s.file, s.line, s.name
            )
        })
        .collect();

    assert!(
        offenders.is_empty(),
        "跨邊界 struct 缺 camelCase（前端讀 camelCase 會得到 undefined）：\n  {}",
        offenders.join("\n  ")
    );
}

#[test]
fn camel_case_exceptions_stay_synchronised_with_frontend() {
    // 白名單的核心代價：一旦前端改用 camelCase，這裡必須同步移除，否則會掩蓋真正的違規。
    // 檢查方式：OpenFileResult 若已加 camelCase，白名單就該清空。
    let structs = scan_serialize_structs();
    let open_file = structs.iter().find(|s| s.name == "OpenFileResult");

    if let Some(s) = open_file {
        // 語意：白名單存在的前提是「它沒有 camelCase」。
        // 一旦有人依鐵律替它加上 camelCase，白名單就會開始掩蓋真正的違規 —— 此時必須報錯。
        assert!(
            !s.has_camel_case,
            "OpenFileResult 已加上 rename_all = \"camelCase\" —— \
             請同步移除 KNOWN_SNAKE_CASE_EXCEPTIONS 白名單，\
             並確認前端 controller.js / persistence.js 已改讀 isReadOnly"
        );
    }
}
