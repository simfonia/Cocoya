# 教學簡報打包工具（Moodle 上架用）

把 `index.html`（Reveal.js 簡報）打包成可獨立流通的檔案。

## 產出

執行後於 `../dist/` 產生兩個可上傳 Moodle 的檔案：

| 檔案 | 說明 |
|---|---|
| `AI訓練積木參數教學_單檔版.html` | **單一 HTML**，Reveal.js／主題 CSS 全部內嵌，離線可開、可互動（含小測驗點選） |
| `AI訓練積木參數教學.pdf` | **A4 直向講義 PDF**（42 頁），Moodle 可直接內嵌預覽 |

## 用法

### 最簡單：雙擊 `build_all.cmd`

或從專案根執行：

```powershell
docs\teaching\py_ai_train_run\build\build_all.cmd
```

### 透過 npm（可掛進編譯流程）

```powershell
npm run build:slides         # 增量：來源未變更則跳過
npm run build:slides:force   # 強制重建
npm run compile:all          # tsc 編譯 + 教學打包（增量）
```

### 增量判斷

`incremental.py` 以 **SHA256**（非時間戳）比對下列來源：

- `index.html`
- `lib/reveal/reveal.css`、`reveal.js`、`theme/beige.css`
- `build/pack_single.py`、`build/html2pdf.py`（腳本本身改了也要重建）

雜湊相同 → 印 `SKIP` 並跳過，**不重產 dist**（含不重開 Edge，約 0.3 秒）。
結果記於 `dist/.buildstamp.json`。

> 刻意用雜湊而非 mtime：`git checkout`、檔案複製、版本控制切換都會動到 mtime，
> 但內容不變時不該重建；反之內容一改必定偵測得到。

### 分步執行

```powershell
C:\WPy64-31160\python-3.11.6.amd64\python.exe docs\teaching\py_ai_train_run\build\pack_single.py
C:\WPy64-31160\python-3.11.6.amd64\python.exe docs\teaching\py_ai_train_run\build\html2pdf.py
```

- `pack_single.py`：內嵌 CSS/JS 產生單檔 HTML（不需瀏覽器）。
- `html2pdf.py`：需 **Edge 或 Chrome**，以 headless 列印轉 PDF。
  走 **`@media print` 講義模式**（內容完整、不裁切）。
  環境變數可覆寫：`SRC_HTML`、`OUT_PDF`、`QUERY`。
  ⚠️ **勿設 `QUERY=?print-pdf`**：headless 無法取得 Reveal 投影片排版，會產出空白 PDF。

> 找不到 `C:\WPy64-31160\python-3.11.6.amd64\python.exe` 時腳本會**跳過並回傳 0**，
> 不會阻斷主程式的 `tsc` 編譯。

> 每次改動 `index.html` 後，請**重新執行兩個腳本**以同步產物。

## 上傳 Moodle 的建議

1. **講義 PDF**：課程 → 檔案上傳 → 內嵌至課程頁面，學生可直接在 Moodle 內翻閱。
2. **單檔 HTML**：上傳後 Moodle 不會直接渲染 HTML，學生需下載再開。
   若要學生在 Moodle 內直接看，改用 PDF。
3. 檔名含中文，若 Moodle 顯示亂碼可改用純英文檔名重新上傳。

## 若需要「每頁一張投影片」的橫向 PDF

headless 列印無法取得 Reveal 的投影片排版（需執行期 JS 計算），請在本機瀏覽器手動列印：

1. 用 Chrome／Edge 開啟 `dist/AI訓練積木參數教學_單檔版.html?print-pdf`
2. `Ctrl + P` → 目的地「另存為 PDF」
3. 紙張「橫向」、邊界「無」、勾選「背景圖形」
4. 另存為 `AI訓練積木參數教學_投影片式.pdf`
