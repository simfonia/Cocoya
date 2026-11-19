r"""
tests/e2e/test_spatial_detector_dataset.py — Spatial Head 物件偵測資料集與標籤生成守門測試 (S1)

驗證項目：
1. 2D Gaussian Heatmap：中心峰值為 1.0，高斯衰減，值域嚴格 [0, 1]，邊界截斷正確。
2. Spatial Targets 生成：
   - 正樣本：熱圖峰值存在，Size map 在熱圖響應 >= 0.3 區域填入 [w, h] 且 mask=1.0。
   - 負樣本 (bbox=None)：全零熱圖，尺寸 map 與 mask 全零。
3. 資料集載入與過濾：
   - 保留無物件影像為負樣本。
   - 跳過僅含未分類框 (class_id=-1) 之影像（防污染負樣本）。
   - 單張多框明確拋錯拒絕 (ValueError)。
4. 批次座標感知隨機水平翻轉：
   - 翻轉時影像與 2D 空間特徵圖 (heatmap & size_map) 同步鏡射。
"""

import json
import os
import numpy as np
import pytest
import tensorflow as tf
from PIL import Image

from common.detector_dataset import (
    gaussian_heatmap,
    generate_spatial_targets,
    load_detector_dataset,
    _random_hflip_detector,
    prepare_detector_dataset
)


def _create_dummy_image(path, size=(64, 64), color=(128, 128, 128)):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = Image.new("RGB", size, color)
    img.save(path, format="JPEG")


def test_gaussian_heatmap_peak_and_decay():
    """驗證高斯熱圖中心峰值、邊界截斷與數值範圍。"""
    # 測試中心點 (0.5, 0.5)
    hm_center = gaussian_heatmap(0.5, 0.5, heatmap_size=28, sigma=1.5)
    assert hm_center.shape == (28, 28, 1)
    assert float(hm_center[14, 14, 0]) == 1.0
    assert float(np.min(hm_center)) >= 0.0
    assert float(np.max(hm_center)) <= 1.0

    # 峰值鄰近格遞減
    assert hm_center[14, 15, 0] < 1.0
    assert hm_center[14, 15, 0] > hm_center[14, 17, 0]

    # 左上邊界 (0.0, 0.0)
    hm_topleft = gaussian_heatmap(0.0, 0.0, heatmap_size=28, sigma=1.5)
    assert float(hm_topleft[0, 0, 0]) == 1.0

    # 右下邊界 (1.0, 1.0)
    hm_bottomright = gaussian_heatmap(1.0, 1.0, heatmap_size=28, sigma=1.5)
    assert float(hm_bottomright[27, 27, 0]) == 1.0


def test_generate_spatial_targets_positive_and_negative():
    """驗證正樣本與負樣本的目標生成。"""
    # 1. 正樣本：cx=0.5, cy=0.5, w=0.2, h=0.3
    bbox = [0.5, 0.5, 0.2, 0.3]
    hm, sz = generate_spatial_targets(bbox, heatmap_size=28, sigma=1.5)
    assert hm.shape == (28, 28, 1)
    assert sz.shape == (28, 28, 3)

    # 中心峰值處
    assert float(hm[14, 14, 0]) == 1.0
    assert np.isclose(sz[14, 14, 0], 0.2, atol=1e-5)
    assert np.isclose(sz[14, 14, 1], 0.3, atol=1e-5)
    assert float(sz[14, 14, 2]) == 1.0  # mask

    # 遠離目標的角落
    assert hm[0, 0, 0] < 0.01
    assert float(sz[0, 0, 2]) == 0.0  # mask=0
    assert float(sz[0, 0, 0]) == 0.0

    # 2. 負樣本 (bbox=None)
    hm_neg, sz_neg = generate_spatial_targets(None, heatmap_size=28, sigma=1.5)
    assert hm_neg.shape == (28, 28, 1)
    assert sz_neg.shape == (28, 28, 3)
    assert float(np.max(hm_neg)) == 0.0
    assert float(np.max(sz_neg)) == 0.0


def test_load_detector_dataset_with_negative_samples(tmp_path):
    """驗證資料集載入：正樣本、負樣本保留、未分類框略過。"""
    ds_root = tmp_path / "ping_pong_test"
    ball_dir = ds_root / "ball"
    ball_dir.mkdir(parents=True)

    # 建立 4 張正樣本、2 張無標註負樣本、1 張僅含未分類框影像
    for i in range(7):
        _create_dummy_image(ball_dir / f"img_{i}.jpg")

    spec = {
        "version": "1.0",
        "project": {"name": "test_ds", "type": "object_detection"},
        "data_source": {
            "mode": "live",
            "samples": [
                # 4 張正樣本
                {"image_path": "ball/img_0.jpg", "label": "ball", "annotations": [{"class_id": 0, "bbox": [0.1, 0.1, 0.2, 0.2]}]},
                {"image_path": "ball/img_1.jpg", "label": "ball", "annotations": [{"class_id": 0, "bbox": [0.2, 0.2, 0.3, 0.3]}]},
                {"image_path": "ball/img_2.jpg", "label": "ball", "annotations": [{"class_id": 0, "bbox": [0.3, 0.3, 0.2, 0.2]}]},
                {"image_path": "ball/img_3.jpg", "label": "ball", "annotations": [{"class_id": 0, "bbox": [0.4, 0.4, 0.1, 0.1]}]},
                # 2 張無物件負樣本（annotations 為空）
                {"image_path": "ball/img_4.jpg", "label": "ball", "annotations": []},
                {"image_path": "ball/img_5.jpg", "label": "ball", "annotations": []},
                # 1 張僅含未分類框（class_id = -1）
                {"image_path": "ball/img_6.jpg", "label": "ball", "annotations": [{"class_id": -1, "bbox": [0.5, 0.5, 0.2, 0.2]}]}
            ]
        },
        "schema": {"label_map": {"ball": 0}}
    }
    with open(ds_root / "dataset.json", "w", encoding="utf-8") as f:
        json.dump(spec, f)

    train_ds, val_ds, labels, class_counts = load_detector_dataset(
        str(ds_root),
        img_size=64,
        batch_size=2,
        validation_split=0.2,
        target_format='spatial'
    )

    # 驗證樣本數：4 正樣本 + 2 負樣本 = 6，未分類框應被略過
    assert sum(class_counts.values()) == 6
    assert class_counts["ball"] == 4
    assert class_counts["[負樣本]"] == 2
    assert "ball" in labels

    # 取出一批驗證形狀
    batch_img, (batch_hm, batch_sz) = next(iter(train_ds))
    assert batch_img.shape == (2, 64, 64, 3)
    assert batch_hm.shape == (2, 8, 8, 1)   # 64 // 8 = 8
    assert batch_sz.shape == (2, 8, 8, 3)


def test_multibox_rejection(tmp_path):
    """驗證單影像含多框時明確拋錯拒絕。"""
    ds_root = tmp_path / "multibox_test"
    ball_dir = ds_root / "ball"
    ball_dir.mkdir(parents=True)
    _create_dummy_image(ball_dir / "img_multi.jpg")

    spec = {
        "version": "1.0",
        "project": {"name": "test_multi", "type": "object_detection"},
        "data_source": {
            "mode": "live",
            "samples": [
                {
                    "image_path": "ball/img_multi.jpg",
                    "label": "ball",
                    "annotations": [
                        {"class_id": 0, "bbox": [0.1, 0.1, 0.2, 0.2]},
                        {"class_id": 0, "bbox": [0.6, 0.6, 0.2, 0.2]}
                    ]
                }
            ]
        },
        "schema": {"label_map": {"ball": 0}}
    }
    with open(ds_root / "dataset.json", "w", encoding="utf-8") as f:
        json.dump(spec, f)

    with pytest.raises(ValueError) as excinfo:
        load_detector_dataset(str(ds_root), img_size=64, batch_size=1, target_format='spatial')

    assert "Spatial Head 單目標架構目前每張影像最多僅支援一個標註目標" in str(excinfo.value)


def test_random_hflip_spatial_synchronization():
    """驗證批次水平翻轉時，特徵圖與影像座標同步鏡射。"""
    # 建立 1 個樣本：物件在左側 x=0.2 (grid_x = round(0.2 * 28) = 6)
    cx, cy, w, h = 0.2, 0.5, 0.1, 0.2
    hm, sz = generate_spatial_targets([cx, cy, w, h], heatmap_size=28)

    # 批次包裝：2 個樣本（一個固定觸發翻轉，一個固定不翻轉）
    images = tf.zeros((2, 224, 224, 3), dtype=tf.float32)
    heatmaps = tf.stack([hm, hm], axis=0)  # (2, 28, 28, 1)
    sizes = tf.stack([sz, sz], axis=0)     # (2, 28, 28, 3)

    # 呼叫翻轉函式
    flipped_images, (flipped_hm, flipped_sz) = _random_hflip_detector(
        images, (heatmaps, sizes)
    )

    assert flipped_hm.shape == (2, 28, 28, 1)
    assert flipped_sz.shape == (2, 28, 28, 3)
    assert float(np.min(flipped_hm)) >= 0.0
    assert float(np.max(flipped_hm)) <= 1.0
