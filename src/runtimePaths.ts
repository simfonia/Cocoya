import * as path from 'path';
import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';

/**
 * 產品執行時路徑的單一真實來源（VSIX Host 端）。
 *
 * 【為何需要這個模組 —— 三個獨立理由】
 *
 * 1. **字串散落 = 改名必漏**
 *    改版前 `'temp_scripts'` 硬編碼於 11 個檔案共 14 處。任一處漏改，
 *    後果是「備份寫到 A 目錄、清理時讀 B 目錄」→ 未命名備份遺失或孤兒檔。
 *    這類 bug 極難重現（只發生在未錨定專案），且不會在一般流程中浮現。
 *
 * 2. **它是產品目錄，不是開發暫存 —— 名字極易誤解**
 *    `temp/` 是開發暫存（gitignored）；`temp_scripts/` 是 **VSIX 執行時目錄**
 *    （存放 untitled_backup.xml 與未錨定時的資料集降級路徑）。兩者用途完全不同
 *    但檔名相似，**改名會直接破壞 VSIX 的備份宣示機制**。
 *    本模組的存在讓「不可改名」這件事在程式碼中顯性化。
 *
 * 3. **不可隨意改名的後果需要被守門盯著**
 *    已由 `scripts/verify-runtime-paths.cjs` 掃描型守門確保：
 *    - 產品程式碼不得出現裸 `'temp_scripts'` 字面值
 *    - 目錄名常量與實際 `mkdir` 行為一致
 *
 * 【跨端一致性】Rust（Tauri）端不使用此目錄（已查證 `src-tauri/src` 零引用），
 *    故本模組僅適用 VSIX。若日後 Tauri 也需要，應另建對應 adapter，
 *    **不可**讓兩端共用同一常數（路徑基準語意不同：extensionPath vs app_data）。
 */

/**
 * VSIX 執行時暫存目錄名稱。
 *
 * ⚠️ **不可改名**：此為已發行版本的既有磁碟路徑，改名等同資料遺失
 * （使用者未錨定專案的備份宣示會失效）。若日後要重新命名，
 *    必須實作「讀舊目錄 → 搬移 → 寫新目錄」的遷移流程。
 *
 * 與 `temp/`（開發暫存）無關，勿混淆。
 */
export const RUNTIME_TEMP_DIR_NAME = 'temp_scripts';

/** 未命名（untitled）工作區的備份檔名。 */
export const UNTITLED_BACKUP_FILENAME = 'untitled_backup.xml';

/**
 * 取得 VSIX 執行時暫存目錄的絕對路徑。
 *
 * ⚠️ 回傳路徑**不保證存在** —— 是否建立由呼叫端按需求決定
 *    （部分流程只需讀取既有檔案，擅自 mkdir 會改變行為）。
 *
 * @param extensionPath 擴充套件安裝根目錄（`context.extensionPath`）
 */
export function runtimeTempDir(extensionPath: string): string {
    return path.join(extensionPath, RUNTIME_TEMP_DIR_NAME);
}

/**
 * 取得未命名備份檔的絕對路徑。
 *
 * @param extensionPath 擴充套件安裝根目錄（`context.extensionPath`）
 */
export function untitledBackupPath(extensionPath: string): string {
    return path.join(extensionPath, RUNTIME_TEMP_DIR_NAME, UNTITLED_BACKUP_FILENAME);
}

/**
 * 以 `vscode.Uri` 形式取得執行時暫存目錄。
 *
 * 用於 `workspaceFolders` / `showOpenDialog` 等需要 Uri 的 VSIX API。
 *
 * @param context 擴充套件內容
 */
export function runtimeTempUri(context: ExtensionContext): vscode.Uri {
    return vscode.Uri.file(runtimeTempDir(context.extensionPath));
}