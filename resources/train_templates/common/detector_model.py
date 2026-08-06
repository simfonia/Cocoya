"""
物件偵測模型建立模組
使用 MobileNetV2 backbone + 回歸頭，輸出單一目標的 bbox (cx, cy, w, h)。
"""

import tensorflow as tf
from common.classifier_model import get_backbone


def build_detector_model(backbone_name='mobilenetv2',
                         input_shape=(224, 224, 3), dropout_rate=0.2,
                         dnn_layers=None, fine_tune=False):
    """
    建立物件偵測回歸模型（單一目標）。

    架構：backbone → GlobalAveragePooling → FC layers → Dense(4, sigmoid)

    輸出 4 個值 [cx, cy, w, h]，均使用 sigmoid 活化函數限制在 0~1 範圍。

    Args:
        backbone_name: backbone 名稱（'mobilenetv2', 'efficientnet', 'resnet'）
        input_shape: 輸入影像形狀
        dropout_rate: Dropout 比率
        dnn_layers: 自訂全連接層設定（逗號分隔的神經元數字串，如 "128,64"）
        fine_tune: 是否解凍 backbone 進行微調

    Returns:
        tf.keras.Sequential 模型
    """
    base_model = get_backbone(backbone_name, input_shape)
    base_model.trainable = fine_tune

    layers = [base_model, tf.keras.layers.GlobalAveragePooling2D()]

    # 自訂全連接層
    if dnn_layers:
        try:
            neurons = [int(x.strip()) for x in dnn_layers.split(',') if x.strip()]
        except ValueError:
            print(f"警告: DNN_LAYERS 格式錯誤 '{dnn_layers}'，使用預設")
            neurons = []

        for i, n in enumerate(neurons):
            layers.append(tf.keras.layers.Dense(n, activation='relu', name=f'fc_{i+1}'))
            layers.append(tf.keras.layers.Dropout(dropout_rate, name=f'dropout_fc_{i+1}'))
    else:
        # 預設全連接層
        layers.append(tf.keras.layers.Dense(128, activation='relu', name='fc_1'))
        layers.append(tf.keras.layers.Dropout(dropout_rate, name='dropout_1'))

    # 回歸輸出層：4 個值 (cx, cy, w, h)，sigmoid 限制在 0~1
    layers.append(tf.keras.layers.Dense(4, activation='sigmoid', name='bbox_output'))

    model = tf.keras.Sequential(layers)
    return model