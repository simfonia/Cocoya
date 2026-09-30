@echo off
chcp 65001 >nul
rem 一鍵重建 dist/：單檔 HTML + A4 講義 PDF
rem 用法：雙擊本檔，或執行 docs\teaching\py_ai_train_run\build\build_all.cmd
rem        強制重建：build_all.cmd --force
rem 增量：來源（index.html + lib/reveal + 打包腳本）未變更時自動跳過，不重產 dist
setlocal
set "PY=C:\WPy64-31160\python-3.11.6.amd64\python.exe"
set "BUILD=%~dp0"
set "FORCE=%~1"

if not exist "%PY%" (
  echo [錯誤] 找不到 Python：%PY%
  echo        教學產物跳過（不影響主程式編譯）。
  exit /b 0
)

rem --- 增量判斷 ---
"%PY%" "%BUILD%incremental.py" %FORCE%
if errorlevel 10 (
  echo.
  echo [略過] 來源未變更，dist/ 產物已是最新。
  exit /b 0
)
if errorlevel 1 (
  echo [錯誤] 增量判斷失敗。
  exit /b 1
)

echo.
echo [1/2] 打包單檔 HTML ^(內嵌 CSS/JS^)...
"%PY%" "%BUILD%pack_single.py"
if errorlevel 1 goto :err

echo.
echo [2/2] 轉 A4 講義 PDF ^(需 Edge/Chrome^)...
"%PY%" "%BUILD%html2pdf.py"
if errorlevel 1 goto :err

echo.
echo ========================================
echo  完成！產物在 dist\ 資料夾：
echo    - AI訓練積木參數教學_單檔版.html  ^(Moodle 上傳這個，含互動測驗^)
echo    - AI訓練積木參數教學.pdf
echo ========================================
if not "%FORCE%"=="" exit /b 0
pause
exit /b 0

:err
echo.
echo [錯誤] 建置失敗，請看上方程式訊息。
if not "%FORCE%"=="" exit /b 1
pause
exit /b 1

