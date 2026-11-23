# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯統一存放於 ui/src，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端一律透過 CocoyaBridge 與後端通訊，禁止在 UI 層直接使用環境專屬 API。
- **任務前快取現況**：先讀 log/COCOYA_STATE.md (現況快覽) 再讀本檔對應章節；技術深層知識見 log/KNOWLEDGE_BASE.md；每日細節見 log/work/。

> **維護規範 (2026-10-05 收斂)**
> - **已完成任務只留精簡一行** (- [x] <一句話摘要> ✅ (細節見 log/work/<日期>.md))，詳細敘述與踩坑一律寫入 log/work/；本檔不重複承載。
> - **實機測試 / 硬體驗證項目不再列於本檔** (含「待雙平台實機」「待實測」等)；需查時請看各任務日誌或計畫文件 §15.3。
> - **未完成的技術債保留原文** (- [ ])，不得刪除。

---
## [進行中 / 待辦]

### 主題 / CSS 硬編碼債 (P1-3 殘項，來自 log/todo.md)

- [ ] .gitattributes：後續若新增 .sh 腳本需另加 eol=lf 例外 (目前僅 src-tauri/Cargo.toml 有 eol=lf 例外)
- [ ] 主題系統三套並存 (CSS :root、body.cocoya-dark-mode、三主題檔 cssVars)，待主題系統重構方向確定後再統一收斂 (使用者已拍板暫緩；實際待處理 87 處，dark 區塊 44)
- [ ] 主題系統重構方向決策：三套並存如何收斂？建議先產出「只讀盤點報告」(誰是實際生效、哪些衝突、可行方向)，再動手
- [ ] P1-3 未涵蓋範圍：僅刪 token 定義，未處理正文硬編碼 —— 仍有 268 個 body.cocoya-dark-mode 規則塊 (含 88 處硬編碼 hex) 存在且生效
- [ ] light 段 43 處硬編碼未動 (新主題摸不到問題；candy 淺色主題僅受約束 light 段 43 處)
- [ ] 待實測：VSIX + VS Code 深色 + 選 candy，確認 body.vscode-dark / body.vscode-high-contrast 字面值是否蓋掉 candy 淺色 token (代碼已全部加上 :not(.cocoya-light-mode)，守門 6 已落地，缺實機驗證)
- [ ] P1-4 style.css 242 hex：可比照 P1-3 分類法 (設計常數 / 主題值 / 純冗餘) 處理 (FOUC Guard 已保留 body.vscode-dark 8 個調色盤變數)

### 物件偵測升級 (Object Detection Multi-Scale)

- [x] 待決策：採用方向 A (PC-only) / B (COCO lite0) / C (自訓多尺度)；目前決策採用A/B併行。
- [ ] 若堅持 MCU 端跑模型：先做 MCU 可行性探針 (FPS / 記憶體)
- [ ] Backlog (YOLO 進階擴充，方案 B)：後續評估以獨立進階多物件訓練積木引進 YOLOv8n，**不污染基礎積木**

### UI / 積木模組殘項

- [x] ai_coco COCO 偵測積木模組：代碼已驗收 (生成器 8/8、契約對帳、變異 3/3 變紅)，**VSIX + Tauri 實機待測** —— 確認 toolbox 分類 / 拖曳 / 產碼對等

### 技術債 (來自 log/COCOYA_STATE.md §6)

- [ ] Tauri dev sidecar 路徑債：get_sidecar_dir 以 Resource 目錄 (target\debug\resources) 優先於專案根原始檔；改 sidecar 後須手動同步 dev 副本 + 重啟 app
- [ ] vidPid 表三處手動同步債：board_defs.js (前端) / mcu.rs detect_board_id / serialOps.ts boardIdMap；未來改執行期讀取或 codegen
- [ ] Python deploy 端對齊債：resources/deploy/base.py 尚以自家 vidPid 偵測 (與前端兩套 drift)，未統一讀 board_defs
- [ ] --dsm-* dark/token 非單一事實來源債：vscode-dark CSS 覆寫與 cocoya_dark 主題 cssVars 各持一份 deep 值 (與主題 CSS 殘項重疊)

### 大筆未完成工作 (來自 log/COCOYA_STATE.md §7)

- [ ] 大量實機驗證 (VSIX + Tauri 雙平台，見各 [ ] 項與 log/work/ Next Steps)
- [ ] Dataset Manager 手動測試 backlog (log/plan/DatasetManagerManualTestBacklog.md) + Stage 6 Gate 簽核 + Stage 7 總驗證
- [ ] 遠端訓練 SSH 整合 (Tauri 版藍圖 / datasetUploadArchive / 容器化訓練腳本)

### 架構規劃殘項 (來自 AGENTS.md 與 log/plan/)

- [ ] B 案 dataset_rename_dataset_dir：舊目錄不存在 -> no-op 不建立；存在 -> 整目錄搬家 + 對帳 img.diskPath / base_dir；需產品拍板「另存 / 合併」語意後才可動工 (見 log/plan/DatasetManagerTypeLockedWorkflow.md §12)
