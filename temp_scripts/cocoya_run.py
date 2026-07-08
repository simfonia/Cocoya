def train_model(dataset_dir, model_dir, task_type, backend, epochs, batch_size, learning_rate):
    import subprocess
    import sys
    import os
    import json

    # 確保模型輸出目錄存在
    os.makedirs(model_dir, exist_ok=True)

    # 根據任務類型選擇訓練腳本
    if task_type == "classifier":
        script_name = "classifier_train.py"
    elif task_type == "detector":
        script_name = "detector_train.py"
    elif task_type == "line_follower":
        script_name = "line_follower_train.py"
    else:
        print(f"錯誤: 不支援的任務類型: {task_type}")
        return False

    # 呼叫訓練腳本
    # 使用絕對路徑，避免工作目錄問題
    script_path = os.path.abspath(os.path.join(os.path.dirname(sys.argv[0]), "..", "resources", "train_templates", task_type, script_name))

    if not os.path.exists(script_path):
        print(f"錯誤: 找不到訓練腳本 {script_path}")
        return False

    cmd = [
        sys.executable, script_path,
        "--dataset_dir", dataset_dir,
        "--output_dir", model_dir,
        "--epochs", str(epochs),
        "--batch_size", str(batch_size),
        "--learning_rate", str(learning_rate),
        "--project_name", os.path.basename(dataset_dir)
    ]

    print("執行訓練命令: " + " ".join(cmd))
    print("\n開始訓練，請稍候...\n")

    # 使用 Popen 即時顯示輸出
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, universal_newlines=True)

    # 即時讀取並顯示輸出
    for line in process.stdout:
        print(line, end='')

    process.wait()

    if process.returncode != 0:
        print("\n訓練失敗")
        return False

    # 解析結果
    print("\n訓練完成!")
    return True


if __name__ == "__main__":  # S_ID:BW|{#2:o27$w}?+)8k5f
    # 開始訓練  # S_ID:Y8]DzD?F[#5O_V_}^Ye0
    train_model(
        dataset_dir='dataset/classifier_dataset',
        model_dir='model/classifier_dataset',
        task_type='classifier',
        backend='remote' if False else 'local',
        epochs=5,
        batch_size=32,
        learning_rate=0.001
    )  # E_ID:Y8]DzD?F[#5O_V_}^Ye0  # E_ID:BW|{#2:o27$w}?+)8k5f