# -*- coding: utf-8 -*-
"""E2E：走 sidecar 真實 exportDataset 路徑，驗證 OD 對齊（Issue 2）。
1) detector：staging 放 DM 佈局 <label>/*.jpg + dataset.json → zip 應只含
   images/ + labels/ + labels.txt + dataset.json + export_manifest.json，
   不含 redBall/ blueBall/；labels 與 images 同名配對；labels.txt 兩類。
2) classifier(image)：<label>/ 佈局照常保留（不做去重）。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def _write(path, fmt="JPEG", size=(16, 16)):
    """[T4-2] 模組內的影像寫入器（供 check_detector 呼叫，不依賴 fixture）。

    check_detector 的簽名沿用原腳本（只收 tmp），故在此定義區域寫入器；
    測試本體仍優先使用 pytest 的 write_image fixture。
    """
    import numpy as np
    from PIL import Image

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    arr = np.random.randint(0, 255, (size[0], size[1], 3), dtype=np.uint8)
    Image.fromarray(arr).save(str(path), fmt)


PY = sys.executable
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIDECAR_DIR = os.path.join(REPO, "resources", "dataset_manager")

# [T4-2 2026-10-03] 移除全部外部資料集依賴
#   原先硬編碼使用者桌面的資料集與 zip 路徑，換台機器就 raise SystemExit。
#   本版改為自行產生帶標註的資料集（tmp_path），斷言邏輯逐字保留。
#   標註真相一律寫在 dataset.json（AGENTS.md：dataset.json 是 SSOT）。


def run_sidecar(source_dir, out_zip):
    proc = subprocess.Popen(
        [PY, "-u", "dataset_sidecar.py"],
        cwd=SIDECAR_DIR,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="replace",
    )
    try:
        proc.stdin.write(json.dumps({"command": "ping", "requestId": "p0"}) + "\n")
        proc.stdin.flush()
        resp = json.loads(proc.stdout.readline().strip())
        assert resp.get("success"), "ping failed: %s" % resp
        proc.stdin.write(json.dumps({
            "command": "exportDataset",
            "requestId": "e1",
            "sourceDir": source_dir,
            "outputZip": out_zip,
        }) + "\n")
        proc.stdin.flush()
        while True:
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("sidecar died: " + proc.stderr.read())
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if r.get("requestId") == "e1":
                return r
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


def _build_ball_dataset(root, write_image):
    """產生 detector 資料集（佈局 B：<label>/ + dataset.json）。

    [T4-2] 原腳本依賴使用者本機的 ball 資料集；此處自行產生，確保在任何機器
    都能跑。標註真相一律寫在 dataset.json（AGENTS.md 的 SSOT 規定）。
    """
    labels = {"redBall": 0, "blueBall": 1}
    samples = []
    for name in labels:
        for i in range(2):
            fn = f"{name}_{i}.jpg"
            write_image(root / name / fn, "JPEG")
            samples.append({
                "image_path": f"{name}/{fn}",
                "label": name,
                "annotations": [{"class_id": 0, "bbox": [0.2, 0.2, 0.8, 0.8]}],
            })
    spec = {
        "version": "1.0",
        "project": {"name": "ball", "type": "object_detection", "description": ""},
        "data_source": {"mode": "live", "files": [], "samples": samples,
                        "base_dir": "dataset/ball/"},
        "schema": {"columns": [], "features": [], "label": "", "label_map": labels},
        "stats": {"sample_count": len(samples),
                  "label_counts": {k: 2 for k in labels}, "samples_truncated": False},
    }
    with open(root / "dataset.json", "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False)


def check_detector(tmp):
    src = os.path.join(tmp, "stage_ball")
    os.makedirs(src, exist_ok=True)
    _build_ball_dataset(Path(src), _write)
    out_zip = os.path.join(tmp, "ball.zip")
    resp = run_sidecar(src, out_zip)
    assert resp.get("success"), "export failed: %s" % resp

    with zipfile.ZipFile(out_zip) as zf:
        names = zf.namelist()
        top = sorted({n.split("/")[0] for n in names})
        assert "redBall" not in top, "redBall/ 仍在 zip: %s" % top
        assert "blueBall" not in top, "blueBall/ 仍在 zip: %s" % top
        assert any(n.startswith("images/") for n in names), top
        assert any(n.startswith("labels/") for n in names), top
        for must in ("labels.txt", "dataset.json", "export_manifest.json"):
            assert must in names, "缺 %s" % must
        imgs = {os.path.splitext(n.split("/")[-1])[0]
                for n in names if n.startswith("images/") and n.lower().endswith((".jpg", ".jpeg", ".png"))}
        txts = {os.path.splitext(n.split("/")[-1])[0]
                for n in names if n.startswith("labels/") and n.endswith(".txt")}
        assert imgs, "images/ 為空"
        # 已標註樣本必有同名 txt（未標註允許無 txt：loader 會跳過）
        spec_json = json.loads(zf.read("dataset.json"))
        annotated = [os.path.splitext(os.path.basename(s["image_path"]))[0]
                     for s in spec_json["data_source"]["samples"] if s.get("annotations")]
        missing = [a for a in annotated if a not in txts or a not in imgs]
        assert not missing, "已標註缺配對: %s" % missing[:5]
        labels_txt = zf.read("labels.txt").decode("utf-8").split()
        assert labels_txt == ["redBall", "blueBall"], labels_txt
        sample_txt = sorted(n for n in names if n.startswith("labels/") and n.endswith(".txt"))[0]
        for ln in zf.read(sample_txt).decode("utf-8").strip().splitlines():
            parts = ln.split()
            assert len(parts) == 5 and int(parts[0]) in (0, 1), ln
            assert all(0.0 <= float(x) <= 1.0 for x in parts[1:]), ln
        extract = os.path.join(tmp, "extract")
        zf.extractall(extract)
        for d in ("images", "labels"):
            p = os.path.join(extract, d)
            assert os.path.isdir(p) and os.listdir(p), p
        assert os.path.isfile(os.path.join(extract, "labels.txt"))
        assert os.path.isdir(os.path.join(src, "redBall")), "staging redBall/ 被刪"
    return len(imgs)


def check_classifier(tmp, write_image):
    # image 類型：<label>/ 佈局照常保留，不做 images/ 去重
    src = os.path.join(tmp, "stage_cls")
    os.makedirs(os.path.join(src, "cat"))
    write_image(Path(src) / "cat" / "cat_1.jpg", "JPEG")
    spec = {"version": "1.0",
            "project": {"name": "cls", "type": "image", "description": ""},
            "data_source": {"mode": "file", "files": [],
                            "samples": [{"image_path": "cat/cat_1.jpg", "label": "cat", "annotations": []}],
                            "base_dir": "dataset/cls/"},
            "schema": {"columns": [], "features": [], "label": "", "label_map": {"cat": 0}},
            "stats": {"sample_count": 1, "label_counts": {"cat": 1}, "samples_truncated": False}}
    with open(os.path.join(src, "dataset.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False)
    out_zip = os.path.join(tmp, "cls.zip")
    resp = run_sidecar(src, out_zip)
    assert resp.get("success"), "classifier export failed: %s" % resp
    with zipfile.ZipFile(out_zip) as zf:
        names = zf.namelist()
        assert any(n.startswith("cat/") for n in names), "classifier <label>/ 被去重: %s" % names
        assert not any(n.startswith("images/") for n in names), "classifier 不該有 images/: %s" % names


def test_export_dataset(tmp_path, write_image):
    """sidecar exportDataset：detector 走 images/+labels/、classifier 保留 <label>/。"""
    n = check_detector(str(tmp_path))
    check_classifier(str(tmp_path), write_image)
    print("E2E EXPORT PASS: detector images=%d, classifier OK" % n)
