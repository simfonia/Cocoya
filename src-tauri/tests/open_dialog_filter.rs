//! src-tauri/tests/open_dialog_filter.rs — 開啟對話框副檔名白名單守門
//!
//! # 為何需要這個測試
//!
//! 2026-10-11 定案「程式設計實驗室」模型後：**cocoya 不管理 `.py`**（`.py` 是非受管
//! 匯出物，實驗室中的「存檔」＝ 原生存檔對話框寫檔）。開啟對話框只認積木專案 XML。
//!
//! 曾經（D-1）`open_file` 允許 `["xml", "py"]`，並由前端 `detectContentKind`
//! 判斷內容型別分叉。但實驗室模型取代該設計後，前端 `controller.loadWorkspace`
//! **一律把內容當 XML 載入積木區**（`loadWorkspace` 已無 py 分叉）→
//! 若對話框仍允許選 `.py`，使用者會得到「空白畫布」或 XML 解析失敗，
//! 且**沒有任何錯誤訊息**（計畫 §185 記載的風險）。
//!
//! 這個坑特別陰險，因為：
//!   - Rust 端編譯完全通過（只是個字串陣列）
//!   - 前端也有 `detectContentKind` 等零件庫函式「看起來支援」，造成虛假安全感
//!   - 只有實際去開一個 .py 才會發現，症狀是靜默空白而非報錯
//!
//! 本測試掃描 `open_file` 的 `add_filter`，斷言其副檔名白名單為 `["xml"]`。

use std::fs;
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf()
}

/// 取出 `open_file` command 本體（從 `pub async fn open_file` 到下一個 `#[tauri::command]`）。
fn open_file_body(src: &str) -> String {
    let start = src
        .find("pub async fn open_file")
        .expect("找不到 open_file command");
    let rest = &src[start..];
    let end = rest.find("#[tauri::command]").unwrap_or(rest.len());
    rest[..end].to_string()
}

#[test]
fn open_file_dialog_must_only_accept_xml() {
    let p = repo_root().join("src").join("commands").join("file").join("openfile.rs");
    let src = fs::read_to_string(&p).expect("讀不到 openfile.rs");
    let body = open_file_body(&src);

    // 斷言白名單字面值：實驗室模型下 .py 非受管，對話框不得提供。
    assert!(
        !body.contains("\"py\""),
        "open_file 的 add_filter 不得含 \"py\"：實驗室模型下 cocoya 不管理 .py，\n\
         前端 loadWorkspace 一律把內容當 XML 解析 → 選 .py 會得到空白畫布且無錯誤訊息。\n\
         若要恢復受管 .py，必須先讓前端 loadWorkspace 有 py 分叉（detectContentKind），\n\
         並同步更新本測試。當前本體：\n{}",
        body
    );
    assert!(
        body.contains("&[\"xml\"]"),
        "open_file 的 add_filter 必須是 &[\"xml\"]（只認積木專案）。當前本體：\n{}",
        body
    );
}

#[test]
fn save_lab_py_dialog_still_offers_py() {
    // 反向保護：實驗室的「存檔」＝ 匯出 .py，該對話框**必須**仍提供 py filter。
    // 兩個對話框方向相反，只守一邊會在改動時默默破壞另一個。
    let p = repo_root()
        .join("src")
        .join("commands")
        .join("file")
        .join("savefile.rs");
    let src = fs::read_to_string(&p).expect("讀不到 savefile.rs");

    let start = src.find("fn save_lab_py").expect("找不到 save_lab_py");
    let body = &src[start..];
    assert!(
        body.contains("&[\"py\"]"),
        "save_lab_py（實驗室匯出 .py）的 add_filter 必須含 &[\"py\"]，否則匯出副檔名會是 XML。"
    );
}

