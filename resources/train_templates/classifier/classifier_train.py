"""
通用圖像分類訓練腳本
基於 MobileNetV2 轉移學習，產出 TFLite 模型
已通過 MVP 專案驗證（準確率 93-94%）
"""

import argparse
import os
import sys
import json
import numpy as np
from datetime import datetime

# === 依賴檢查 ===
try:
    import tensorflow as tf
    import tensorflow_hub as hub
except ImportError:
    print("錯誤: 請先安裝 tensorflow")
    print("  pip install tensorflow tensorflow-hub")
    sys.exit(1)

from sklearn.utils import class_weight

def main():
    parser = argparse.ArgumentParser(description='通用圖像分類訓練腳本')
    parser.add_argument('--dataset_dir', required=True, help='資料集目錄路徑')
    parser.add_argument('--output_dir', required=True, help='模型輸出目錄（包含 labels.txt）')
    parser.add_argument('--epochs', type=int, default=30, help='訓練輪數')
    parser.add_argument('--batch_size', type=int, default=32, help='批次大小')
    parser.add_argument('--learning_rate', type=float, default=0.001, help='學習率')
    parser.add_argument('--project_name', default='training_project', help='專案名稱')

    args = parser.parse_args()

    # 確保輸出目錄存在
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"=== 開始訓練 ===")
    print(f"專案名稱: {args.project_name}")
    print(f"資料集: {args.dataset_dir}")
    print(f"輸出目錄: {args.output_dir}")
    print(f"訓練參數:")
    print(f"  - Epochs: {args.epochs}")
    print(f"  - Batch Size: {args.batch_size}")
    print(f"  - Learning Rate: {args.learning_rate}")
    print()

    # === 檢查資料集 ===
    if not os.path.exists(args.dataset_dir):
        print(f"錯誤: 找不到資料集目錄 {args.dataset_dir}")
        sys.exit(1)

    labels = sorted([d for d in os.listdir(args.dataset_dir)
                      if os.path.isdir(os.path.join(args.dataset_dir, d))])

    if len(labels) < 2:
        print(f"錯誤: 至少需要 2 個分類，目前只有 {len(labels)} 個")
        sys.exit(1)

    print(f"找到 {len(labels)} 個分類: {labels}")

    # 計算各分類的張數
    for label in labels:
        count = len([f for f in os.listdir(os.path.join(args.dataset_dir, label))
                      if f.endswith('.jpg')])
        print(f"  {label}: {count} 張")

    # === 載入資料集 ===
    print("\n載入資料集...")
    IMG_SIZE = 224
    BATCH_SIZE = args.batch_size

    train_ds = tf.keras.preprocessing.image_dataset_from_directory(
        args.dataset_dir,
        validation_split=0.2,
        subset='training',
        seed=123,
        image_size=(IMG_SIZE, IMG_SIZE),
        batch_size=BATCH_SIZE,
        label_mode='categorical'
    )

    val_ds = tf.keras.preprocessing.image_dataset_from_directory(
        args.dataset_dir,
        validation_split=0.2,
        subset='validation',
        seed=123,
        image_size=(IMG_SIZE, IMG_SIZE),
        batch_size=BATCH_SIZE,
        label_mode='categorical'
    )

    # 資料擴增
    data_augmentation = tf.keras.Sequential([
        tf.keras.layers.RandomFlip('horizontal'),
        tf.keras.layers.RandomRotation(0.2),
        tf.keras.layers.RandomZoom(0.2),
        tf.keras.layers.RandomContrast(0.2),
        tf.keras.layers.RandomBrightness(0.1),
        tf.keras.layers.RandomTranslation(0.1, 0.1),
    ])

    # 正規化
    normalization_layer = tf.keras.layers.Rescaling(1./255)

    # 優化資料 pipeline
    AUTOTUNE = tf.data.AUTOTUNE
    train_ds = train_ds.map(lambda x, y: (data_augmentation(x), y),
                            num_parallel_calls=AUTOTUNE)
    train_ds = train_ds.map(lambda x, y: (normalization_layer(x), y),
                            num_parallel_calls=AUTOTUNE)
    train_ds = train_ds.prefetch(buffer_size=AUTOTUNE)

    val_ds = val_ds.map(lambda x, y: (normalization_layer(x), y),
                        num_parallel_calls=AUTOTUNE)
    val_ds = val_ds.prefetch(buffer_size=AUTOTUNE)

    # === 建立模型 (MobileNetV2 Transfer Learning) ===
    print("\n建立 MobileNetV2 模型...")

    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        include_top=False,
        weights='imagenet'
    )
    base_model.trainable = False  # 凍結 base model

    model = tf.keras.Sequential([
        base_model,
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(len(labels), activation='softmax')
    ])

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=args.learning_rate),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )

    model.summary()

    # === 計算 Class Weight（處理資料不平衡）===
    print("\n計算 Class Weight（平衡資料不平衡）...")

    # 收集所有訓練資料的標籤
    train_label_indices = []
    for _, label_batch in train_ds:
        train_label_indices.extend(np.argmax(label_batch.numpy(), axis=1).tolist())

    train_label_indices = np.array(train_label_indices)
    class_weights = class_weight.compute_class_weight(
        class_weight='balanced',
        classes=np.unique(train_label_indices),
        y=train_label_indices
    )
    class_weight_dict = dict(enumerate(class_weights))
    print(f"Class Weights: {class_weight_dict}")

    # === 訓練 ===
    print(f"\n開始訓練 ({args.epochs} epochs)...")
    start_time = datetime.now()

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        class_weight=class_weight_dict,
        verbose=1
    )

    train_time = (datetime.now() - start_time).total_seconds()
    print(f"\n訓練完成! 耗時: {train_time:.1f} 秒")

    # 顯示最終準確率
    final_acc = history.history['val_accuracy'][-1]
    print(f"驗證準確率: {final_acc:.2%}")

    # === 轉換為 TFLite ===
    print("\n轉換為 TFLite 模型...")

    # 先存 Keras 模型
    keras_path = os.path.join(args.output_dir, f'{args.project_name}.keras')
    model.save(keras_path)
    print(f"Keras 模型已儲存: {keras_path}")

    # 轉換為 TFLite (量化 int8)
    converter = tf.lite.TFLiteConverter.from_keras_model(model)

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
        tflite_path = os.path.join(args.output_dir, f'{args.project_name}.tflite')
        with open(tflite_path, 'wb') as f:
            f.write(tflite_model)
        size_kb = len(tflite_model) / 1024
        print(f"TFLite 模型已儲存: {tflite_path} ({size_kb:.1f} KB)")

        # 同時也存非量化版本 (float32) 以備用
        converter2 = tf.lite.TFLiteConverter.from_keras_model(model)
        tflite_f32_path = os.path.join(args.output_dir, f'{args.project_name}_f32.tflite')
        tflite_f32 = converter2.convert()
        with open(tflite_f32_path, 'wb') as f:
            f.write(tflite_f32)
        size_f32_kb = len(tflite_f32) / 1024
        print(f"TFLite Float32 模型已儲存: {tflite_f32_path} ({size_f32_kb:.1f} KB)")

    except Exception as e:
        print(f"量化轉換失敗: {e}")
        print("改為儲存 Float32 版本...")
        converter2 = tf.lite.TFLiteConverter.from_keras_model(model)
        tflite_f32_path = os.path.join(args.output_dir, f'{args.project_name}.tflite')
        tflite_f32 = converter2.convert()
        with open(tflite_f32_path, 'wb') as f:
            f.write(tflite_f32)
        size_kb = len(tflite_f32) / 1024
        print(f"TFLite Float32 模型已儲存: {tflite_f32_path} ({size_kb:.1f} KB)")

    # === 儲存 labels.txt 到 output_dir ===
    labels_path = os.path.join(args.output_dir, f'{args.project_name}_labels.txt')
    with open(labels_path, 'w') as f:
        for label in labels:
            f.write(f"{label}\n")
    print(f"Labels 已儲存: {labels_path}")

    # === 繪製訓練曲線圖 ===
    print("\n繪製訓練曲線圖...")
    curve_path = None
    history_path = None
    report_path = None
    try:
        import matplotlib
        matplotlib.use('Agg')  # 無 GUI 後端
        import matplotlib.pyplot as plt
        import base64
        from io import BytesIO

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)

        epochs = range(1, args.epochs + 1)

        # 上圖：Loss
        ax1.plot(epochs, history.history['loss'], 'b-', label='Training Loss', linewidth=2)
        ax1.plot(epochs, history.history['val_loss'], 'r-', label='Validation Loss', linewidth=2)
        ax1.set_ylabel('Loss', fontsize=12)
        ax1.set_title(f'{args.project_name} - Training Curves', fontsize=14, fontweight='bold')
        ax1.legend(loc='best')
        ax1.grid(True, alpha=0.3)

        # 下圖：Accuracy
        ax2.plot(epochs, history.history['accuracy'], 'b-', label='Training Accuracy', linewidth=2)
        ax2.plot(epochs, history.history['val_accuracy'], 'r-', label='Validation Accuracy', linewidth=2)
        ax2.set_xlabel('Epoch', fontsize=12)
        ax2.set_ylabel('Accuracy', fontsize=12)
        ax2.legend(loc='best')
        ax2.grid(True, alpha=0.3)

        plt.tight_layout()

        # 儲存 PNG
        curve_path = os.path.join(args.output_dir, f'{args.project_name}_training_curve.png')
        plt.savefig(curve_path, dpi=150, bbox_inches='tight')
        print(f"曲線圖已儲存: {curve_path}")

        # 將 PNG 轉為 base64 供 HTML 內嵌
        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
        buf.seek(0)
        curve_b64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close()

        # 儲存訓練歷史 JSON
        history_path = os.path.join(args.output_dir, f'{args.project_name}_training_history.json')
        history_data = {
            'projectName': args.project_name,
            'epochs': args.epochs,
            'batchSize': args.batch_size,
            'learningRate': args.learning_rate,
            'finalAccuracy': float(final_acc),
            'trainTime': train_time,
            'history': {
                'loss': [float(x) for x in history.history['loss']],
                'val_loss': [float(x) for x in history.history['val_loss']],
                'accuracy': [float(x) for x in history.history['accuracy']],
                'val_accuracy': [float(x) for x in history.history['val_accuracy']]
            }
        }
        with open(history_path, 'w') as f:
            json.dump(history_data, f, indent=2)
        print(f"訓練歷史已儲存: {history_path}")

        # === 產出 HTML 訓練報告（內嵌圖表，可直接開啟）===
        report_path = os.path.join(args.output_dir, f'{args.project_name}_training_report.html')
        accuracy_pct = float(final_acc) * 100
        train_time_str = f"{train_time:.1f}s" if train_time < 60 else f"{train_time/60:.1f}m"
        history_json_str = json.dumps(history_data, indent=2)

        html_content = f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{args.project_name} - 訓練報告</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }}
  .container {{ max-width: 900px; margin: 0 auto; }}
  h1 {{ font-size: 24px; margin-bottom: 8px; color: #1a1a1a; }}
  .subtitle {{ color: #666; font-size: 14px; margin-bottom: 24px; }}
  .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }}
  .stat-card {{ background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
  .stat-card .label {{ font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }}
  .stat-card .value {{ font-size: 22px; font-weight: 700; margin-top: 4px; color: #1a1a1a; }}
  .stat-card .value.accuracy {{ color: #2e7d32; }}
  .chart {{ background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }}
  .chart img {{ width: 100%; height: auto; display: block; }}
  .history-section {{ background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
  .history-section summary {{ cursor: pointer; font-weight: 600; font-size: 14px; color: #555; padding: 4px 0; }}
  .history-section pre {{ margin-top: 12px; font-size: 11px; line-height: 1.5; overflow-x: auto; background: #f8f8f8; padding: 12px; border-radius: 4px; max-height: 400px; }}
  .footer {{ text-align: center; margin-top: 24px; font-size: 12px; color: #aaa; }}
</style>
</head>
<body>
<div class="container">
  <h1>{args.project_name}</h1>
  <p class="subtitle">訓練完成時間: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">驗證準確率</div>
      <div class="value accuracy">{accuracy_pct:.2f}%</div>
    </div>
    <div class="stat-card">
      <div class="label">訓練輪數</div>
      <div class="value">{args.epochs}</div>
    </div>
    <div class="stat-card">
      <div class="label">批次大小</div>
      <div class="value">{args.batch_size}</div>
    </div>
    <div class="stat-card">
      <div class="label">學習率</div>
      <div class="value">{args.learning_rate}</div>
    </div>
    <div class="stat-card">
      <div class="label">訓練耗時</div>
      <div class="value">{train_time_str}</div>
    </div>
    <div class="stat-card">
      <div class="label">分類數</div>
      <div class="value">{len(labels)}</div>
    </div>
  </div>

  <div class="chart">
    <img src="data:image/png;base64,{curve_b64}" alt="Training Curves">
  </div>

  <div class="history-section">
    <details>
      <summary>📊 查看完整訓練歷史 (JSON)</summary>
      <pre>{history_json_str}</pre>
    </details>
  </div>

  <div class="footer">Generated by Cocoya AI Training</div>
</div>
</body>
</html>'''

        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"訓練報告已儲存: {report_path}")

    except ImportError:
        print("警告: matplotlib 未安裝，跳過曲線圖繪製")
        print("  安裝方式: pip install matplotlib")
    except Exception as e:
        print(f"警告: 繪圖失敗 ({e})，但不影響模型產出")

    print("\n✅ 訓練完成！產出檔案:")
    for f in os.listdir(args.output_dir):
        fpath = os.path.join(args.output_dir, f)
        size = os.path.getsize(fpath)
        print(f"  {fpath} ({size/1024:.1f} KB)")

    # 回傳結果（JSON 格式）
    result = {
        'success': True,
        'projectName': args.project_name,
        'modelDir': args.output_dir,
        'epochs': args.epochs,
        'batchSize': args.batch_size,
        'learningRate': args.learning_rate,
        'accuracy': final_acc,
        'curvePath': curve_path,
        'historyPath': history_path,
        'reportPath': report_path
    }

    print(f"\nRESULT: {json.dumps(result)}")

if __name__ == '__main__':
    main()