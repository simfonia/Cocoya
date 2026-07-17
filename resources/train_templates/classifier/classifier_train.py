"""
通用圖像分類訓練腳本 (重構版)
使用 common/* 共同模組，支援更多訓練參數
基於 MobileNetV2 轉移學習，產出 TFLite 模型
"""

import argparse
import os
import sys
import json

# === 依賴檢查 ===
try:
    import tensorflow as tf
except ImportError:
    print("錯誤: 請先安裝 tensorflow")
    print("  pip install tensorflow")
    sys.exit(1)

# 匯入共同模組
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from common.dataset import load_image_dataset, create_data_augmentation, prepare_dataset
from common.model import build_image_model
from common.training import compute_class_weights, compile_and_train
from common.export import save_keras_model, export_tflite, save_labels
from common.report import save_training_history, plot_training_curves, generate_html_report


def main():
    parser = argparse.ArgumentParser(description='通用圖像分類訓練腳本')
    parser.add_argument('--dataset_dir', required=True, help='資料集目錄路徑')
    parser.add_argument('--output_dir', required=True, help='模型輸出目錄（包含 labels.txt）')
    parser.add_argument('--epochs', type=int, default=30, help='訓練輪數')
    parser.add_argument('--batch_size', type=int, default=32, help='批次大小')
    parser.add_argument('--learning_rate', type=float, default=0.001, help='學習率')
    parser.add_argument('--project_name', default='training_project', help='專案名稱')

    # === 新增參數（皆有預設值，保持向後相容）===
    parser.add_argument('--validation_split', type=float, default=0.2,
                        help='驗證集比例 (0.0~1.0，0 表示不使用驗證集)')
    parser.add_argument('--dropout', type=float, default=0.2,
                        help='Dropout 比率 (0.0~0.9)')
    parser.add_argument('--augmentation', type=str, default='true',
                        choices=['true', 'false'],
                        help='是否啟用資料擴增')
    parser.add_argument('--backbone', type=str, default='mobilenetv2',
                        choices=['mobilenetv2', 'efficientnet', 'resnet'],
                        help='骨幹網路')
    parser.add_argument('--optimizer', type=str, default='adam',
                        choices=['adam', 'sgd', 'rmsprop'],
                        help='優化器')
    parser.add_argument('--dnn_layers', type=str, default='',
                        help='自訂全連接層（逗號分隔神經元數，如 "128,64"）')
    parser.add_argument('--fine_tune', type=str, default='false',
                        choices=['true', 'false'],
                        help='是否解凍 backbone 進行微調')

    args = parser.parse_args()

    # 轉換字串參數為布林值
    augmentation_enabled = args.augmentation.lower() == 'true'
    fine_tune_enabled = args.fine_tune.lower() == 'true'

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
    print(f"  - Validation Split: {args.validation_split}")
    print(f"  - Dropout: {args.dropout}")
    print(f"  - Augmentation: {augmentation_enabled}")
    print(f"  - Backbone: {args.backbone}")
    print(f"  - Optimizer: {args.optimizer}")
    print(f"  - DNN Layers: {args.dnn_layers or '(預設)'}")
    print(f"  - Fine-tune: {fine_tune_enabled}")
    print()

    # IMG_SIZE 固定為 224（與 MobileNetV2 imagenet 權重綁定）
    IMG_SIZE = 224

    # === 載入資料集 ===
    print("\n載入資料集...")
    train_ds, val_ds, labels, class_counts = load_image_dataset(
        args.dataset_dir,
        img_size=IMG_SIZE,
        batch_size=args.batch_size,
        validation_split=args.validation_split
    )

    # === 資料擴增與正規化 ===
    print("\n準備資料 pipeline...")
    data_augmentation = create_data_augmentation(enabled=augmentation_enabled)

    train_ds = prepare_dataset(
        train_ds,
        augmentation=data_augmentation,
        augment_enabled=augmentation_enabled
    )

    if val_ds is not None:
        val_ds = prepare_dataset(val_ds, augment_enabled=False)

    # === 建立模型 ===
    print(f"\n建立模型 (Backbone: {args.backbone})...")
    model = build_image_model(
        num_classes=len(labels),
        backbone_name=args.backbone,
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        dropout_rate=args.dropout,
        dnn_layers=args.dnn_layers if args.dnn_layers else None,
        fine_tune=fine_tune_enabled
    )

    # === 計算 Class Weight ===
    class_weight_dict = compute_class_weights(train_ds, len(labels))

    # === 訓練 ===
    history, train_time = compile_and_train(
        model,
        train_ds,
        val_ds,
        optimizer_name=args.optimizer,
        learning_rate=args.learning_rate,
        epochs=args.epochs,
        class_weight_dict=class_weight_dict
    )

    # 取得最終準確率
    if val_ds is not None:
        final_acc = history.history['val_accuracy'][-1]
    else:
        final_acc = history.history['accuracy'][-1]

    # === 轉換為 TFLite ===
    print("\n轉換為 TFLite 模型...")

    # 先存 Keras 模型
    keras_path = os.path.join(args.output_dir, f'{args.project_name}.keras')
    save_keras_model(model, keras_path)

    # 轉換 TFLite（量化）
    tflite_path = os.path.join(args.output_dir, f'{args.project_name}.tflite')
    success, size_kb, warn = export_tflite(model, train_ds, tflite_path, quantize=True)

    # 同時也存非量化版本 (float32) 以備用
    tflite_f32_path = os.path.join(args.output_dir, f'{args.project_name}_f32.tflite')
    export_tflite(model, train_ds, tflite_f32_path, quantize=False)

    # === 儲存 labels.txt ===
    labels_path = os.path.join(args.output_dir, f'{args.project_name}_labels.txt')
    save_labels(labels, labels_path)

    # === 繪製訓練曲線圖與產出報告 ===
    print("\n繪製訓練曲線圖...")
    curve_path = None
    history_path = None
    report_path = None

    curve_png_path = os.path.join(args.output_dir, f'{args.project_name}_training_curve.png')
    curve_b64 = plot_training_curves(history, curve_png_path, args.project_name, args.epochs)
    if curve_b64:
        curve_path = curve_png_path

    # 儲存訓練歷史 JSON
    history_path = os.path.join(args.output_dir, f'{args.project_name}_training_history.json')
    history_data = save_training_history(
        history, history_path, args.project_name,
        args.epochs, args.batch_size, args.learning_rate,
        final_acc, train_time
    )

    # 產出 HTML 報告
    report_path = os.path.join(args.output_dir, f'{args.project_name}_training_report.html')
    generate_html_report(history_data, curve_b64, report_path, labels, args.project_name)

    # === 列出產出檔案 ===
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