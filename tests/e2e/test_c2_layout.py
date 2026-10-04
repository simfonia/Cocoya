r"""
tests/e2e/test_c2_layout.py — 訓練資料集「雙佈局」契約測試（C2，2026-09-23）

【測什麼】
訓練資料集有兩種佈局，本專案的 loader 都必須支援：
  佈局 A（匯出／第三方 YOLO 工具）：images/ + labels/（或 lines/）+ labels.txt
  佈局 B（DM 日常，拍完即練）：    <label>/*.jpg + dataset.json（標註真相）
AGENTS.md 記載：標註 SSOT 永遠是 dataset.json；images/ 不存在時走佈局 B。

【T4-2 轉換說明（2026-10-03）】
原腳本（temp_scripts/e2e_c2_check.py）依賴使用者本機資料集：
    BALL = r'C:/Users/simfonia/Desktop/cocoya/dataset/ball'
    ZIPD = r'C:/Users/simfonia/Desktop/cocoya/zip'
換台機器就失效 —— 這是它長期未被執行、腐化無人察覺的主因之一。
本版改為**自行產生夾具**（tmp_path + PIL 產圖），斷言邏輯逐字保留，
但不再依賴任何外部資料集。
"""

import json
import os

import numpy as np

from common import detector_dataset
from common import line_dataset


def check(cond, msg):
    """[T4-2] 原為累積 FAILS + 最後 sys.exit(1)；改為 pytest 斷言。
    優點：失敗時立刻指出是哪一行、哪個 msg，而非跑完才總結。"""
    assert cond, msg


def _make_labeled_dataset(root, write_image):
    """產生佈局 B 的 detector 資料集（兩個類別各 2 張，含標註）。

    回傳 (root, n_annotated, label_names)。
    """
    labels = {"redBall": 0, "blueBall": 1}
    samples = []
    for name in labels:
        for i in range(2):
            fn = f"{name}_{i}.jpg"
            write_image(root / name / fn, "JPEG")
            # bbox 四值皆落在 [0,1]，供「bbox 全在 [0,1]」斷言使用
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
                  "label_counts": {k: 2 for k in labels}},
    }
    with open(root / "dataset.json", "w", encoding="utf-8") as f:
        json.dump(spec, f)
    return root, len(samples), list(labels)


def test_detector_layout_b(tmp_path, write_image):
    """佈局 B（DM 落盤）→ loader 直接可練。"""
    root, n_annotated, label_names = _make_labeled_dataset(tmp_path / "ball", write_image)

    spec = json.loads((root / "dataset.json").read_text(encoding="utf-8"))
    samples = spec["data_source"]["samples"]
    assert len(samples) == n_annotated

    train_ds, val_ds, labels, class_counts = detector_dataset.load_detector_dataset(
        str(root), batch_size=2, validation_split=0.2)
    total = sum(class_counts.values())
    check(total == n_annotated, f"ball 直練：有效樣本 {total} == 已標註數 {n_annotated}")
    check(all(n in labels for n in label_names),
          f"ball 標籤自 label_map 還原: {labels}")
    check(set(class_counts.keys()) <= set(labels),
          f"class_counts 鍵為標籤名且合法: {class_counts}")

    # 取一批驗證解碼（路徑為 <label>/ 絕對路徑）
    bx, by = next(iter(val_ds if val_ds is not None else train_ds))
    check(bx.shape[-1] == 3 and by.shape[-1] == 4,
          f"batch 解碼 OK image={bx.shape} bbox={by.shape}")
    check(float(np.min(by)) >= 0.0 and float(np.max(by)) <= 1.0,
          f"bbox 全在 [0,1]: min={float(np.min(by)):.3f} max={float(np.max(by)):.3f}")


def test_line_dataset_layout_b(tmp_path, write_image):
    """line 佈局 B（<label>/ + dataset.json 的 line 標註）。"""
    sub = tmp_path / "track"
    sub.mkdir()
    names = []
    for i in range(4):
        fn = f"line_{i}.jpg"
        write_image(sub / fn, "JPEG")
        names.append(fn)

    fixture_spec = {
        "version": "1.0",
        "project": {"name": "linefix", "type": "line_following", "description": ""},
        "data_source": {"mode": "live", "files": [], "samples": [
            {"image_path": f"track/{fn}",
             "label": "track",
             "annotations": [{"class_id": 0, "line": [0.1, 0.9, 0.9, 0.1]}]}
            for fn in names
        ], "base_dir": "dataset/linefix/"},
        "schema": {"columns": [], "features": [], "label": "", "label_map": {"track": 0}},
        "stats": {"sample_count": 4, "label_counts": {"track": 4}}
    }
    with open(tmp_path / "dataset.json", "w", encoding="utf-8") as f:
        json.dump(fixture_spec, f)

    train_l, val_l, meta_l = line_dataset.load_line_dataset(
        str(tmp_path), batch_size=2, validation_split=0.25)
    check(meta_l["sample_count"] == 4, f"line 佈局 B: sample_count={meta_l['sample_count']} == 4")
    lx, ly = next(iter(val_l if val_l is not None else train_l))
    check(ly.shape[-1] == 4, f"line batch OK: {ly.shape}")
    check(abs(float(ly.numpy().flat[0]) - 0.1) < 1e-5, "line 座標正確取自 dataset.json")


def test_line_dataset_layout_a(tmp_path, write_image):
    """line 佈局 A（images/ + lines/ 的 .txt）回歸。"""
    names = []
    for i in range(4):
        fn = f"line_{i}.jpg"
        write_image(tmp_path / "images" / fn, "JPEG")
        names.append(fn)

    ldir = tmp_path / "lines"
    ldir.mkdir()
    for fn in names:
        with open(ldir / (os.path.splitext(fn)[0] + ".txt"), "w") as tf_:
            tf_.write("0.2 0.8 0.8 0.2")

    _, _, meta_a = line_dataset.load_line_dataset(
        str(tmp_path), batch_size=2, validation_split=0.25)
    check(meta_a["sample_count"] == 4, f"line 佈局 A 回歸: {meta_a['sample_count']} == 4")

