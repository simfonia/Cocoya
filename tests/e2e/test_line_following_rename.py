# -*- coding: utf-8 -*-
"""E2E：驗證命名統一（line_follower → line_following）後訓練鏈路仍完整。

改造重點：訓練模板目錄與檔名都改了，若任一處漏改就會在執行期報
「訓練模板不存在」。本腳本走「積木產生器產出的 train_model 邏輯」，
用與 sidecar task_scripts 相同的映射規則驗證路徑可解析。
"""
import io
import json
import os
import subprocess
import sys
import tempfile
import pytest  # [2026-10-04] slow marker（見 scripts/pytest-layers.cjs）

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PY = sys.executable
TEMPLATES = os.path.join(REPO, "resources", "train_templates")



def check(cond, msg):
    """[T4-2] 原為累積 FAILS + 最後 sys.exit(1)；改為 pytest 斷言。
    優點：失敗時立刻指出是哪一行、哪個 msg，而非跑完才總結。"""
    assert cond, msg


def make_line_dataset(root, n=10):
    """最小影像系資料集：images/ + lines/*.txt（匯出佈局 A）。"""
    from PIL import Image
    imgs = os.path.join(root, "images")
    lines = os.path.join(root, "lines")
    os.makedirs(imgs, exist_ok=True)
    os.makedirs(lines, exist_ok=True)
    for i in range(n):
        fn = "line_%02d.jpg" % i
        Image.new("RGB", (16, 16), (30, 180, 60)).save(os.path.join(imgs, fn))
        with io.open(os.path.join(lines, "line_%02d.txt" % i), "w", encoding="utf-8") as f:
            f.write("0.1 0.9 0.9 0.1\n")
    return root


@pytest.mark.slow
def test_line_following_rename(tmp_path):
    # ---- 1. 訓練模板目錄/檔名已改名 ----
    check(os.path.isdir(os.path.join(TEMPLATES, "line_following")),
          "train_templates/line_following/ 目錄存在（已改名）")
    check(not os.path.exists(os.path.join(TEMPLATES, "line_follower")),
          "舊目錄 train_templates/line_follower/ 已不存在")
    script = os.path.join(TEMPLATES, "line_following", "line_following_train.py")
    check(os.path.isfile(script), "line_following_train.py 檔案存在（已改名）")
    check(not os.path.exists(os.path.join(TEMPLATES, "line_following",
                                         "line_follower_train.py")),
          "舊檔名 line_follower_train.py 已不存在")

    # ---- 2. sidecar 兩處映射一致且指向存在的檔 ----
    # [T4 2026-10-03] 掃描範圍擴及全部 sidecar 模組。
    #   原先只讀 dataset_sidecar.py，但 P2-3 已把遠端訓練抽出為獨立模組，
    #   兩處映射分別搬到 local_training.py（task_scripts）與 remote_ssh.py（script_rel）
    #   → 只讀舊檔會誤報「映射未改名」。**實際上映射早已正確改名。**
    sidecar = ""
    for _f in sorted(os.listdir(os.path.join(REPO, "resources", "dataset_manager"))):
        if _f.endswith(".py"):
            sidecar += io.open(
                os.path.join(REPO, "resources", "dataset_manager", _f),
                encoding="utf-8").read() + "\n"
    check('"line_following": "line_following_train.py"' in sidecar,
          "sidecar task_scripts 映射已改名")
    check('"line_following/line_following_train.py"' in sidecar,
          "sidecar script_rel 映射已改名")
    check("line_follower" not in sidecar, "sidecar 已無 line_follower 殘留")

    # ---- 3. 積木產生器分派已改名 ----
    gen = io.open(os.path.join(REPO, "ui", "src", "modules", "ai_inference",
                               "ai_inference_generators.js"), encoding="utf-8").read()
    check('script_name = "line_following_train.py"' in gen,
          "產生器 train_model 分派已改名")
    check('task_type == "line_following"' in gen,
          "產生器 predict 分派已改名")

    # ---- 4. 端到端：真的跑一次訓練 ----
    tmp = tempfile.mkdtemp(prefix="cocoya_rename_line_")
    try:
        ds = make_line_dataset(os.path.join(tmp, "dataset", "linefix"))
        out = os.path.join(tmp, "model")
        cmd = [PY, script,
               "--dataset_dir", ds, "--output_dir", out,
               "--epochs", "1", "--batch_size", "4",
               "--learning_rate", "0.001", "--project_name", "linefix",
               "--validation_split", "0.2", "--model_output", "none"]
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=900)
        tail = [l for l in (proc.stdout or "").splitlines() if l.strip()][-4:]
        print("  訓練輸出尾端: " + " | ".join(t.strip() for t in tail))
        check(proc.returncode == 0, "line_following 訓練 exit=0（端到端可用）")
        if proc.returncode != 0:
            print((proc.stderr or "")[-800:])

        produced = []
        for dp, _, fs in os.walk(out):
            produced += [os.path.join(dp, f) for f in fs]
        check(len(produced) > 0, "訓練產出 %d 個檔案" % len(produced))
        # taskType 欄位應為新名
        hist = [p for p in produced if p.endswith("_training_history.json")]
        if hist:
            h = json.load(io.open(hist[0], encoding="utf-8"))
            check(h.get("taskType") == "line_following",
                  "history taskType = %r（已統一為新名）" % h.get("taskType"))
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
