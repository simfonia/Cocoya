"""本地 Keras → TFLite 轉換（P2-3 自 dataset_sidecar.py 抽出）。

原為 `trainRemote` 分支中的一段 65 行巢狀程式碼，夾在 400 行的遠端訓練流程中間，
既難以閱讀也難以單獨測試。此模組把它收斂為單一函式，行為與原實作**完全一致**
（純搬移，未改任何邏輯）。

設計要點：
- 以「乾淨環境」子進程執行轉換腳本：sidecar 承載自 Tauri 的環境雜訊會讓
  TensorFlow import 卡死（進程內 import 亦會因 Windows DLL loader lock 於工作
  執行緒卡死），故只繼承 python 必要的系統變數。
- 轉換失敗不中斷整條訓練（回報失敗原因後續流程照常收尾），故函式**不拋例外**。
"""

import importlib
import os
import subprocess
import sys
import tempfile
import threading
import time as _time

# 只繼承 python 必要的系統變數（承載自 Tauri 的環境雜訊會讓 TF import 卡死）
_CLEAN_ENV_KEYS = (
    "SystemRoot", "TEMP", "TMP", "PATH", "PATHEXT", "USERPROFILE",
    "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMDATA",
    "NUMBER_OF_PROCESSORS", "COMPUTERNAME", "USERNAME",
    "HOMEDRIVE", "HOMEPATH", "WINDIR", "SYSTEMDRIVE",
)

# 子進程靜默無輸出多久後警告並傾印環境（疑似環境攔截）
WATCHDOG_SECONDS = 60


def convert_keras_to_tflite(keras_path, dataset_dir, output_dir, project_name,
                            model_output, log):
    """把 Keras 模型轉為 TFLite，回傳 {filename: absolute_path}。

    `log` 為日誌回呼（對應原 rt_log）。失敗時回傳空 dict 並以 log 回報原因，
    **不拋例外** —— 遠端訓練流程不應因本地轉換失敗而中止。
    """
    tflite_paths = {}
    try:
        convert_script = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "_local_convert_tflite.py")
        if not os.path.isfile(convert_script):
            raise RuntimeError("轉換腳本不存在: " + convert_script)
        log("[LocalTFLite] 本機 python: " + sys.executable)
        if importlib.util.find_spec("tensorflow") is None:
            raise RuntimeError("本機 python 未安裝 tensorflow，無法轉換 TFLite。請 pip install tensorflow (python=" + sys.executable + ")")

        conv_env = {k: os.environ[k] for k in _CLEAN_ENV_KEYS if k in os.environ}
        conv_env["PYTHONUNBUFFERED"] = "1"
        conv_env["PYTHONIOENCODING"] = "utf-8"
        conv_env["TF_DETERMINISTIC_OPS"] = "1"
        conv_env["TF_CUDNN_DETERMINISTIC"] = "1"

        conv_cmd = [
            sys.executable, convert_script,
            "--keras_path", keras_path,
            "--dataset_dir", dataset_dir,
            "--output_dir", output_dir,
            "--project_name", project_name,
            "--model_output", model_output,
        ]
        CREATE_NO_WINDOW = 0x08000000
        p_conv = subprocess.Popen(
            conv_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            universal_newlines=True, encoding="utf-8", errors="replace",
            env=conv_env, creationflags=CREATE_NO_WINDOW)
        log("[LocalTFLite] 轉換進程已啟動 (pid=" + str(p_conv.pid) +
            ", 乾淨環境)，import tensorflow 約數十秒，int8 量化掃樣本需數分鐘...")

        got_output = [False]

        def _watchdog():
            _time.sleep(WATCHDOG_SECONDS)
            if not got_output[0]:
                try:
                    dump = os.path.join(tempfile.gettempdir(), "cocoya_sidecar_env_dump.txt")
                    with open(dump, "w", encoding="utf-8") as f:
                        for k2 in sorted(os.environ):
                            f.write(k2 + "=" + str(os.environ[k2])[:300] + "\n")
                    log("[LocalTFLite] 警告: 子進程 " + str(WATCHDOG_SECONDS) +
                        " 秒無任何輸出（疑遭環境攔截），sidecar 環境變數已傾印: " + dump)
                except Exception:
                    pass

        threading.Thread(target=_watchdog, daemon=True).start()
        for cline in p_conv.stdout:
            got_output[0] = True
            cline = cline.strip()
            if cline:
                log("[LocalTFLite] " + cline)
        p_conv.wait()
        if p_conv.returncode != 0:
            raise RuntimeError("本地 TFLite 轉換失敗 (exit=" + str(p_conv.returncode) + ")")

        # 重新掃描 tflite 產出
        if os.path.isdir(output_dir):
            for fn2 in os.listdir(output_dir):
                if fn2.endswith(".tflite"):
                    tflite_paths[fn2] = os.path.join(output_dir, fn2)
        log("[Remote] 本地 TFLite 轉換完成: " + ", ".join(tflite_paths.keys())
            if tflite_paths else "[Remote] 本地轉換無 tflite 產出")
    except Exception as ce:
        log("[Remote] 本地 TFLite 轉換失敗: " + str(ce))
    return tflite_paths