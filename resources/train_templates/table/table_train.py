"""
表格訓練腳本
使用 common/* 共同模組，讀取 data.csv 表格資料集，
依 label 型別自動選擇分類（softmax）或回歸（linear）任務，產出 TFLite 模型。
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
os.environ['TF_DETERMINISTIC_OPS'] = '1'
os.environ['TF_CUDNN_DETERMINISTIC'] = '1'

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

# 匯入共同模組（路徑可能帶 \\?\ 前綴，先 abspath + 剝前綴 + normpath）
_script_dir = os.path.abspath(os.path.dirname(__file__))
if _script_dir.startswith('\\\\?\\'):
    _script_dir = _script_dir[4:]
sys.path.insert(0, os.path.normpath(os.path.join(_script_dir, '..')))
from common.table_dataset import load_table_dataset
from common.training_loop import get_optimizer
from common.model_export import save_keras_model, export_tflite, save_labels


def build_table_model(num_features, task, num_classes, dropout_rate=0.2, dnn_layers=None):
    """
    建立表格 MLP 模型。

    分類：Dense(num_classes, softmax)；回歸：Dense(1, linear)。
    輸入為標準化（z-score）後的特徵向量。
    """
    layers = [tf.keras.layers.Input(shape=(num_features,))]

    neurons = [64, 32]
    if dnn_layers:
        try:
            parsed = [int(x.strip()) for x in dnn_layers.split(',') if x.strip()]
            if parsed:
                neurons = parsed
        except ValueError:
            print(f"警告: DNN_LAYERS 格式錯誤 '{dnn_layers}'，使用預設")

    for i, n in enumerate(neurons):
        layers.append(tf.keras.layers.Dense(n, activation='relu', name=f'fc_{i+1}'))
        layers.append(tf.keras.layers.Dropout(dropout_rate, name=f'dropout_{i+1}'))

    if task == 'classification':
        layers.append(tf.keras.layers.Dense(num_classes, activation='softmax', name='output'))
    else:
        layers.append(tf.keras.layers.Dense(1, activation='linear', name='output'))

    return tf.keras.Sequential(layers)


def compile_and_train_table(model, train_ds, val_ds, task, optimizer_name='adam',
                            learning_rate=0.001, epochs=30):
    """編譯並訓練表格模型。分類用 categorical_crossentropy + accuracy；回歸用 mse + mae。"""
    from datetime import datetime

    optimizer = get_optimizer(optimizer_name, learning_rate)
    if task == 'classification':
        model.compile(optimizer=optimizer, loss='categorical_crossentropy',
                      metrics=['accuracy'])
    else:
        model.compile(optimizer=optimizer, loss='mse', metrics=['mae'])

    model.summary()

    print(f"\n開始訓練 ({epochs} epochs)...")
    start_time = datetime.now()

    fit_kwargs = {'epochs': epochs, 'verbose': 1}
    if val_ds is not None:
        fit_kwargs['validation_data'] = val_ds

    history = model.fit(train_ds, **fit_kwargs)

    train_time = (datetime.now() - start_time).total_seconds()
    print(f"\n訓練完成! 耗時: {train_time:.1f} 秒")

    if val_ds is not None:
        final_loss = history.history['val_loss'][-1]
        if task == 'classification':
            print(f"驗證準確率: {history.history['val_accuracy'][-1]:.2%}")
        else:
            print(f"驗證 Loss (MSE): {final_loss:.6f}")
    else:
        final_loss = history.history['loss'][-1]
        if task == 'classification':
            print(f"訓練準確率: {history.history['accuracy'][-1]:.2%}")
        else:
            print(f"訓練 Loss (MSE): {final_loss:.6f}")

    return history, train_time


def plot_table_curves(history, output_path, project_name, epochs, task):
    """繪製訓練曲線圖（Loss + Accuracy/MAE），回傳 base64。"""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import base64
        from io import BytesIO

        metric = 'accuracy' if task == 'classification' else 'mae'
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)

        epoch_range = range(1, epochs + 1)

        ax1.plot(epoch_range, history.history['loss'], 'b-', label='Training Loss', linewidth=2)
        if 'val_loss' in history.history:
            ax1.plot(epoch_range, history.history['val_loss'], 'r-',
                     label='Validation Loss', linewidth=2)
        ax1.set_ylabel('Loss', fontsize=12)
        ax1.set_title(f'{project_name} - Table Training Curves', fontsize=14, fontweight='bold')
        ax1.legend(loc='best')
        ax1.grid(True, alpha=0.3)

        ax2.plot(epoch_range, history.history[metric], 'b-',
                 label=f'Training {metric}', linewidth=2)
        if f'val_{metric}' in history.history:
            ax2.plot(epoch_range, history.history[f'val_{metric}'], 'r-',
                     label=f'Validation {metric}', linewidth=2)
        ax2.set_xlabel('Epoch', fontsize=12)
        ax2.set_ylabel(metric, fontsize=12)
        ax2.legend(loc='best')
        ax2.grid(True, alpha=0.3)

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


def save_table_history(history, output_path, project_name, epochs, batch_size,
                       learning_rate, final_loss, train_time, task, meta):
    """儲存訓練歷史 JSON（含 feature 統計與 label_map，供推論端前處理參考）。"""
    metric = 'accuracy' if task == 'classification' else 'mae'
    history_data = {
        'projectName': project_name,
        'taskType': 'table',
        'tableTask': task,
        'epochs': epochs,
        'batchSize': batch_size,
        'learningRate': learning_rate,
        'finalLoss': float(final_loss),
        'trainTime': train_time,
        'labels': meta.get('labels'),
        'labelMap': meta.get('label_map', {}),
        'featureNames': meta.get('feature_names', []),
        'featureStats': meta.get('feature_stats', []),
        'history': {
            'loss': [float(x) for x in history.history['loss']],
            'val_loss': [float(x) for x in history.history.get('val_loss', [])],
            metric: [float(x) for x in history.history[metric]],
            f'val_{metric}': [float(x) for x in history.history.get(f'val_{metric}', [])]
        }
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(history_data, f, indent=2, ensure_ascii=False)
    print(f"訓練歷史已儲存: {output_path}")

    return history_data


def generate_table_report(history_data, curve_b64, output_path, project_name, task):
    """產生表格訓練 HTML 報告。"""
    from datetime import datetime

    final_loss = float(history_data['finalLoss'])
    metric = 'accuracy' if task == 'classification' else 'mae'
    metric_values = history_data['history'].get(metric, [])
    final_metric = metric_values[-1] if metric_values else 0.0
    train_time = history_data['trainTime']
    train_time_str = f"{train_time:.1f}s" if train_time < 60 else f"{train_time/60:.1f}m"
    history_json_str = json.dumps(history_data, indent=2, ensure_ascii=False)
    task_name = '分類 (softmax, 分層抽樣)' if task == 'classification' else '回歸 (linear, 隨機切分)'

    chart_section = ''
    if curve_b64:
        chart_section = f'''
  <div class="chart">
    <img src="data:image/png;base64,{curve_b64}" alt="Training Curves">
  </div>'''

    metric_label = '最終準確率' if task == 'classification' else '最終 MAE'
    metric_fmt = f'{final_metric:.2%}' if task == 'classification' else f'{final_metric:.6f}'

    html_content = f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{project_name} - 表格訓練報告</title>
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
  <p class="subtitle">表格訓練（{task_name}）完成時間: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">最終 Loss</div>
      <div class="value loss">{final_loss:.6f}</div>
    </div>
    <div class="stat-card">
      <div class="label">{metric_label}</div>
      <div class="value">{metric_fmt}</div>
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
  </div>

  {chart_section}

  <div class="history-section">
    <details>
      <summary>📊 查看完整訓練歷史 (JSON)</summary>
      <pre>{history_json_str}</pre>
    </details>
  </div>

  <div class="footer">Generated by Cocoya AI Training (Table)</div>
</div>
</body>
</html>'''

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"訓練報告已儲存: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='表格訓練腳本')
    parser.add_argument('--dataset_dir', required=True, help='資料集目錄路徑 (含 data.csv / schema.json)')
    parser.add_argument('--output_dir', required=True, help='模型輸出目錄')
    parser.add_argument('--epochs', type=int, default=30, help='訓練輪數')
    parser.add_argument('--batch_size', type=int, default=32, help='批次大小')
    parser.add_argument('--learning_rate', type=float, default=0.001, help='學習率')
    parser.add_argument('--project_name', default='training_project', help='專案名稱')

    # === 相容共同參數（皆有預設值；表格任務不使用 augmentation/backbone/fine_tune）===
    parser.add_argument('--validation_split', type=float, default=0.2,
                        help='驗證集比例 (0.0~1.0，0 表示不使用驗證集)')
    parser.add_argument('--dropout', type=float, default=0.2, help='Dropout 比率 (0.0~0.9)')
    parser.add_argument('--augmentation', type=str, default='false', help='(表格任務不使用)')
    parser.add_argument('--backbone', type=str, default='mobilenetv2', help='(表格任務不使用)')
    parser.add_argument('--optimizer', type=str, default='adam',
                        choices=['adam', 'sgd', 'rmsprop'], help='優化器')
    parser.add_argument('--dnn_layers', type=str, default='',
                        help='自訂全連接層（逗號分隔神經元數，如 "128,64"）')
    parser.add_argument('--fine_tune', type=str, default='false', help='(表格任務不使用)')
    parser.add_argument('--model_output', type=str, default='none',
                        choices=['none', 'int8', 'f32', 'keras', 'int8+f32', 'all'],
                        help='模型輸出格式')

    args = parser.parse_args()
    model_output = args.model_output

    os.makedirs(args.output_dir, exist_ok=True)

    print("=== 開始表格訓練 ===")
    print(f"專案名稱: {args.project_name}")
    print(f"資料集: {args.dataset_dir}")
    print(f"輸出目錄: {args.output_dir}")
    print(f"訓練參數:")
    print(f"  - Epochs: {args.epochs}")
    print(f"  - Batch Size: {args.batch_size}")
    print(f"  - Learning Rate: {args.learning_rate}")
    print(f"  - Validation Split: {args.validation_split}")
    print(f"  - Dropout: {args.dropout}")
    print(f"  - Optimizer: {args.optimizer}")
    print(f"  - DNN Layers: {args.dnn_layers or '(預設 64,32)'}")
    print()

    # === 載入資料集 ===
    print("\n載入表格資料集...")
    train_ds, val_ds, meta = load_table_dataset(
        args.dataset_dir,
        batch_size=args.batch_size,
        validation_split=args.validation_split
    )
    task = meta['task']
    num_features = len(meta['feature_names'])
    num_classes = meta['num_classes']

    # === 建立模型 ===
    print(f"\n建立表格模型 (任務: {task}, 特徵數: {num_features})...")
    model = build_table_model(
        num_features=num_features,
        task=task,
        num_classes=num_classes,
        dropout_rate=args.dropout,
        dnn_layers=args.dnn_layers if args.dnn_layers else None
    )

    # === 訓練 ===
    history, train_time = compile_and_train_table(
        model,
        train_ds,
        val_ds,
        task,
        optimizer_name=args.optimizer,
        learning_rate=args.learning_rate,
        epochs=args.epochs
    )

    if val_ds is not None:
        final_loss = history.history['val_loss'][-1]
        final_metric = history.history['val_accuracy' if task == 'classification' else 'val_mae'][-1]
    else:
        final_loss = history.history['loss'][-1]
        final_metric = history.history['accuracy' if task == 'classification' else 'mae'][-1]

    # === 模型產出 ===
    if model_output != 'none':
        print(f"\n產出模型（格式: {model_output}）...")

        if model_output in ('keras', 'all'):
            keras_path = os.path.join(args.output_dir, f'{args.project_name}.keras')
            save_keras_model(model, keras_path)

        if model_output in ('int8', 'int8+f32', 'all'):
            tflite_path = os.path.join(args.output_dir, f'{args.project_name}.tflite')
            export_tflite(model, train_ds, tflite_path, quantize=True)

        if model_output in ('f32', 'int8+f32', 'all'):
            tflite_f32_path = os.path.join(args.output_dir, f'{args.project_name}_f32.tflite')
            export_tflite(model, train_ds, tflite_f32_path, quantize=False)

        # 分類任務永遠產出 labels.txt（推論端反查類別名稱）
        if task == 'classification' and meta.get('labels'):
            labels_path = os.path.join(args.output_dir, f'{args.project_name}_labels.txt')
            save_labels(meta['labels'], labels_path)
    else:
        print("\n[跳過] 模型輸出設為「無」，僅輸出訓練結果")

    # === 繪製訓練曲線圖與產出報告 ===
    print("\n繪製訓練曲線圖...")
    curve_path = None
    history_path = None
    report_path = None

    curve_png_path = os.path.join(args.output_dir, f'{args.project_name}_training_curve.png')
    curve_b64 = plot_table_curves(history, curve_png_path, args.project_name, args.epochs, task)
    if curve_b64:
        curve_path = curve_png_path

    history_path = os.path.join(args.output_dir, f'{args.project_name}_training_history.json')
    history_data = save_table_history(
        history, history_path, args.project_name,
        args.epochs, args.batch_size, args.learning_rate,
        final_loss, train_time, task, meta
    )

    report_path = os.path.join(args.output_dir, f'{args.project_name}_training_report.html')
    generate_table_report(history_data, curve_b64, report_path, args.project_name, task)

    # === 列出產出檔案 ===
    print("\n✅ 訓練完成！產出檔案:")
    for f in os.listdir(args.output_dir):
        fpath = os.path.join(args.output_dir, f)
        size = os.path.getsize(fpath)
        print(f"  {fpath} ({size/1024:.1f} KB)")

    # 回傳結果（JSON 格式，與 classifier/detector 的 RESULT 契約相容）
    result = {
        'success': True,
        'projectName': args.project_name,
        'taskType': 'table',
        'tableTask': task,
        'modelDir': args.output_dir,
        'epochs': args.epochs,
        'batchSize': args.batch_size,
        'learningRate': args.learning_rate,
        # 分類：accuracy 欄位傳準確率；回歸：比照 detector 以 accuracy 欄位傳 loss 值
        'accuracy': final_metric if task == 'classification' else final_loss,
        'finalLoss': final_loss,
        'curvePath': curve_path,
        'historyPath': history_path,
        'reportPath': report_path
    }

    print(f"\nRESULT: {json.dumps(result)}")


if __name__ == '__main__':
    main()
