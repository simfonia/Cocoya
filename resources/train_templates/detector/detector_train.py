"""
物件偵測訓練腳本 (單一目標)
使用 common/* 共同模組，基於 MobileNetV2 轉移學習 + 回歸頭
讀取 YOLO 格式資料集，產出 TFLite 模型
"""

import argparse
import os
import sys
import json

# === 輸出編碼修復：Windows 管線下預設 cp950，強制 UTF-8 避免終端機亂碼 ===
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# === 確定性運算控制（確保 VSIX 與 Tauri 環境訓練結果一致）===
# 必須在 import tensorflow 之前設定環境變數
os.environ['TF_DETERMINISTIC_OPS'] = '1'
os.environ['TF_CUDNN_DETERMINISTIC'] = '1'

# === 依賴檢查 ===
try:
    import tensorflow as tf
except ImportError:
    print("錯誤: 請先安裝 tensorflow")
    print("  pip install tensorflow")
    sys.exit(1)

import numpy as np

# 設定全域隨機種子，確保跨環境再現性
tf.random.set_seed(42)
np.random.seed(42)

# 匯入共同模組
# 修復：Rust 傳入的路徑可能帶 \\?\ 前綴（BaseDirectory::Resource canonicalize），
# 且 '..' 未正規化會使 import common 失敗 → 先 abspath + 剝前綴 + normpath
_script_dir = os.path.abspath(os.path.dirname(__file__))
if _script_dir.startswith('\\\\?\\'):
    _script_dir = _script_dir[4:]
sys.path.insert(0, os.path.normpath(os.path.join(_script_dir, '..')))
from common.detector_dataset import load_detector_dataset, create_detector_augmentation, prepare_detector_dataset
from common.detector_model import build_detector_model
from common.training_loop import get_optimizer
from common.model_export import save_keras_model, export_tflite, save_labels


def compile_and_train_detector(model, train_ds, val_ds, optimizer_name='adam',
                               learning_rate=0.001, epochs=30):
    """
    編譯並訓練物件偵測回歸模型。

    使用 MSE 損失函數（回歸任務），監控 val_loss 而非 accuracy。

    Args:
        model: tf.keras.Model
        train_ds: 訓練集 Dataset
        val_ds: 驗證集 Dataset（可為 None）
        optimizer_name: 優化器名稱
        learning_rate: 學習率
        epochs: 訓練輪數

    Returns:
        (history, train_time_seconds)
    """
    from datetime import datetime

    # 編譯模型（回歸用 MSE loss）
    optimizer = get_optimizer(optimizer_name, learning_rate)
    model.compile(
        optimizer=optimizer,
        loss='mse',
        metrics=['mae']  # Mean Absolute Error 作為輔助指標
    )

    model.summary()

    # 執行訓練
    print(f"\n開始訓練 ({epochs} epochs)...")
    start_time = datetime.now()

    fit_kwargs = {
        'epochs': epochs,
        'verbose': 1,
    }
    if val_ds is not None:
        fit_kwargs['validation_data'] = val_ds

    history = model.fit(train_ds, **fit_kwargs)

    train_time = (datetime.now() - start_time).total_seconds()
    print(f"\n訓練完成! 耗時: {train_time:.1f} 秒")

    # 顯示最終 loss
    if val_ds is not None:
        final_loss = history.history['val_loss'][-1]
        final_mae = history.history['val_mae'][-1]
        print(f"驗證 Loss (MSE): {final_loss:.6f}")
        print(f"驗證 MAE: {final_mae:.6f}")
    else:
        final_loss = history.history['loss'][-1]
        final_mae = history.history['mae'][-1]
        print(f"訓練 Loss (MSE): {final_loss:.6f}")
        print(f"訓練 MAE: {final_mae:.6f}")

    return history, train_time


def plot_detector_curves(history, output_path, project_name, epochs):
    """
    繪製物件偵測訓練曲線圖（Loss + MAE）。

    Args:
        history: tf.keras.callbacks.History 物件
        output_path: PNG 輸出路徑
        project_name: 專案名稱
        epochs: 訓練輪數

    Returns:
        str: base64 編碼的圖片資料（用於 HTML 內嵌），若失敗則回傳 None
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import base64
        from io import BytesIO

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)

        epoch_range = range(1, epochs + 1)

        # 上圖：Loss (MSE)
        ax1.plot(epoch_range, history.history['loss'], 'b-',
                 label='Training Loss (MSE)', linewidth=2)
        if 'val_loss' in history.history:
            ax1.plot(epoch_range, history.history['val_loss'], 'r-',
                     label='Validation Loss (MSE)', linewidth=2)
        ax1.set_ylabel('Loss (MSE)', fontsize=12)
        ax1.set_title(f'{project_name} - Detector Training Curves', fontsize=14, fontweight='bold')
        ax1.legend(loc='best')
        ax1.grid(True, alpha=0.3)

        # 下圖：MAE
        ax2.plot(epoch_range, history.history['mae'], 'b-',
                 label='Training MAE', linewidth=2)
        if 'val_mae' in history.history:
            ax2.plot(epoch_range, history.history['val_mae'], 'r-',
                     label='Validation MAE', linewidth=2)
        ax2.set_xlabel('Epoch', fontsize=12)
        ax2.set_ylabel('MAE', fontsize=12)
        ax2.legend(loc='best')
        ax2.grid(True, alpha=0.3)

        plt.tight_layout()

        # 儲存 PNG
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        print(f"曲線圖已儲存: {output_path}")

        # 轉 base64 供 HTML 內嵌
        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
        buf.seek(0)
        curve_b64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close()

        return curve_b64

    except ImportError:
        print("警告: matplotlib 未安裝，跳過曲線圖繪製")
        print("  安裝方式: pip install matplotlib")
        return None
    except Exception as e:
        print(f"警告: 繪圖失敗 ({e})，但不影響模型產出")
        return None


def save_detector_history(history, output_path, project_name, epochs,
                          batch_size, learning_rate, final_loss, train_time):
    """
    儲存物件偵測訓練歷史為 JSON 檔案。

    Args:
        history: tf.keras.callbacks.History 物件
        output_path: 輸出路徑
        project_name: 專案名稱
        epochs: 訓練輪數
        batch_size: 批次大小
        learning_rate: 學習率
        final_loss: 最終 loss 值
        train_time: 訓練耗時（秒）

    Returns:
        dict: 歷史資料字典
    """
    history_data = {
        'projectName': project_name,
        'taskType': 'detector',
        'epochs': epochs,
        'batchSize': batch_size,
        'learningRate': learning_rate,
        'finalLoss': float(final_loss),
        'trainTime': train_time,
        'history': {
            'loss': [float(x) for x in history.history['loss']],
            'val_loss': [float(x) for x in history.history.get('val_loss', [])],
            'mae': [float(x) for x in history.history['mae']],
            'val_mae': [float(x) for x in history.history.get('val_mae', [])]
        }
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(history_data, f, indent=2)
    print(f"訓練歷史已儲存: {output_path}")

    return history_data


def generate_detector_report(history_data, curve_b64, output_path, labels, project_name):
    """
    產生物件偵測訓練 HTML 報告。

    Args:
        history_data: 訓練歷史資料字典
        curve_b64: base64 編碼的曲線圖（可為 None）
        output_path: HTML 輸出路徑
        labels: 類別標籤列表
        project_name: 專案名稱
    """
    from datetime import datetime

    final_loss = float(history_data['finalLoss'])
    train_time = history_data['trainTime']
    train_time_str = f"{train_time:.1f}s" if train_time < 60 else f"{train_time/60:.1f}m"
    history_json_str = json.dumps(history_data, indent=2)

    # 處理曲線圖嵌入
    chart_section = ''
    if curve_b64:
        chart_section = f'''
  <div class="chart">
    <img src="data:image/png;base64,{curve_b64}" alt="Training Curves">
  </div>'''

    html_content = f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{project_name} - 物件偵測訓練報告</title>
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
  .stat-card .value.loss {{ color: #1565c0; }}
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
  <h1>{project_name}</h1>
  <p class="subtitle">物件偵測訓練完成時間: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">最終 Loss (MSE)</div>
      <div class="value loss">{final_loss:.6f}</div>
    </div>
    <div class="stat-card">
      <div class="label">訓練輪數</div>
      <div class="value">{history_data['epochs']}</div>
    </div>
    <div class="stat-card">
      <div class="label">批次大小</div>
      <div class="value">{history_data['batchSize']}</div>
    </div>
    <div class="stat-card">
      <div class="label">學習率</div>
      <div class="value">{history_data['learningRate']}</div>
    </div>
    <div class="stat-card">
      <div class="label">訓練耗時</div>
      <div class="value">{train_time_str}</div>
    </div>
    <div class="stat-card">
      <div class="label">類別數</div>
      <div class="value">{len(labels)}</div>
    </div>
  </div>

  {chart_section}

  <div class="history-section">
    <details>
      <summary>📊 查看完整訓練歷史 (JSON)</summary>
      <pre>{history_json_str}</pre>
    </details>
  </div>

  <div class="footer">Generated by Cocoya AI Training (Detector)</div>
</div>
</body>
</html>'''

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"訓練報告已儲存: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='物件偵測訓練腳本 (單一目標)')
    parser.add_argument('--dataset_dir', required=True, help='資料集目錄路徑 (含 images/ 和 labels/)')
    parser.add_argument('--output_dir', required=True, help='模型輸出目錄')
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
    parser.add_argument('--model_output', type=str, default='none',
                        choices=['none', 'int8', 'f32', 'keras', 'int8+f32', 'all'],
                        help='模型輸出格式')

    args = parser.parse_args()

    # 轉換字串參數為布林值
    augmentation_enabled = args.augmentation.lower() == 'true'
    fine_tune_enabled = args.fine_tune.lower() == 'true'
    model_output = args.model_output

    # 確保輸出目錄存在
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"=== 開始物件偵測訓練 ===")
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
    print("\n載入 YOLO 格式資料集...")
    train_ds, val_ds, labels, class_counts = load_detector_dataset(
        args.dataset_dir,
        img_size=IMG_SIZE,
        batch_size=args.batch_size,
        validation_split=args.validation_split
    )

    # === 資料擴增 ===
    print("\n準備資料 pipeline...")
    data_augmentation = create_detector_augmentation(enabled=augmentation_enabled)

    train_ds = prepare_detector_dataset(
        train_ds,
        augmentation=data_augmentation,
        augment_enabled=augmentation_enabled
    )

    if val_ds is not None:
        val_ds = prepare_detector_dataset(val_ds, augment_enabled=False)

    # === 建立模型 ===
    print(f"\n建立物件偵測模型 (Backbone: {args.backbone})...")
    model = build_detector_model(
        backbone_name=args.backbone,
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        dropout_rate=args.dropout,
        dnn_layers=args.dnn_layers if args.dnn_layers else None,
        fine_tune=fine_tune_enabled
    )

    # === 訓練 ===
    history, train_time = compile_and_train_detector(
        model,
        train_ds,
        val_ds,
        optimizer_name=args.optimizer,
        learning_rate=args.learning_rate,
        epochs=args.epochs
    )

    # 取得最終 loss
    if val_ds is not None:
        final_loss = history.history['val_loss'][-1]
    else:
        final_loss = history.history['loss'][-1]

    # === 模型產出 ===
    if model_output != 'none':
        print(f"\n產出模型（格式: {model_output}）...")

        # Keras 模型
        if model_output in ('keras', 'all'):
            keras_path = os.path.join(args.output_dir, f'{args.project_name}.keras')
            save_keras_model(model, keras_path)

        # 量化 TFLite (int8)
        if model_output in ('int8', 'int8+f32', 'all'):
            tflite_path = os.path.join(args.output_dir, f'{args.project_name}.tflite')
            export_tflite(model, train_ds, tflite_path, quantize=True)

        # Float32 TFLite
        if model_output in ('f32', 'int8+f32', 'all'):
            tflite_f32_path = os.path.join(args.output_dir, f'{args.project_name}_f32.tflite')
            export_tflite(model, train_ds, tflite_f32_path, quantize=False)

        # 永遠產生 labels.txt
        labels_path = os.path.join(args.output_dir, f'{args.project_name}_labels.txt')
        save_labels(labels, labels_path)
    else:
        print("\n[跳過] 模型輸出設為「無」，僅輸出訓練結果")

    # === 繪製訓練曲線圖與產出報告 ===
    print("\n繪製訓練曲線圖...")
    curve_path = None
    history_path = None
    report_path = None

    curve_png_path = os.path.join(args.output_dir, f'{args.project_name}_training_curve.png')
    curve_b64 = plot_detector_curves(history, curve_png_path, args.project_name, args.epochs)
    if curve_b64:
        curve_path = curve_png_path

    # 儲存訓練歷史 JSON
    history_path = os.path.join(args.output_dir, f'{args.project_name}_training_history.json')
    history_data = save_detector_history(
        history, history_path, args.project_name,
        args.epochs, args.batch_size, args.learning_rate,
        final_loss, train_time
    )

    # 產出 HTML 報告
    report_path = os.path.join(args.output_dir, f'{args.project_name}_training_report.html')
    generate_detector_report(history_data, curve_b64, report_path, labels, args.project_name)

    # === 列出產出檔案 ===
    print("\n✅ 訓練完成！產出檔案:")
    if model_output != 'none':
        for f in os.listdir(args.output_dir):
            fpath = os.path.join(args.output_dir, f)
            size = os.path.getsize(fpath)
            print(f"  {fpath} ({size/1024:.1f} KB)")
    else:
        for f in os.listdir(args.output_dir):
            if f.endswith(('_training_curve.png', '_training_history.json', '_training_report.html')):
                fpath = os.path.join(args.output_dir, f)
                size = os.path.getsize(fpath)
                print(f"  {fpath} ({size/1024:.1f} KB)")
        print("  (模型輸出設為「無」，未產出 Keras/TFLite/labels 檔案)")

    # 回傳結果（JSON 格式）
    # 注意：detector 用 loss 而非 accuracy，但為了與 classifier 的 RESULT 格式相容，
    # 將 loss 轉換為「accuracy 欄位」供前端解析（值越低越好，前端可顯示為 loss）
    result = {
        'success': True,
        'projectName': args.project_name,
        'taskType': 'detector',
        'modelDir': args.output_dir,
        'epochs': args.epochs,
        'batchSize': args.batch_size,
        'learningRate': args.learning_rate,
        'accuracy': final_loss,  # 重用 accuracy 欄位傳遞 loss 值
        'finalLoss': final_loss,
        'curvePath': curve_path,
        'historyPath': history_path,
        'reportPath': report_path
    }

    print(f"\nRESULT: {json.dumps(result)}")


if __name__ == '__main__':
    main()