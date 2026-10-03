"""遠端 Docker 訓練執行與產物下載（P2-3 自 remote_ssh.py 抽出）。

涵蓋 trainRemote 的後半段：
1. 映像存在性檢查（缺映像時由 cocoya-train-classifier 自動 tag 補別名）
2. `docker run --gpus all` 啟動訓練容器，串流解析 Keras 進度（剝 ANSI 色碼、\r 切行）
3. SFTP 下載當前專案產物（.keras／labels.txt／報告／曲線／歷史）
4. **本地** Keras → TFLite 轉換（D10/D15 鐵律：TFLite 只在本地轉）

**純搬移，未改邏輯。** 抽出理由：這段是整個 sidecar 最長的單一流程，
混在 `handle_train_remote` 內使該函式達 500 行，無法單獨閱讀與測試。

早期 return 語意：原碼在映像檢查失敗時直接 `send_response(...)` + `return` 結束
整個訓練流程；函式化後改為 `return _return({...})`，由呼叫端 send_response 後 return。
"""

import os

from remote_ssh import _ANSI_RE, _docker_command, resolve_remote_script


def run_docker_training(ssh, run, project_name, output_dir, hyperparams, docker_image,
                           remote_dataset_dir, remote_output_dir, remote_templates_real,
                           local_dataset_dir, log, tflite_converter,
                           set_state, get_state):
    """執行遠端 Docker 訓練並回傳結果 dict（呼叫端負責 send_response）。

    映像缺失／別名建立失敗時回傳 {"success": False, "error": ...}（不再拋例外）。
    """
    # --- 遠端 Docker 訓練 (cocoya classifier_train.py v2) ---
    task_type = str(hyperparams.get("taskType", "image_classification")).lower()
    # P2-3：原為 24 行 if/elif 鏈，改用 remote_ssh.resolve_remote_script（映射 SSOT 單一）
    script_rel = resolve_remote_script(task_type)

    # --- 映像存在性檢查（2026-09-23）---
    # 各任務映像只是「相同 TF 執行環境」的別名（腳本走 bind mount /workspace）；
    # 遠端通常只建過 cocoya-train-classifier → 缺映像時自動 tag 補齊，
    # 避免 docker pull denied（exit 125，映像不存在也不該 pull 公有 repo）。
    c_img, _, _ = run('docker image inspect "' + docker_image + '"')
    if c_img != 0:
        c_base, _, _ = run('docker image inspect "cocoya-train-classifier"')
        if c_base == 0:
            c_tag, o_tag, e_tag = run(
                'docker tag "cocoya-train-classifier" "' + docker_image + '"')
            if c_tag != 0:
                set_state(None)  # 清狀態（早於 except，避免 stopTraining 誤判訓練中）
                return {
                    "success": False,
                    "error": "遠端建立映像別名失敗: " + (e_tag or o_tag or str(c_tag)),
                }
            log("[Remote] 遠端無映像 " + docker_image +
                   "，已由 cocoya-train-classifier 建立別名（共用 TF 執行環境）")
        else:
            set_state(None)  # 同上：清狀態再回
            return {
                "success": False,
                "error": ("遠端找不到 Docker 映像 " + docker_image +
                          " 與 cocoya-train-classifier。請先於遠端主機執行: "
                          "docker build -t cocoya-train-classifier -f Dockerfile.train ."
                          "（見 docs/docker_training_deployment_guide.html）"),
            }
    epochs = hyperparams.get("epochs", 30)
    batch_size = hyperparams.get("batchSize", 32)
    lr = hyperparams.get("learningRate", 0.001)
    user_model_output = str(hyperparams.get("modelOutput", "none"))
    # D10/D15 鐵律：TFLite 只在本地轉。遠端只依使用者選擇產 keras。
    # 選 none → 遠端只產報告/數據 (--model_output none)；其餘 → 遠端只產 keras (--model_output keras)
    remote_model_output = "keras" if user_model_output != "none" else "none"
    # 訓練前清空遠端 output 目錄：同專案前次訓練的殘留會污染下載清單與掃描
    run('eval rm -rf "' + remote_output_dir + '" && mkdir -p "' + remote_output_dir + '"')
    # Keras 預訓練權重快取：掛載遠端固定目錄到容器 /root/.keras/models，
    # 首次下載的 imagenet 權重（mobilenet 等）之後永久重用，避免每個容器都重抓
    remote_keras_cache = '~/cocoya_ai/keras_cache/models'
    run('eval mkdir -p "' + remote_keras_cache + '"')
    log("[Remote] 啟動 Docker 訓練容器: " + docker_image + " (task=" + task_type + ", model_output=" + remote_model_output + ", bind=/workspace)")
    docker_cmd = (
        'docker run --gpus all --rm '
        '--entrypoint python3 '
        '--name ' + str(get_state().get("container")) + ' '
        '-v "$(eval realpath ' + remote_dataset_dir + ')\":/dataset '
        '-v "$(eval realpath ' + remote_keras_cache + ')\":/root/.keras/models '
        '-v "$(eval realpath ' + remote_output_dir + ')\":/output '
        '-v "' + remote_templates_real + '":/workspace '
        + docker_image + ' /workspace/' + script_rel +
        ' --dataset_dir /dataset' +
        ' --output_dir /output' +
        ' --project_name ' + str(project_name) +
        ' --epochs ' + str(epochs) +
        ' --batch_size ' + str(batch_size) +
        ' --learning_rate ' + str(lr) +
        ' --validation_split ' + str(hyperparams.get("validationSplit", 0.2)) +
        ' --dropout ' + str(hyperparams.get("dropout", 0.2)) +
        ' --augmentation ' + str(hyperparams.get("augmentation", "true")).lower() +
        ' --backbone ' + str(hyperparams.get("backbone", "mobilenetv2")) +
        ' --optimizer ' + str(hyperparams.get("optimizer", "adam")) +
        ' --dnn_layers ' + str(hyperparams.get("dnnLayers", "128,64")) +
        ' --fine_tune ' + str(hyperparams.get("fineTune", "false")).lower() +
        ' --model_output ' + str(remote_model_output)
    )
    stdin, stdout, stderr = ssh.exec_command(docker_cmd)
    # 對齊本地訓練輸出：decode UTF-8、剝除 ANSI 色碼、把 \r 更新切成行；
    # Keras 進度條每 epoch 只留最後一行摘要（含 val_accuracy 的完整行）
    import re as _re
    _ansi = _re.compile(r"\x1b\[[0-9;]*m")
    for raw in stdout:
        text = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw
        text = _ansi.sub("", text)
        # 對齊本地：每個 step 各自一行（Keras \r 原地更新 → 切成一行的進度更新）
        for part in text.replace("\r", "\n").split("\n"):
            part = part.strip()
            if not part:
                continue
            log(part)
    exit_status = stdout.channel.recv_exit_status()
    err_output = stderr.read().decode("utf-8", "replace").strip()
    if err_output:
        log("[stderr] " + err_output)
    if exit_status != 0:
        raise RuntimeError("遠端訓練失敗 (exit code: " + str(exit_status) + ")")

    # --- 下載模型 (.keras + labels.txt)；TFLite 一律本地轉（鐵律 D9） ---
    code_rp, out_rp, _ = run('eval realpath "' + remote_output_dir + '"')
    remote_out_real = out_rp.strip().splitlines()[-1] if out_rp.strip() else remote_output_dir
    os.makedirs(output_dir, exist_ok=True)
    sftp = ssh.open_sftp()
    downloaded = []
    for attr in sftp.listdir_attr(remote_out_real):
        fn = attr.filename
        # 只下載當前專案的產物 + labels.txt；跳過殘留的舊專案檔
        # （遠端 output 目錄共用且不清空，舊 keras 會被誤下載）
        if not fn or fn.startswith("."):
            continue
        if user_model_output == "none" and fn.endswith(".keras"):
            continue
        if not (fn.startswith(project_name) or fn == "labels.txt"):
            continue
        local_path = os.path.join(output_dir, fn)
        sftp.get(remote_out_real + "/" + fn, local_path)
        downloaded.append(fn)
    sftp.close()
    log("[Remote] 已下載: " + ", ".join(downloaded))
    if user_model_output != "none":
        log("[Remote] 訓練完成！.keras 已下載，TFLite 將於本地依 model_output=" + user_model_output + " 轉換")
    set_state(None)
    # 掃描本地產物路徑（對齊本地 classifier_train 命名），供前端開啟報告/模型
    def _pick(pred):
        for fn in os.listdir(output_dir):
            if pred(fn):
                return os.path.join(output_dir, fn)
        return None
    report_path = _pick(lambda f: f.endswith("_training_report.html"))
    # 選 none 時不掃 keras：避免本地殘留的舊 keras 被誤報為本次產物
    keras_path = _pick(lambda f: f.endswith(".keras")) if user_model_output != "none" else None
    curve_path = _pick(lambda f: f.endswith("_training_curve.png"))
    history_path = _pick(lambda f: f.endswith("_training_history.json"))

    # --- 本地 TFLite 轉換（D10/D15 鐵律：僅本地做；選項1：掃本地 dataset 建 representative） ---
    # P2-3：原為 65 行巢狀程式碼，已抽出至 remote_tflite.convert_keras_to_tflite()
    tflite_paths = {}
    if user_model_output != "none" and keras_path:
        log("[Remote] 於本地依 model_output=" + user_model_output + " 轉換 TFLite...")
        tflite_paths = tflite_converter(
            keras_path=keras_path,
            dataset_dir=local_dataset_dir,
            output_dir=output_dir,
            project_name=project_name,
            model_output=user_model_output,
            log=log,
        )

    return {
        "success": True,
        "modelDir": output_dir,
        "projectName": project_name,
        "downloaded": downloaded,
        "modelOutput": user_model_output,
        "reportPath": report_path or "",
        "kerasPath": keras_path or "",
        "curvePath": curve_path or "",
        "historyPath": history_path or "",
        "tflitePaths": tflite_paths,
    }
