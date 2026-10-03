"""本地訓練（P2-3 自 dataset_sidecar.py 抽出）。

對應 `trainLocal` 指令：以子進程執行 `train_templates/<task_type>/<script>.py`，
即時把 stdout 轉發為 trainingLog 事件，並解析末行 `RESULT:` JSON 回傳結果。

**task_type → 腳本檔名映射在此為 SSOT**，須與
`ui/src/modules/ai_inference/ai_inference_generators.js` 的 train_model 分派一致
（三層命名統一鐵律：image_classification / object_detection / line_following / table / feature）。
"""

import json
import os
import subprocess
import sys
import threading

# task_type → 訓練腳本檔名（與 ai_inference_generators.js train_model 分派一致）
TASK_SCRIPTS = {
    "image_classification": "image_classification_train.py",
    "object_detection": "object_detection_train.py",
    "line_following": "line_following_train.py",
    "table": "table_train.py",
    "feature": "feature_train.py",
}

# sidecar 所在目錄的祖父（resources/dataset_manager → 專案根），train_templates 於其下
_TRAIN_TEMPLATES_REL = ("..", "..", "train_templates")


def resolve_train_script(task_type, base_dir=None):
    """回傳訓練腳本路徑；task_type 未知時回退 image_classification。

    回傳 (script_path, resolved_task_type, error_message)；找不到腳本時 error_message 非 None。
    """
    base = base_dir or os.path.dirname(os.path.abspath(__file__))
    resolved = str(task_type).lower()
    if resolved not in TASK_SCRIPTS:
        resolved = "image_classification"
    script_path = os.path.join(base, *_TRAIN_TEMPLATES_REL, resolved, TASK_SCRIPTS[resolved])
    if not os.path.exists(script_path):
        return script_path, resolved, f"訓練模板不存在: {script_path}"
    return script_path, resolved, None


def handle_train_local(msg, request_id, send_response, send_event, popen_kwargs=None):
    """處理 trainLocal 指令（背景執行緒內）。

    send_response / send_event 為 DatasetSidecar 的回呼，維持 stdout 單一 JSON 契約。
    """
    project_name = msg.get("projectName", "training_project")
    task_type = msg.get("taskType", "image_classification")
    dataset_dir = msg.get("datasetDir", "")
    output_dir = msg.get("outputDir", "")
    hyperparams = msg.get("hyperparams", {})

    print(f"[Sidecar Log] Starting local training: {project_name} ({task_type})", file=sys.stderr)

    script_path, resolved_type, err = resolve_train_script(task_type)
    if err:
        send_response(request_id, {"success": False, "error": err})
        return

    cmd = [
        sys.executable,
        script_path,
        f"--project_name={project_name}",
        f"--dataset_dir={dataset_dir}",
        f"--output_dir={output_dir}",
        f"--backbone=mobilenetv2",
        f"--epochs={hyperparams.get('epochs', 30)}",
        f"--batch_size={hyperparams.get('batchSize', 32)}",
        f"--learning_rate={hyperparams.get('learningRate', 0.001)}",
    ]
    print(f"[Sidecar Log] Executing: {' '.join(cmd)}", file=sys.stderr)

    try:
        # 隱藏 console 視窗（Tauri 為 GUI subsystem）+ UTF-8 強制解碼（AGENTS.md 四件套鐵律）
        popen_kwargs = popen_kwargs or {}
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            encoding="utf-8",
            errors="replace",
            **popen_kwargs
        )

        training_result = {"success": False, "modelDir": output_dir, "projectName": project_name}

        # 即時傳送輸出到前端
        for line in process.stdout:
            line = line.strip()
            send_event("trainingLog", {"message": line})

            # 解析 RESULT JSON
            if line.startswith("RESULT:"):
                try:
                    training_result = json.loads(line.split("RESULT:", 1)[1].strip())
                except Exception as e:
                    print(f"[Sidecar Log] Failed to parse RESULT JSON: {e}", file=sys.stderr)

        process.wait()

        if process.returncode == 0 and training_result.get("success"):
            send_response(request_id, {
                "success": True,
                "modelDir": training_result.get("modelDir", output_dir),
                "projectName": training_result.get("projectName", project_name),
                "accuracy": training_result.get("accuracy"),
                "epochs": training_result.get("epochs"),
                "curvePath": training_result.get("curvePath"),
                "historyPath": training_result.get("historyPath"),
                "reportPath": training_result.get("reportPath"),
            })
        else:
            stderr_output = process.stderr.read()
            send_response(request_id, {
                "success": False,
                "error": f"訓練失敗 (exit code {process.returncode}): {stderr_output}",
            })
    except Exception as e:
        send_response(request_id, {"success": False, "error": f"訓練過程發生錯誤: {str(e)}"})


def start_train_local_async(msg, request_id, send_response, send_event, popen_kwargs=None):
    """於背景執行緒啟動本地訓練（對應原 threading.Thread(target=do_train)）。"""
    thread = threading.Thread(
        target=handle_train_local,
        args=(msg, request_id, send_response, send_event, popen_kwargs),
        daemon=True)
    thread.start()
    return thread