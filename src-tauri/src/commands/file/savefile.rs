// P2-5（2026-10-03）自 file.rs 拆分。存檔（含另存新檔、examples 唯讀保護、跨視窗檔案鎖）
//! 純搬移：對外 API 與行為完全不變。


use std::fs;
use tauri::{AppHandle, State, Window};
use tauri_plugin_dialog::DialogExt;
use crate::state::AppState;
use crate::utils::get_examples_path;


#[tauri::command]
pub async fn save_file(window: Window, handle: AppHandle, state: State<'_, AppState>, xml: String, save_as: bool, force_examples: Option<bool>, dialog_title: Option<String>, code: Option<String>, is_text_mode: Option<bool>) -> Result<String, String> {
    // 2026-10-10 C-3：文字模式存 .py —— 前端送 {code, isTextMode}，
    // 舊調用不帶此二欄位（None）即走原 XML 路（向後相容，invoke 守門驗 camelCase 對應）。
    let is_text = is_text_mode.unwrap_or(false);
    // 落盤內容：文字模式用 code（fileOps.js 已補檔頭平台行），否則用 xml
    let content = if is_text {
        code.unwrap_or(xml.clone())
    } else {
        xml.clone()
    };
    let _ = &xml;
    let allow_examples = force_examples.unwrap_or(false);
    let current_path = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).cloned()
    };
    let mut path_to_save = if save_as { None } else { current_path.clone() };

    if path_to_save.is_none() {
        // C-3：文字模式預設 .py（未錨定首存／另存）；積木維持 .xml
        let mut builder = handle.dialog().file();
        if is_text {
            builder = builder
                .add_filter("Python", &["py"])
                .add_filter("Cocoya XML", &["xml"])
                .set_file_name("未命名專案.py");
        } else {
            builder = builder
                .add_filter("Cocoya XML", &["xml"])
                .set_file_name("未命名專案.xml");
        }
        // 開新專案流程（saveFileAs + tag=newProject）時用「開新專案」語意標題，
        // 避免與「另存專案」混淆（前端於 data.tag==='newProject' 時傳入）。
        if let Some(title) = dialog_title {
            builder = builder.set_title(&title);
        }
        let picked = builder.blocking_save_file();
        
        if let Some(p) = picked {
            let path = p.into_path().map_err(|_| "Failed to parse save path".to_string())?;
            path_to_save = Some(path);
        } else {
            return Err("Canceled".into());
        }
    }

    if let Some(path) = path_to_save {
        // ★ 另存到不同路徑時，釋放本視窗持有的**舊檔鎖**（2026-10-03 修正）。
        //   「開新專案」流程（saveFileAs + tag=newProject）走的正是這條路徑：
        //   視窗1 開 A → 開新專案存成 B → locks[A] 仍指向視窗1，與 open_file 同型洩漏。
        //   只在「目標路徑 ≠ 目前路徑」時釋放：存回原檔（save_as=false）時必須保留鎖，
        //   否則兩視窗可同時寫入同一檔案。
        //   另注意不可無條件釋放 —— 使用者取消另存時（上面的 blocking_save_file 回 None），
        //   本視窗仍持有原檔，釋放會讓他人誤以為可搶佔。
        if current_path.as_ref() != Some(&path) {
            crate::state::release_file_locks_for(&state, window.label());
        }

        // ★ 防呆（2026-09-06）：另存/開新專案若命中「目前專案檔」位置，禁止覆寫自己。
        // 開新專案時 saveFileAs 寫入的是目標平台的乾淨初始積木（非工作區內容），
        // 若使用者誤把「另存」存到與原檔相同路徑，原檔內容會被乾淨初始積木覆寫。此判斷
        // 無論是否 examples 目錄都成立，先於 examples 檢查執行。
        if save_as {
            if let Some(ref current) = current_path {
                if &path == current {
                    return Err("SAME_AS_CURRENT".to_string());
                }
            }
        }

        // --- 檢查是否為 examples 目錄 ---
        // 已播種的 AppData examples 副本（seeding 2026-09-17）為可寫工作副本，可直接存檔；
        // 唯讀保護僅針對 Resource（Program Files）內的範例（seeding 失敗時的 fallback）。
        let examples_dir = get_examples_path(&handle);
        let in_examples = path.starts_with(&examples_dir)
            && !path.starts_with(crate::utils::get_examples_seed_dir(&handle));
        if in_examples {
            if !allow_examples {
                if save_as {
                    if let Some(ref current) = current_path {
                        if &path == current {
                            return Err("EXAMPLES_PATH".to_string());
                        }
                    }
                } else {
                    return Err("EXAMPLES_PATH".to_string());
                }
            }
        }

        {
            let mut locks = state.file_locks.lock().unwrap();
            if let Some(owner) = locks.get(&path) {
                if owner != window.label() {
                    return Err("檔案已被其他視窗開啟，無法存回原檔，請使用另存新檔。".to_string());
                }
            } else {
                locks.insert(path.clone(), window.label().to_string());
            }
        }

        let bak_path = path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()));
        
        fs::write(&path, &content).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path);
        }

        if bak_path.exists() { let _ = fs::remove_file(bak_path); }
        let temp_dir = std::env::temp_dir().join("cocoya_tauri");
        let untitled_bak = temp_dir.join(format!("untitled_backup_{}.xml", window.label()));
        if untitled_bak.exists() { let _ = fs::remove_file(untitled_bak); }
        
        Ok(filename)
    } else {
        Err("No path".into())
    }
}
