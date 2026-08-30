# Dataset Manager 手動測試統一執行清單（Manual Test Backlog）

> 建立日期：2026-08-29
> 決策：使用者指示「先趕進度，手動測試統一延後集中執行」→ Stage 2 Gate 簽核與後續 Gate 手動案例一併延後至本清單統一執行。自動化驗證（node --test / build / check）仍逐切片執行，不延後。
> 規則：執行時逐案回報 `案例ID / 平台 / PASS|FAIL|BLOCKED / 證據`；全數 PASS 前不刪除舊入口、不宣稱 parity 完成。

## 來源：Stage 1 遺留（C1 Gate 清單）

| ID | 案例 | 平台 | 狀態 |
|---|---|---|---|
| C1-1 | 資料集第二輪 UI：統計同步、label id、三處標籤管理器一致性、排序與顏色 | VSIX+Tauri | 待測 |
| C1-2 | VSIX 對應手動案例（canonical 匯入複製確認、重複匯入不覆寫、拒絕複製中止、自動落盤） | VSIX | 待測 |
| C1-3 | Ctrl+R 非 dirty 直接回首頁、回首頁重開專案 | VSIX+Tauri | 待測 |

## 來源：Stage 2（A2）

| ID | 案例 | 平台 | 狀態 |
|---|---|---|---|
| A2-1 | command parity 八流程：pick folder / 匯入 / load / save / delete / export / camera 四式 / 遠端診斷（詳細步驟見 log/work/2026-08-29.md） | VSIX+Tauri | 待測 |
| A2-2 | correlation：連續 capture 不串位、autosave 重疊順序、timeout 15s 後 UI 不卡死、關 modal 無幽靈 callback | VSIX+Tauri | 自動化部分 PASS（io/bridge.test.mjs 8/8）；實機待測 |
| A2-3 | 多視窗 sidecar 隔離（A 啟動 camera/export，B 無事件；關閉 A 後 B 正常） | Tauri | 待測 |
| A2-4 | 錯誤路徑：不存在 host 診斷清楚失敗、非法專案名攔截 | Tauri Dev | 待測 |
| A2-5/6/7 | 雲端上傳 | - | N/A（RemoteTrainingRefactor D2 已移除按鈕） |

## 來源：Stage 3（U3，隨切片補入）

| ID | 案例 | 平台 | 狀態 |
|---|---|---|---|
| U3-1 | Save/load round-trip：改 label + 加 bbox + 保留未標註 → 儲存 → 重開資料夾 → 全部恢復 | VSIX+Tauri | 待測 |
| U3-2 | Autosave：debounce 時間內連改 3 次只寫預期次數；切圖/離開/關閉 flush；modal 銷毀後 timer 回呼不報錯 | VSIX+Tauri | 待測 |
| U3-3 | 匯入一致性：CSV 欄位/label、影像巢狀資料夾統計、同 project name 換來源、取消名稱確認不清空資料 | VSIX+Tauri | 待測 |
| U3-4 | 刪除安全邊界：合法刪除、`..`/絕對路徑/不存在檔案被拒、重掃描+載入 progress 無殘留 | VSIX+Tauri | 待測 |

## 既有 BLOCKED（非延後，等環境）

- Tauri Release 安裝版 smoke（resource/permission/sidecar）
- SSH/SFTP 遠端驗證（主機連線不穩）
