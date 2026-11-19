"""
物件偵測訓練腳本 (單一目標 Spatial Head 架構)
使用 common/* 共同模組，基於 MobileNetV2 雙尺度特徵融合 + Heatmap / Size map 雙輸出頭
讀取 YOLO / DM 落盤資料集，產出 Float32 / Quantized TFLite 模型
"""

import argparse
import os
import sys
import json
from datetime import datetime

# === 輸出編碼修復：Windows 管線下預設 cp950，強制 UTF-8 避免終端機亂碼 ===
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')  # type: ignore[union-attr]

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
_script_dir = os.path.abspath(os.path.dirname(__file__))
if _script_dir.startswith('\\\\?\\'):
    _script_dir = _script_dir[4:]
sys.path.insert(0, os.path.normpath(os.path.join(_script_dir, '..')))
from common.detector_dataset import load_detector_dataset, create_detector_augmentation, prepare_detector_dataset
from common.detector_model import build_detector_model, focal_heatmap_loss, masked_size_loss
from common.training_loop import get_optimizer
from common.model_export import save_keras_model, export_tflite, save_labels


def compute_bbox_iou(box1, box2):
    """
    計算兩個 bbox 的 IoU (cx, cy, w, h 歸一化格式)。
    """
    cx1, cy1, w1, h1 = box1
    cx2, cy2, w2, h2 = box2
    x1_min, x1_max = cx1 - w1 / 2.0, cx1 + w1 / 2.0
    y1_min, y1_max = cy1 - h1 / 2.0, cy1 + h1 / 2.0
    x2_min, x2_max = cx2 - w2 / 2.0, cx2 + w2 / 2.0
    y2_min, y2_max = cy2 - h2 / 2.0, cy2 + h2 / 2.0

    inter_w = max(0.0, min(x1_max, x2_max) - max(x1_min, x2_min))
    inter_h = max(0.0, min(y1_max, y2_max) - max(y1_min, y2_min))
    inter = inter_w * inter_h
    union = w1 * h1 + w2 * h2 - inter
    return inter / (union + 1e-6)


def evaluate_spatial_detector(model, dataset, conf_threshold=0.3):
    """
    解碼 Spatial Head 預測並評估各項偵測指標。

    指標包括：
      - mean_iou: 正樣本平均 IoU
      - iou50_rate: IoU >= 0.5 的正樣本比例
      - fp_rate: 負樣本誤報率（預測 conf >= conf_threshold 的負樣本比例）

    Args:
        model: tf.keras.Model
        dataset: tf.data.Dataset
        conf_threshold: 負樣本信心度門檻

    Returns:
        dict: 指標結果
    """
    positive_ious = []
    iou50_count = 0
    fp_count = 0
    neg_count = 0

    for images, targets in dataset:
        true_hm, true_sz = targets
        true_hm = true_hm.numpy()
        true_sz = true_sz.numpy()

        pred_hm, pred_sz = model.predict(images, verbose=0)

        batch_size = images.shape[0]
        for i in range(batch_size):
            is_pos = np.any(true_sz[i] > 0.0) or (np.max(true_hm[i]) >= 0.5)

            # 解碼預測 bbox (最高信心點)
            p_cy, p_cx = np.unravel_index(np.argmax(pred_hm[i, ..., 0]), (28, 28))
            p_conf = float(pred_hm[i, p_cy, p_cx, 0])
            p_cx_val = (p_cx + 0.5) / 28.0
            p_cy_val = (p_cy + 0.5) / 28.0
            p_w = float(pred_sz[i, p_cy, p_cx, 0])
            p_h = float(pred_sz[i, p_cy, p_cx, 1])

            if is_pos:
                # 解碼真實 bbox
                gt_cy, gt_cx = np.unravel_index(np.argmax(true_hm[i, ..., 0]), (28, 28))
                gt_cx_val = (gt_cx + 0.5) / 28.0
                gt_cy_val = (gt_cy + 0.5) / 28.0
                gt_w = float(true_sz[i, gt_cy, gt_cx, 0])
                gt_h = float(true_sz[i, gt_cy, gt_cx, 1])

                iou = compute_bbox_iou(
                    (gt_cx_val, gt_cy_val, gt_w, gt_h),
                    (p_cx_val, p_cy_val, p_w, p_h)
                )
                positive_ious.append(iou)
                if iou >= 0.5:
                    iou50_count += 1
            else:
                neg_count += 1
                if p_conf >= conf_threshold:
                    fp_count += 1

    mean_iou = float(np.mean(positive_ious)) if positive_ious else 0.0
    iou50_rate = float(iou50_count / len(positive_ious)) if positive_ious else 0.0
    fp_rate = float(fp_count / neg_count) if neg_count > 0 else 0.0

    return {
        'mean_iou': mean_iou,
        'iou50_rate': iou50_rate,
        'fp_rate': fp_rate,
        'num_pos': len(positive_ious),
        'num_neg': neg_count
    }


def compile_and_train_detector(model, train_ds, val_ds, optimizer_name='adam',
                               learning_rate=0.001, epochs=30):
    """
    編譯並訓練 Spatial Head 物件偵測模型。

    使用 Focal Heatmap Loss + Masked L1 Size Loss (權重比 1.0 : 5.0)。
    包含 EarlyStopping 與 ReduceLROnPlateau。

    Args:
        model: tf.keras.Model
        train_ds: 訓練集 Dataset
        val_ds: 驗證集 Dataset（可為 None）
        optimizer_name: 優化器名稱
        learning_rate: 學習率
        epochs: 訓練輪數

    Returns:
        (history, train_time_seconds, eval_metrics)
    """
    optimizer = get_optimizer(optimizer_name, learning_rate)
    model.compile(
        optimizer=optimizer,
        loss={
            'heatmap': focal_heatmap_loss,
            'size_map': masked_size_loss
        },
        loss_weights={
            'heatmap': 1.0,
            'size_map': 5.0
        }
    )

    model.summary()

    print(f"\n開始訓練 ({epochs} epochs)...")
    start_time = datetime.now()

    monitor_metric = 'val_loss' if val_ds is not None else 'loss'
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor=monitor_metric,
            patience=10,
            restore_best_weights=True,
            verbose=1
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor=monitor_metric,
            factor=0.5,
            patience=5,
            min_lr=1e-6,
            verbose=1
        )
    ]

    fit_kwargs = {
        'epochs': epochs,
        'verbose': 1,
        'callbacks': callbacks
    }
    if val_ds is not None:
        fit_kwargs['validation_data'] = val_ds

    history = model.fit(train_ds, **fit_kwargs)

    train_time = (datetime.now() - start_time).total_seconds()
    print(f"\n訓練完成! 耗時: {train_time:.1f} 秒")

    # 執行 Spatial 解碼評估
    eval_target_ds = val_ds if val_ds is not None else train_ds
    eval_label = "驗證集" if val_ds is not None else "訓練集"
    print(f"\n進行 {eval_label} Spatial Head 指標評估...")
    eval_metrics = evaluate_spatial_detector(model, eval_target_ds)

    if val_ds is not None:
        final_loss = history.history['val_loss'][-1]
        final_hm_loss = history.history.get('val_heatmap_loss', [0.0])[-1]
        final_sz_loss = history.history.get('val_size_map_loss', [0.0])[-1]
    else:
        final_loss = history.history['loss'][-1]
        final_hm_loss = history.history.get('heatmap_loss', [0.0])[-1]
        final_sz_loss = history.history.get('size_map_loss', [0.0])[-1]

    print(f"最終 Total Loss: {final_loss:.6f}")
    print(f"  - Heatmap Focal Loss: {final_hm_loss:.6f}")
    print(f"  - Size Masked L1 Loss: {final_sz_loss:.6f}")
    print(f"評估平均 IoU: {eval_metrics['mean_iou']:.4f} ({eval_metrics['mean_iou']*100:.1f}%)")
    print(f"IoU >= 0.5 達成率: {eval_metrics['iou50_rate']*100:.1f}%")
    print(f"負樣本誤報率 (FP Rate): {eval_metrics['fp_rate']*100:.1f}%")

    return history, train_time, eval_metrics


def plot_detector_curves(history, output_path, project_name, epochs):
    """
    繪製物件偵測訓練曲線圖（Total Loss, Heatmap Loss, Size Map Loss）。
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import base64
        from io import BytesIO

        actual_epochs = len(history.history['loss'])
        epoch_range = range(1, actual_epochs + 1)

        panels = ['total_loss']
        if 'heatmap_loss' in history.history:
            panels.append('heatmap_loss')
        if 'size_map_loss' in history.history:
            panels.append('size_map_loss')

        fig, axes = plt.subplots(len(panels), 1, figsize=(10, 3.5 * len(panels)), sharex=True)
        axes = [axes] if len(panels) == 1 else list(axes)

        for ax, panel in zip(axes, panels):
            if panel == 'total_loss':
                ax.plot(epoch_range, history.history['loss'], 'b-', label='Train Total Loss', linewidth=2)
                if 'val_loss' in history.history:
                    ax.plot(epoch_range, history.history['val_loss'], 'r-', label='Val Total Loss', linewidth=2)
                ax.set_ylabel('Total Loss', fontsize=12)
                ax.set_title(f'{project_name} - Training Curves (Spatial Head)', fontsize=14, fontweight='bold')
            elif panel == 'heatmap_loss':
                ax.plot(epoch_range, history.history['heatmap_loss'], 'b-', label='Train Heatmap Loss', linewidth=2)
                if 'val_heatmap_loss' in history.history:
                    ax.plot(epoch_range, history.history['val_heatmap_loss'], 'r-', label='Val Heatmap Loss', linewidth=2)
                ax.set_ylabel('Heatmap Loss', fontsize=12)
            elif panel == 'size_map_loss':
                ax.plot(epoch_range, history.history['size_map_loss'], 'b-', label='Train Size Loss', linewidth=2)
                if 'val_size_map_loss' in history.history:
                    ax.plot(epoch_range, history.history['val_size_map_loss'], 'r-', label='Val Size Loss', linewidth=2)
                ax.set_ylabel('Size Loss', fontsize=12)

            ax.legend(loc='best')
            ax.grid(True, alpha=0.3)

        axes[-1].set_xlabel('Epoch', fontsize=12)
        plt.tight_layout()

        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        print(f"曲線圖已儲存: {output_path}")

        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
        buf.seek(0)
        curve_b64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close()

        return curve_b64

    except ImportError:
        print("警告: matplotlib 未安裝，跳過曲線圖繪製")
        return None
    except Exception as e:
        print(f"警告: 繪圖失敗 ({e})，但不影響模型產出")
        return None


def save_detector_history(history, output_path, project_name, epochs,
                          batch_size, learning_rate, final_loss, eval_metrics, train_time):
    """
    儲存物件偵測訓練歷史為 JSON 檔案。
    """
    history_data = {
        'projectName': project_name,
        'taskType': 'object_detection',
        'architecture': 'spatial_head',
        'epochs': epochs,
        'batchSize': batch_size,
        'learningRate': learning_rate,
        'finalLoss': float(final_loss),
        'finalIoU': float(eval_metrics['mean_iou']),
        'finalIoU50': float(eval_metrics['iou50_rate']),
        'finalFPRate': float(eval_metrics['fp_rate']),
        'trainTime': train_time,
        'history': {
            'loss': [float(x) for x in history.history['loss']],
            'val_loss': [float(x) for x in history.history.get('val_loss', [])],
            'heatmap_loss': [float(x) for x in history.history.get('heatmap_loss', [])],
            'val_heatmap_loss': [float(x) for x in history.history.get('val_heatmap_loss', [])],
            'size_map_loss': [float(x) for x in history.history.get('size_map_loss', [])],
            'val_size_map_loss': [float(x) for x in history.history.get('val_size_map_loss', [])]
        }
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(history_data, f, indent=2)
    print(f"訓練歷史已儲存: {output_path}")

    return history_data


def generate_detector_report(history_data, curve_b64, output_path, labels, project_name):
    """
    產生物件偵測訓練 HTML 報告。
    """
    final_loss = float(history_data['finalLoss'])
    final_iou = history_data.get('finalIoU', 0.0)
    final_iou50 = history_data.get('finalIoU50', 0.0)
    final_fp = history_data.get('finalFPRate', 0.0)
    train_time = history_data['trainTime']
    train_time_str = f"{train_time:.1f}s" if train_time < 60 else f"{train_time/60:.1f}m"
    history_json_str = json.dumps(history_data, indent=2)

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
<title>{project_name} - 物件偵測訓練報告 (Spatial Head)</title>
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
  <h1>{project_name}</h1>
  <p class="subtitle">物件偵測訓練完成時間: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")} (Spatial Head 架構)</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">最終 Total Loss</div>
      <div class="value loss">{final_loss:.6f}</div>
    </div>
    <div class="stat-card">
      <div class="label">評估平均 IoU</div>
      <div class="value accuracy">{final_iou * 100:.1f}%</div>
    </div>
    <div class="stat-card">
      <div class="label">IoU@0.5 達成率</div>
      <div class="value">{final_iou50 * 100:.1f}%</div>
    </div>
    <div class="stat-card">
      <div class="label">負樣本誤報率</div>
      <div class="value">{final_fp * 100:.1f}%</div>
    </div>
    <div class="stat-card">
      <div class="label">訓練輪數</div>
      <div class="value">{history_data['epochs']}</div>
    </div>
    <div class="stat-card">
      <div class="label">訓練耗時</div>
      <div class="value">{train_time_str}</div>
    </div>
  </div>

  {chart_section}

  <div class="history-section">
    <details>
      <summary>📊 查看完整訓練歷史 (JSON)</summary>
      <pre>{history_json_str}</pre>
    </details>
  </div>

  <div class="footer">Generated by Cocoya AI Training (Spatial Head Detector)</div>
</div>
</body>
</html>'''

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"訓練報告已儲存: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='物件偵測訓練腳本 (Spatial Head 架構)')
    parser.add_argument('--dataset_dir', required=True, help='資料集目錄路徑 (含 images/ 和 labels/)')
    parser.add_argument('--output_dir', required=True, help='模型輸出目錄')
    parser.add_argument('--epochs', type=int, default=30, help='訓練輪數')
    parser.add_argument('--batch_size', type=int, default=32, help='批次大小')
    parser.add_argument('--learning_rate', type=float, default=0.001, help='學習率')
    parser.add_argument('--project_name', default='training_project', help='專案名稱')
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
                        help='保留參數介面（向後相容）')
    parser.add_argument('--fine_tune', type=str, default='false',
                        choices=['true', 'false'],
                        help='是否解凍 backbone 進行微調')
    parser.add_argument('--model_output', type=str, default='f32',
                        choices=['none', 'int8', 'f32', 'keras', 'int8+f32', 'all'],
                        help='模型輸出格式')

    args = parser.parse_args()

    augmentation_enabled = args.augmentation.lower() == 'true'
    fine_tune_enabled = args.fine_tune.lower() == 'true'
    model_output = args.model_output

    os.makedirs(args.output_dir, exist_ok=True)

    print(f"=== 開始物件偵測訓練 (Spatial Head 架構) ===")
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
    print(f"  - Fine-tune: {fine_tune_enabled}")
    print(f"  - Output Format: {model_output}")
    print()

    IMG_SIZE = 224

    # === 載入資料集 (Spatial 格式: images -> (heatmaps, sizes)) ===
    print("\n載入偵測資料集（Spatial Head 目標標籤）...")
    train_ds, val_ds, labels, class_counts = load_detector_dataset(
        args.dataset_dir,
        img_size=IMG_SIZE,
        batch_size=args.batch_size,
        validation_split=args.validation_split,
        target_format='spatial'
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
    print(f"\n建立 Spatial Head 物件偵測模型 (Backbone: {args.backbone})...")
    model = build_detector_model(
        backbone_name=args.backbone,
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        dropout_rate=args.dropout,
        fine_tune=fine_tune_enabled
    )

    # === 訓練 ===
    history, train_time, eval_metrics = compile_and_train_detector(
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

        # Float32 TFLite (Spatial Head 預設建議)
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
    curve_png_path = os.path.join(args.output_dir, f'{args.project_name}_training_curve.png')
    curve_b64 = plot_detector_curves(history, curve_png_path, args.project_name, args.epochs)
    if curve_b64:
        curve_path = curve_png_path

    # 儲存訓練歷史 JSON
    history_path = os.path.join(args.output_dir, f'{args.project_name}_training_history.json')
    history_data = save_detector_history(
        history, history_path, args.project_name,
        args.epochs, args.batch_size, args.learning_rate,
        final_loss, eval_metrics, train_time
    )

    # 產出 HTML 報告
    report_path = os.path.join(args.output_dir, f'{args.project_name}_training_report.html')
    generate_detector_report(history_data, curve_b64, report_path, labels, args.project_name)

    # === 列出產出檔案 ===
    print("\n✅ 訓練完成！產出檔案:")
    for f in os.listdir(args.output_dir):
        fpath = os.path.join(args.output_dir, f)
        if os.path.isfile(fpath):
            size = os.path.getsize(fpath)
            print(f"  {fpath} ({size/1024:.1f} KB)")

    # 回傳結果（JSON 格式）
    result = {
        'success': True,
        'projectName': args.project_name,
        'taskType': 'object_detection',
        'modelDir': args.output_dir,
        'epochs': args.epochs,
        'batchSize': args.batch_size,
        'learningRate': args.learning_rate,
        'accuracy': final_loss,
        'finalLoss': float(final_loss),
        'finalIoU': float(eval_metrics['mean_iou']),
        'finalIoU50': float(eval_metrics['iou50_rate']),
        'finalFPRate': float(eval_metrics['fp_rate']),
        'curvePath': curve_path,
        'historyPath': history_path,
        'reportPath': report_path
    }

    print(f"\nRESULT: {json.dumps(result)}")


if __name__ == '__main__':
    main()
