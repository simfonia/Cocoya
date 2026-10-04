# -*- coding: utf-8 -*-
"""E2E：驗證 task type 命名統一後，四個訓練模板皆可端到端執行。

命名統一（2026-10-03）：
  classifier → image_classification、detector → object_detection、line_follower → line_following

風險集中在「模板目錄/檔名改名」與「sidecar 兩處映射」：任一處漏改即報「訓練模板不存在」。
"""
import csv
import io
import json
import os
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PY = sys.executable
TEMPLATES = os.path.join(REPO, "resources", "train_templates")


def check(cond, msg):
    """[T4-2] 原為累積 FAILS + 最後 sys.exit(1)；改為 pytest 斷言。
    優點：失敗時立刻指出是哪一行、哪個 msg，而非跑完才總結。"""
    assert cond, msg


def img(path, rgb):
    from PIL import Image
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new("RGB", (16, 16), rgb).save(path)


def cls_dm(root):
    """DM 落盤佈局：<label>/*.jpg + dataset.json（image_classification 走這條）"""
    for lab in ("a", "b"):
        for i in range(4):
            img(os.path.join(root, lab, "%s_%d.jpg" % (lab, i)), (40, 120, 200))
    spec = {"project": {"name": "clsfix", "type": "image"},
            "data_source": {"samples": [{"image_path": "%s/%s_%d.jpg" % (l, l, i),
                                          "label": l} for l in ("a", "b") for i in range(4)]},
            "schema": {"label_map": {"a": 0, "b": 1}}}
    json.dump(spec, io.open(os.path.join(root, "dataset.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    return root


def det_export(root):
    """匯出佈局：images/ + labels/*.txt（object_detection 走這條）"""
    os.makedirs(os.path.join(root, "images"), exist_ok=True)
    os.makedirs(os.path.join(root, "labels"), exist_ok=True)
    for i in range(8):
        img(os.path.join(root, "images", "im_%02d.jpg" % i), (200, 40, 40))
        io.open(os.path.join(root, "labels", "im_%02d.txt" % i), "w",
                encoding="utf-8").write("0 0.5 0.5 0.4 0.4\n")
    return root


def line_ds(root):
    os.makedirs(os.path.join(root, "images"), exist_ok=True)
    os.makedirs(os.path.join(root, "lines"), exist_ok=True)
    for i in range(8):
        img(os.path.join(root, "images", "l_%02d.jpg" % i), (30, 180, 60))
        io.open(os.path.join(root, "lines", "l_%02d.txt" % i), "w",
                encoding="utf-8").write("0.1 0.9 0.9 0.1\n")
    return root


def tbl(root):
    os.makedirs(root, exist_ok=True)
    cols = ["f0", "f1", "label"]
    with io.open(os.path.join(root, "data.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for i in range(10):
            w.writerow(["%0.2f" % (i * .1), "%0.2f" % (i * .2), "A" if i % 2 == 0 else "B"])
    json.dump({"project": {"name": "tbl", "type": "table"},
               "schema": {"columns": cols[:-1], "label_column": "label"},
               "data_source": {"base_dir": "dataset/tbl"}},
              io.open(os.path.join(root, "dataset.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    return root


def run(script, ds, name, base):
    out = os.path.join(base, "model_" + name)
    proc = subprocess.run(
        [PY, script, "--dataset_dir", ds, "--output_dir", out,
         "--epochs", "1", "--batch_size", "4", "--learning_rate", "0.001",
         "--project_name", name, "--validation_split", "0.2", "--model_output", "none"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
    produced = []
    for dp, _, fs in os.walk(out):
        produced += fs
    return proc, produced


def test_task_type_rename(tmp_path):
    # 1. 目錄與檔名
    for d, f in [("image_classification", "image_classification_train.py"),
                 ("object_detection", "object_detection_train.py"),
                 ("line_following", "line_following_train.py"),
                 ("table", "table_train.py"), ("feature", "feature_train.py")]:
        check(os.path.isfile(os.path.join(TEMPLATES, d, f)), "%s/%s 存在" % (d, f))
    for old in ("classifier", "detector", "line_follower"):
        check(not os.path.exists(os.path.join(TEMPLATES, old)), "舊目錄 %s/ 已不存在" % old)

    # 2. sidecar 兩處映射 + Docker 映像名未被波及
    # [T4 2026-10-03] 掃描範圍擴及全部 sidecar 模組。
    #   P2-3 已把遠端訓練抽出為 local_training.py / remote_ssh.py 等獨立模組，
    #   兩處映射已搬離 dataset_sidecar.py → 只讀舊檔會誤報 7 個斷言全失敗。
    sc = ""
    _dm = os.path.join(REPO, "resources", "dataset_manager")
    for _f in sorted(os.listdir(_dm)):
        if _f.endswith(".py"):
            sc += io.open(os.path.join(_dm, _f), encoding="utf-8").read() + "\n"
    for k in ("image_classification", "object_detection", "line_following"):
        check('"%s": "%s_train.py"' % (k, k) in sc, "sidecar task_scripts 含 %s" % k)
        check('"%s/%s_train.py"' % (k, k) in sc, "sidecar script_rel 含 %s" % k)
    check('"cocoya-train-classifier"' in sc, "Docker 映像名保留（未被改名波及）")

    # 3. 四型別端到端訓練
    tmp = tempfile.mkdtemp(prefix="cocoya_rename_all_")
    try:
        cases = [
            ("image_classification", "image_classification", cls_dm, "clsfix"),
            ("object_detection", "object_detection", det_export, "detfix"),
            ("line_following", "line_following", line_ds, "linefix"),
            ("table", "table", tbl, "tblfix"),
        ]
        for task, d, maker, name in cases:
            ds = maker(os.path.join(tmp, "ds", name))
            script = os.path.join(TEMPLATES, d, "%s_train.py" % d)
            proc, produced = run(script, ds, name, tmp)
            ok = proc.returncode == 0 and len(produced) > 0
            check(ok, "%s 訓練 exit=%s，產出 %d 檔"
                  % (task, proc.returncode, len(produced)))
            if not ok:
                print((proc.stderr or proc.stdout or "")[-400:])
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
