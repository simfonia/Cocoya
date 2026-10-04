# -*- coding: utf-8 -*-
"""G1 修法驗證：feature 任是否真能從積木訓練鏈跑通。

在動 UI 前先驗證後端鏈路是否已就緒（避免改了 UI 卻發現後端壞）。
驗證 feature_train.py 能否吃「最小合法 data.csv」並完成 1 epoch。

前置事實（已實查）：feature_train.py 的 CLI 參數與 table/classifier 完全一致。
"""
import csv
import io
import os
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FEATURE = os.path.join(REPO, "resources", "train_templates", "feature", "feature_train.py")
PY = sys.executable


def build_dataset(root, n=12):
    """最小合法表格資料集：label 為分類型，欄位 = 4 維特徵 + label。"""
    os.makedirs(root, exist_ok=True)
    cols = ["f0", "f1", "f2", "f3", "label"]
    rows = []
    for i in range(n):
        lab = "A" if i % 2 == 0 else "B"
        rows.append([round(i * 0.1, 3), round(i * 0.2, 3),
                     round(i * 0.05, 3), round(i * 0.3, 3), lab])
    with io.open(os.path.join(root, "data.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)

    spec = {
        "project": {"name": "g1check", "type": "feature"},
        "schema": {
            "columns": cols[:-1],
            "label_column": "label",
            "feature_schema": "featureSchema",
        },
        "data_source": {"base_dir": "dataset/g1check"},
    }
    import json
    with io.open(os.path.join(root, "dataset.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
    return root


def test_feature_train(tmp_path):
    tmp = tempfile.mkdtemp(prefix="cocoya_g1check_")
    ds = build_dataset(os.path.join(tmp, "dataset", "g1check"))
    out = os.path.join(tmp, "model")
    print("dataset:", ds)
    print("files:", sorted(os.listdir(ds)))

    cmd = [PY, FEATURE,
           "--dataset_dir", ds,
           "--output_dir", out,
           "--epochs", "1",
           "--batch_size", "4",
           "--learning_rate", "0.001",
           "--project_name", "g1check",
           "--validation_split", "0.2",
           "--model_output", "none"]
    print("\n$ " + " ".join(cmd[:6]) + " ... --epochs 1 --model_output none\n")
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=900)

    out_s = proc.stdout or ""
    err_s = proc.stderr or ""
    print("--- stdout (tail) ---")
    print("\n".join(out_s.splitlines()[-25:]))
    if proc.returncode != 0:
        print("\n--- stderr (tail) ---")
        print("\n".join(err_s.splitlines()[-25:]))

    print("\nRESULT exit=%s" % proc.returncode)

    # 判準：exit 0 且有產出（報告/history），才算後端鏈路就緒
    produced = []
    for dirpath, _, files in os.walk(out):
        for fn in files:
            produced.append(os.path.relpath(os.path.join(dirpath, fn), out))
    print("produced:", produced[:10])

    ok = proc.returncode == 0 and len(produced) > 0
    print("\n%s" % ("PASS：feature 後端鏈路就緒，僅缺 UI 入口（G1 確認）"
                    if ok else "FAIL：後端鏈路本身有問題，需先修後端"))
    return 0 if ok else 1
