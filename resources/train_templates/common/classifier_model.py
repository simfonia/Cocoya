"""
模型建立共同模組
提供 backbone 選擇、分類頭建立、全連接層自訂等功能。
"""

import tensorflow as tf

# 支援的 backbone 對照表
BACKBONE_REGISTRY = {
    'mobilenetv2': {
        'builder': lambda input_shape: tf.keras.applications.MobileNetV2(
            input_shape=input_shape, include_top=False, weights='imagenet'
        ),
        'default_img_size': 224,
        'description': 'MobileNetV2 (ImageNet)',
    },
    'efficientnet': {
        'builder': lambda input_shape: tf.keras.applications.EfficientNetB0(
            input_shape=input_shape, include_top=False, weights='imagenet'
        ),
        'default_img_size': 224,
        'description': 'EfficientNetB0 (ImageNet)',
    },
    'resnet': {
        'builder': lambda input_shape: tf.keras.applications.ResNet50(
            input_shape=input_shape, include_top=False, weights='imagenet'
        ),
        'default_img_size': 224,
        'description': 'ResNet50 (ImageNet)',
    },
}


def get_backbone(name, input_shape=(224, 224, 3)):
    """
    根據名稱取得 backbone 模型。

    Args:
        name: backbone 名稱（'mobilenetv2', 'efficientnet', 'resnet'）
        input_shape: 輸入影像形狀

    Returns:
        tf.keras.Model backbone（不含頂部分類層）
    """
    key = name.lower().replace('-', '').replace('_', '')
    if key not in BACKBONE_REGISTRY:
        print(f"警告: 不支援的 backbone '{name}'，使用預設 MobileNetV2")
        key = 'mobilenetv2'

    builder = BACKBONE_REGISTRY[key]['builder']
    return builder(input_shape)


def freeze_batchnorm_layers(model):
    """
    將模型內所有 BatchNormalization 層設為不可訓練（fine-tune 標準做法）。

    背景：fine_tune=True 解凍 backbone 後，BN 的 gamma/beta 權重與 moving 統計會
    一起被更新。但 BN 在 training=True 用「當前 batch 統計」、training=False（推論
    與 TFLite 部署）用「moving 統計」；小資料集（樣本少、每 epoch step 數低）下
    momentum 預設 0.99 的 moving 統計遠追不上微調造成的分佈漂移，導致：
      - training=True：輸出正常（loss 下降、IoU 上升）
      - training=False（部署）：用滯後統計，輸出塌陷（IoU→0，框縮成一點）
    凍結 BN 層後兩模式特徵一致（實測 mean|training-inference| 由 1.21 歸零），
    可消除「訓練曲線正常但部署失效」。卷積權重仍可正常微調。

    Args:
        model: tf.keras.Model（通常為 backbone / base_model）

    Returns:
        int: 被凍結的 BatchNormalization 層數量
    """
    frozen = 0
    for layer in model.layers:
        if isinstance(layer, tf.keras.layers.BatchNormalization):
            layer.trainable = False
            frozen += 1
    return frozen


def create_fc_layers(dnn_layers_config, num_classes, dropout_rate=0.2):
    """
    根據設定建立全連接層（分類頭）。

    Args:
        dnn_layers_config: 全連接層設定
            - 字串格式：逗號分隔的神經元數，如 "128,64"
            - None 或空字串：使用預設（GlobalAveragePooling + Dropout + Dense）
        num_classes: 分類數
        dropout_rate: Dropout 比率

    Returns:
        list of tf.keras.layers.Layer
    """
    layers = []

    if dnn_layers_config:
        # 解析逗號分隔的神經元數
        try:
            neurons = [int(x.strip()) for x in dnn_layers_config.split(',') if x.strip()]
        except ValueError:
            print(f"警告: DNN_LAYERS 格式錯誤 '{dnn_layers_config}'，使用預設")
            neurons = []

        if neurons:
            # 先做 GlobalAveragePooling
            layers.append(tf.keras.layers.GlobalAveragePooling2D())
            # 加入自訂全連接層
            for i, n in enumerate(neurons):
                layers.append(tf.keras.layers.Dense(n, activation='relu',
                                                     name=f'fc_{i+1}'))
                layers.append(tf.keras.layers.Dropout(dropout_rate,
                                                       name=f'dropout_fc_{i+1}'))
            # 最後的分類層
            layers.append(tf.keras.layers.Dense(num_classes, activation='softmax',
                                                 name='classification'))
            return layers

    # 預設：GlobalAveragePooling + Dropout + Dense
    return [
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dropout(dropout_rate),
        tf.keras.layers.Dense(num_classes, activation='softmax'),
    ]


def build_image_model(num_classes, backbone_name='mobilenetv2',
                      input_shape=(224, 224, 3), dropout_rate=0.2,
                      dnn_layers=None, fine_tune=False):
    """
    建立完整的影像分類模型（backbone + 分類頭）。

    Args:
        num_classes: 分類數
        backbone_name: backbone 名稱
        input_shape: 輸入影像形狀
        dropout_rate: Dropout 比率
        dnn_layers: 自訂全連接層設定（字串或 None）
        fine_tune: 是否解凍 backbone 進行微調

    Returns:
        tf.keras.Sequential 模型
    """
    base_model = get_backbone(backbone_name, input_shape)
    base_model.trainable = fine_tune
    if fine_tune:
        # 解凍 backbone 時凍結 BN 層（見 freeze_batchnorm_layers 說明）：
        # 避免小資料集下 BN moving 統計追不上微調漂移，造成部署/推論輸出塌陷。
        freeze_batchnorm_layers(base_model)

    fc_layers = create_fc_layers(dnn_layers, num_classes, dropout_rate)

    model = tf.keras.Sequential([base_model] + fc_layers)
    return model