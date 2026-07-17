"""
模型匯出共同模組
提供 TFLite 轉換（量化/非量化）、模型儲存與標籤檔儲存功能。
"""

import os
import tensorflow as tf


def save_keras_model(model, output_path):
    """
    儲存 Keras 模型。

    Args:
        model: tf.keras.Model
        output_path: 輸出路徑（含 .keras 副檔名）

    Returns:
        str: 實際儲存路徑
    """
    model.save(output_path)
    print(f"Keras 模型已儲存: {output_path}")
    return output_path


def export_tflite(model, train_ds, output_path, quantize=True):
    """
    將 Keras 模型轉換為 TFLite 格式。

    Args:
        model: tf.keras.Model
        train_ds: 訓練集 Dataset（用於代表資料集量化）
        output_path: 輸出路徑（含 .tflite 副檔名）
        quantize: 是否進行 int8 量化

    Returns:
        tuple: (success, size_kb, error_message)
    """
    converter = tf.lite.TFLiteConverter.from_keras_model(model)

    if quantize:
        # 使用代表資料集進行量化
        def representative_dataset():
            for images, _ in train_ds.take(100):
                yield [images]

        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.representative_dataset = representative_dataset
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type = tf.uint8
        converter.inference_output_type = tf.uint8

        try:
            tflite_model = converter.convert()
            with open(output_path, 'wb') as f:
                f.write(tflite_model)
            size_kb = len(tflite_model) / 1024
            print(f"TFLite 量化模型已儲存: {output_path} ({size_kb:.1f} KB)")
            return True, size_kb, None
        except Exception as e:
            print(f"量化轉換失敗: {e}")
            print("改為儲存 Float32 版本...")
            # 降級為 Float32
            converter2 = tf.lite.TFLiteConverter.from_keras_model(model)
            tflite_model = converter2.convert()
            with open(output_path, 'wb') as f:
                f.write(tflite_model)
            size_kb = len(tflite_model) / 1024
            print(f"TFLite Float32 模型已儲存: {output_path} ({size_kb:.1f} KB)")
            return True, size_kb, f"量化失敗，降級為 Float32: {e}"
    else:
        # Float32 版本
        tflite_model = converter.convert()
        with open(output_path, 'wb') as f:
            f.write(tflite_model)
        size_kb = len(tflite_model) / 1024
        print(f"TFLite Float32 模型已儲存: {output_path} ({size_kb:.1f} KB)")
        return True, size_kb, None


def save_labels(labels, output_path):
    """
    儲存分類標籤檔（每行一個標籤）。

    Args:
        labels: 標籤列表
        output_path: 輸出路徑
    """
    with open(output_path, 'w') as f:
        for label in labels:
            f.write(f"{label}\n")
    print(f"Labels 已儲存: {output_path}")