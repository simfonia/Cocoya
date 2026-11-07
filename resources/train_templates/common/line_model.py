"""
循線回歸模型建立模組（獨立於 detector_model，不共用 Legacy GAP+Dense(4) 實作）

Phase A：GAP + Dense(4, sigmoid)，語意為線段端點 [x1, y1, x2, y2]（歸一化比例座標）。
Phase B（預留）：升級為保留空間資訊的 Spatial Feature Head，
                 輸入輸出格式不變，只改內部 head 結構。

物件偵測升級計畫（ObjectDetectionUpgrade_MultiScale.md）施工原則 §2.8：
  移除 Legacy detector_model 之前，循線模型建構路徑必須先獨立。
  本模組是循線訓練的唯一模型建構入口，不依賴 detector_model.py。
"""

import tensorflow as tf
from common.classifier_model import get_backbone, freeze_batchnorm_layers


def build_line_model(backbone_name='mobilenetv2',
                     input_shape=(224, 224, 3), dropout_rate=0.2,
                     dnn_layers=None, fine_tune=False):
    """
    建立循線回歸模型（線段端點回歸）。

    架構（Phase A）：backbone → GlobalAveragePooling → FC layers → Dense(4, sigmoid)

    輸出 4 個值 [x1, y1, x2, y2]，均使用 sigmoid 活化函數限制在 0~1 範圍。
    語意為歸一化的線段端點座標，與 Dataset Manager 標註格式一致。

    Args:
        backbone_name: backbone 名稱（'mobilenetv2', 'efficientnet', 'resnet'）
        input_shape: 輸入影像形狀，預設 (224, 224, 3)
        dropout_rate: Dropout 比率（0.0~0.9）
        dnn_layers: 自訂全連接層設定（逗號分隔神經元數字串，如 "128,64"；
                    None 則使用預設 Dense(128)）
        fine_tune: 是否解凍 backbone 進行微調；解凍時自動凍結 BN 層

    Returns:
        tf.keras.Sequential 模型（輸出形狀 (batch, 4)）
    """
    base_model = get_backbone(backbone_name, input_shape)
    base_model.trainable = fine_tune
    if fine_tune:
        # 解凍 backbone 時凍結 BN 層：
        # 避免小資料集下 BN moving 統計追不上微調漂移，造成部署/推論輸出塌陷。
        freeze_batchnorm_layers(base_model)

    layers = [base_model, tf.keras.layers.GlobalAveragePooling2D()]

    # 自訂全連接層
    if dnn_layers:
        try:
            neurons = [int(x.strip()) for x in dnn_layers.split(',') if x.strip()]
        except ValueError:
            print(f"警告: DNN_LAYERS 格式錯誤 '{dnn_layers}'，使用預設 Dense(128)")
            neurons = []

        for i, n in enumerate(neurons):
            layers.append(tf.keras.layers.Dense(n, activation='relu', name=f'line_fc_{i+1}'))
            layers.append(tf.keras.layers.Dropout(dropout_rate, name=f'line_dropout_{i+1}'))
    else:
        # 預設全連接層
        layers.append(tf.keras.layers.Dense(128, activation='relu', name='line_fc_1'))
        layers.append(tf.keras.layers.Dropout(dropout_rate, name='line_dropout_1'))

    # 回歸輸出層：4 個值 [x1, y1, x2, y2]，sigmoid 限制在 0~1
    layers.append(tf.keras.layers.Dense(4, activation='sigmoid', name='line_output'))

    model = tf.keras.Sequential(layers)
    return model
