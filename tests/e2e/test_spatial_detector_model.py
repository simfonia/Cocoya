"""
端到端測試：Spatial Head 物件偵測模型與損失函式
驗證 S2 步驟的模型組裝、特徵融合、損失計算、空間解碼與 TFLite 匯出。
"""

import os
import sys
import tempfile
import numpy as np
import pytest

_train_templates = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../resources/train_templates'))
if _train_templates not in sys.path:
    sys.path.insert(0, _train_templates)

import tensorflow as tf
from common.detector_model import build_detector_model, focal_heatmap_loss, masked_size_loss
from object_detection.object_detection_train import compute_bbox_iou, evaluate_spatial_detector
from common.model_export import export_tflite


def test_spatial_detector_model_architecture():
    """驗證模型輸入輸出形狀與層級結構。"""
    model = build_detector_model('mobilenetv2', input_shape=(224, 224, 3), weights=None)
    assert len(model.inputs) == 1
    assert tuple(model.inputs[0].shape) == (None, 224, 224, 3)

    assert len(model.outputs) == 2
    # 輸出 1: Heatmap (28, 28, 1)
    assert tuple(model.outputs[0].shape) == (None, 28, 28, 1)
    # 輸出 2: Size map (28, 28, 2)
    assert tuple(model.outputs[1].shape) == (None, 28, 28, 2)


def test_focal_and_masked_loss_computation():
    """驗證 Focal Loss 與 Masked Size Loss 在正負樣本上的計算行為。"""
    # 正樣本熱圖與預測
    y_true_hm = np.zeros((1, 28, 28, 1), dtype=np.float32)
    y_true_hm[0, 14, 14, 0] = 1.0  # peak
    y_pred_hm = np.full((1, 28, 28, 1), 0.1, dtype=np.float32)

    # 尺寸標籤在中心點有非零值
    y_true_sz = np.zeros((1, 28, 28, 2), dtype=np.float32)
    y_true_sz[0, 14, 14, :] = [0.3, 0.4]
    y_pred_sz = np.full((1, 28, 28, 2), 0.2, dtype=np.float32)

    l_hm = focal_heatmap_loss(tf.constant(y_true_hm), tf.constant(y_pred_hm)).numpy()
    l_sz = masked_size_loss(tf.constant(y_true_sz), tf.constant(y_pred_sz)).numpy()

    assert l_hm > 0.0
    # L1: |0.3 - 0.2| + |0.4 - 0.2| = 0.1 + 0.2 = 0.3
    assert abs(l_sz - 0.3) < 1e-4

    # 全負樣本情境
    neg_true_hm = np.zeros((1, 28, 28, 1), dtype=np.float32)
    neg_true_sz = np.zeros((1, 28, 28, 2), dtype=np.float32)

    l_neg_hm = focal_heatmap_loss(tf.constant(neg_true_hm), tf.constant(y_pred_hm)).numpy()
    l_neg_sz = masked_size_loss(tf.constant(neg_true_sz), tf.constant(y_pred_sz)).numpy()

    assert l_neg_hm > 0.0  # 背景有處罰
    assert l_neg_sz == 0.0  # 負樣本無尺寸損失


def test_spatial_detector_train_step():
    """驗證模型能正常編譯並執行單步梯度更新。"""
    model = build_detector_model('mobilenetv2', input_shape=(224, 224, 3), weights=None)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss={'heatmap': focal_heatmap_loss, 'size_map': masked_size_loss},
        loss_weights={'heatmap': 1.0, 'size_map': 5.0}
    )

    dummy_x = np.random.uniform(0.0, 1.0, (2, 224, 224, 3)).astype(np.float32)
    dummy_hm = np.zeros((2, 28, 28, 1), dtype=np.float32)
    dummy_hm[0, 10, 10, 0] = 1.0
    dummy_sz = np.zeros((2, 28, 28, 2), dtype=np.float32)
    dummy_sz[0, 10, 10, :] = [0.2, 0.3]

    res = model.train_on_batch(dummy_x, [dummy_hm, dummy_sz])
    assert len(res) == 3  # total_loss, heatmap_loss, size_map_loss
    assert all(not np.isnan(v) for v in res)


def test_evaluate_spatial_detector():
    """驗證空間預測解碼與 IoU 評估。"""
    model = build_detector_model('mobilenetv2', input_shape=(224, 224, 3), weights=None)

    dummy_x = np.zeros((2, 224, 224, 3), dtype=np.float32)
    dummy_hm = np.zeros((2, 28, 28, 1), dtype=np.float32)
    dummy_hm[0, 14, 14, 0] = 1.0  # sample 0 為正樣本
    dummy_sz = np.zeros((2, 28, 28, 2), dtype=np.float32)
    dummy_sz[0, 14, 14, :] = [0.5, 0.5]
    # sample 1 為負樣本 (全零)

    ds = tf.data.Dataset.from_tensor_slices((dummy_x, (dummy_hm, dummy_sz))).batch(2)
    metrics = evaluate_spatial_detector(model, ds, conf_threshold=0.3)

    assert 'mean_iou' in metrics
    assert 'iou50_rate' in metrics
    assert 'fp_rate' in metrics
    assert metrics['num_pos'] == 1
    assert metrics['num_neg'] == 1


def test_spatial_detector_tflite_export():
    """驗證 Float32 TFLite 匯出功能。"""
    model = build_detector_model('mobilenetv2', input_shape=(224, 224, 3), weights=None)
    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = os.path.join(tmpdir, 'model_f32.tflite')
        ok, size_kb, err = export_tflite(model, None, out_path, quantize=False)
        assert ok is True
        assert os.path.exists(out_path)
        assert size_kb > 1000  # 約 5MB
