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

    fc_layers = create_fc_layers(dnn_layers, num_classes, dropout_rate)

    model = tf.keras.Sequential([base_model] + fc_layers)
    return model