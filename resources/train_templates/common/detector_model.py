"""
物件偵測模型建立模組 (Spatial Head 架構)
基於 MobileNetV2 雙尺度特徵融合 (Stride 8 + Stride 16) + 28x28 Heatmap / Size map 雙輸出頭。
徹底解決 Legacy GAP + Dense(4) 單框回歸均值塌陷問題。
"""

import os
import tensorflow as tf
from typing import Optional
from common.classifier_model import freeze_batchnorm_layers


def find_local_backup_weights(backbone_key: str) -> Optional[str]:
    """
    尋找專案內建的離線備援 ImageNet 預訓練權重。
    支援當網路無法連線時從本地 models/ImageNet/ 載入。
    """
    weight_filenames = {
        'mobilenetv2': 'mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5',
    }
    fname = weight_filenames.get(backbone_key)
    if not fname:
        return None

    # 1. 檢查 COCOYA_MODELS 環境變數
    env_dir = os.environ.get('COCOYA_MODELS')
    if env_dir:
        cand = os.path.join(env_dir, 'ImageNet', fname)
        if os.path.isfile(cand):
            return cand

    # 2. 向上搜尋包含 models/ImageNet 的專案根目錄
    cur = os.path.dirname(os.path.abspath(__file__))
    p = cur
    for _ in range(6):
        cand = os.path.join(p, 'models', 'ImageNet', fname)
        if os.path.isfile(cand):
            return cand
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent

    return None


def focal_heatmap_loss(y_true, y_pred, alpha=2.0, beta=4.0):
    """
    Modified Focal Loss (CenterNet 熱圖損失)。

    對 peak (y_true == 1.0) 與非 peak 高斯衰減區域施加非對稱懲罰，
    克服 28x28 = 784 個點中正樣本極端稀疏（1 vs 783）的負樣本壓倒問題。

    Args:
        y_true: 真實高斯熱圖 (B, 28, 28, 1)，peak 值為 1.0，負樣本全為 0.0
        y_pred: 預測熱圖 (B, 28, 28, 1)，經 sigmoid 活化
        alpha: 正負樣本難易度衰減因子 (預設 2.0)
        beta: 真實標籤高斯衰減處罰減免因子 (預設 4.0)

    Returns:
        純量 Tensor loss
    """
    y_pred = tf.clip_by_value(y_pred, 1e-6, 1.0 - 1e-6)
    pos_mask = tf.cast(tf.equal(y_true, 1.0), tf.float32)
    neg_mask = tf.cast(tf.less(y_true, 1.0), tf.float32)

    pos_loss = -tf.pow(1.0 - y_pred, alpha) * tf.math.log(y_pred) * pos_mask
    neg_loss = -tf.pow(1.0 - y_true, beta) * tf.pow(y_pred, alpha) * tf.math.log(1.0 - y_pred) * neg_mask

    num_pos = tf.reduce_sum(pos_mask)
    total_loss = tf.reduce_sum(pos_loss + neg_loss)
    return tf.where(tf.greater(num_pos, 0.0), total_loss / num_pos, total_loss)


def masked_size_loss(y_true, y_pred):
    """
    Masked L1 尺寸回歸損失。

    僅在中心點位置（y_true 中尺寸 > 0 的正樣本點）計算 L1 誤差；
    背景點與全負樣本影像 mask 為 0，不參與反向傳播。

    Args:
        y_true: 真實尺寸圖 (B, 28, 28, 3 或 2)，前 2 通道為 [w, h]，第 3 通道為 mask (若為 3 通道)
        y_pred: 預測尺寸圖 (B, 28, 28, 2)，經 sigmoid 活化

    Returns:
        純量 Tensor loss
    """
    y_true_wh = y_true[..., 0:2]
    if y_true.shape[-1] == 3:
        mask = y_true[..., 2:3]
    else:
        mask = tf.cast(y_true[..., 0:1] > 0.0, tf.float32)

    l1_diff = tf.abs(y_true_wh - y_pred) * mask
    num_pos = tf.reduce_sum(mask)
    return tf.where(tf.greater(num_pos, 0.0), tf.reduce_sum(l1_diff) / num_pos, 0.0)


def _find_stride_layers(base_model, backbone_name='mobilenetv2'):
    """找出 Stride 8 (28x28) 與 Stride 16 (14x14) 特徵層名稱。"""
    key = backbone_name.lower().replace('-', '').replace('_', '')
    known_layers = {
        'mobilenetv2': ('block_6_expand_relu', 'block_13_expand_relu'),
        'efficientnet': ('block4a_expand_activation', 'block6a_expand_activation'),
        'resnet': ('conv3_block4_out', 'conv4_block6_out'),
    }

    if key in known_layers:
        s8_name, s16_name = known_layers[key]
        try:
            base_model.get_layer(s8_name)
            base_model.get_layer(s16_name)
            return s8_name, s16_name
        except ValueError:
            pass

    # 若特定名稱找不到，動態搜尋尺寸符合的特徵層
    s8_layer, s16_layer = None, None
    for layer in base_model.layers:
        try:
            shp = layer.output.shape
            if len(shp) == 4:
                if shp[1] == 28 and shp[2] == 28:
                    s8_layer = layer.name
                elif shp[1] == 14 and shp[2] == 14:
                    s16_layer = layer.name
        except Exception:
            pass

    if s8_layer and s16_layer:
        return s8_layer, s16_layer

    raise ValueError(f"無法在 backbone '{backbone_name}' 中找到 28x28 與 14x14 特徵層")


def build_detector_model(backbone_name: str = 'mobilenetv2',
                         input_shape: tuple = (224, 224, 3), dropout_rate: float = 0.2,
                         dnn_layers=None, fine_tune: bool = False, weights: Optional[str] = 'imagenet'):
    """
    建立 Spatial Head 物件偵測模型。

    架構：
      Backbone (如 MobileNetV2)
        ├── Stride 8 特徵 (28x28) ────────────────┐
        └── Stride 16 特徵 (14x14) ──[Bilinear Up]─┴──[Concatenate] (28x28)
                                                            │
                                              [Conv2D 96 + Dropout + Conv2D 64]
                                                            │
                                           ┌────────────────┴────────────────┐
                                     [Conv 1x1, Sigmoid]              [Conv 1x1, Sigmoid]
                                       Heatmap (28x28x1)                Size map (28x28x2)

    Args:
        backbone_name: backbone 名稱（'mobilenetv2', 'efficientnet', 'resnet'）
        input_shape: 輸入影像形狀（預設 (224, 224, 3)）
        dropout_rate: Dropout 比率
        dnn_layers: 保留參數介面（向後相容）
        fine_tune: 是否解凍 backbone 進行微調
        weights: 預訓練權重（'imagenet' 或 None）

    Returns:
        tf.keras.Model 雙輸出模型: inputs=[image_input], outputs=[heatmap, size_map]
    """
    key = backbone_name.lower().replace('-', '').replace('_', '')

    # 建立 backbone
    try:
        if key == 'efficientnet':
            base_model = tf.keras.applications.EfficientNetB0(
                input_shape=input_shape, include_top=False, weights=weights
            )
        elif key == 'resnet':
            base_model = tf.keras.applications.ResNet50(
                input_shape=input_shape, include_top=False, weights=weights
            )
        else:
            base_model = tf.keras.applications.MobileNetV2(
                input_shape=input_shape, include_top=False, weights=weights
            )
    except Exception as e:
        # 若線上下載失敗，嘗試使用本地離線備援權重
        if weights == 'imagenet':
            local_weights = find_local_backup_weights(key)
            if local_weights:
                lang = os.environ.get('COCOYA_LANG', 'zh-hant').lower()
                if 'en' in lang:
                    print(f"Notice: Online ImageNet download failed ({e}), using local backup weights: {local_weights}")
                else:
                    print(f"提示: 線上下載 ImageNet 權重失敗 ({e})，使用本地離線備援權重: {local_weights}")
                try:
                    return build_detector_model(
                        backbone_name=backbone_name,
                        input_shape=input_shape,
                        dropout_rate=dropout_rate,
                        dnn_layers=dnn_layers,
                        fine_tune=fine_tune,
                        weights=local_weights
                    )
                except Exception as local_err:
                    print(f"警告: 載入本地離線備援權重亦失敗: {local_err}")

        if weights is not None:
            lang = os.environ.get('COCOYA_LANG', 'zh-hant').lower()
            if 'en' in lang:
                print(f"Warning: Failed to load ImageNet weights ({e}), falling back to weights=None initialization.")
                if not fine_tune:
                    print("=" * 70)
                    print("⚠️ WARNING: Random backbone weights with fine_tune=False detected!")
                    print("  In an offline environment without pre-trained weights, spatial features cannot converge.")
                    print("  Recommended: Enable 'Fine Tune' (fine_tune=True) or place ImageNet weights in models/ImageNet/")
                    print("=" * 70)
            else:
                print(f"警告: 載入 ImageNet 權重失敗 ({e})，降級為 weights=None 初始化")
                if not fine_tune:
                    print("=" * 70)
                    print("⚠️ 注意: 目前使用隨機初始權重且微調為關閉 (fine_tune=False)！")
                    print("  無預訓練權重的骨幹若被凍結，特徵層輸出隨機雜訊，物件偵測空間定位將無法收斂。")
                    print("  建議方案: 開啟微調 (fine_tune=True) 讓骨幹參與學習，或將權重檔放至 models/ImageNet/")
                    print("=" * 70)

            return build_detector_model(
                backbone_name=backbone_name,
                input_shape=input_shape,
                dropout_rate=dropout_rate,
                dnn_layers=dnn_layers,
                fine_tune=fine_tune,
                weights=None
            )
        raise e

    base_model.trainable = fine_tune
    if fine_tune:
        freeze_batchnorm_layers(base_model)

    # 提取雙尺度特徵層
    s8_name, s16_name = _find_stride_layers(base_model, backbone_name)
    feat_s8 = base_model.get_layer(s8_name).output
    feat_s16 = base_model.get_layer(s16_name).output

    # 特徵融合：Stride 16 雙線性上採樣 2x 至 28x28，並與 Stride 8 拼接
    feat_s16_up = tf.keras.layers.UpSampling2D(
        size=(2, 2), interpolation='bilinear', name='up_stride16'
    )(feat_s16)
    merged = tf.keras.layers.Concatenate(name='feat_concat')([feat_s8, feat_s16_up])

    # 提煉頭部 (Refinement Head)
    x = tf.keras.layers.Conv2D(96, (3, 3), padding='same', activation='relu', name='head_conv1')(merged)
    if dropout_rate > 0:
        x = tf.keras.layers.Dropout(dropout_rate, name='head_dropout')(x)
    x = tf.keras.layers.Conv2D(64, (3, 3), padding='same', activation='relu', name='head_conv2')(x)

    # 雙輸出頭
    # 1. Heatmap: 輸出空間熱圖 (B, 28, 28, 1)，以 -2.19 初始化偏置（對應 sigmoid ≈ 0.1 背景抑制）
    hm_out = tf.keras.layers.Conv2D(
        1, (1, 1),
        activation='sigmoid',
        bias_initializer=tf.keras.initializers.Constant(-2.19),
        name='heatmap'
    )(x)

    # 2. Size map: 輸出尺寸圖 (B, 28, 28, 2)，以常態分佈先驗偏置初始化
    sz_out = tf.keras.layers.Conv2D(
        2, (1, 1),
        activation='sigmoid',
        bias_initializer=tf.keras.initializers.Constant([-2.2, -1.9]),
        name='size_map'
    )(x)

    model = tf.keras.Model(
        inputs=base_model.input,
        outputs=[hm_out, sz_out],
        name='spatial_detector'
    )
    return model
