"""
訓練報告共同模組
提供訓練曲線繪製、HTML 訓練報告產生與訓練歷史 JSON 儲存功能。
"""

import os
import json
from datetime import datetime


def save_training_history(history, output_path, project_name, epochs,
                          batch_size, learning_rate, final_acc, train_time):
    """
    儲存訓練歷史為 JSON 檔案。

    Args:
        history: tf.keras.callbacks.History 物件
        output_path: 輸出路徑
        project_name: 專案名稱
        epochs: 訓練輪數
        batch_size: 批次大小
        learning_rate: 學習率
        final_acc: 最終準確率
        train_time: 訓練耗時（秒）

    Returns:
        dict: 歷史資料字典
    """
    history_data = {
        'projectName': project_name,
        'epochs': epochs,
        'batchSize': batch_size,
        'learningRate': learning_rate,
        'finalAccuracy': float(final_acc),
        'trainTime': train_time,
        'history': {
            'loss': [float(x) for x in history.history['loss']],
            'val_loss': [float(x) for x in history.history.get('val_loss', [])],
            'accuracy': [float(x) for x in history.history['accuracy']],
            'val_accuracy': [float(x) for x in history.history.get('val_accuracy', [])]
        }
    }

    with open(output_path, 'w') as f:
        json.dump(history_data, f, indent=2)
    print(f"訓練歷史已儲存: {output_path}")

    return history_data


def plot_training_curves(history, output_path, project_name, epochs):
    """
    繪製訓練曲線圖（Loss + Accuracy）。

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

        # 上圖：Loss
        ax1.plot(epoch_range, history.history['loss'], 'b-',
                 label='Training Loss', linewidth=2)
        if 'val_loss' in history.history:
            ax1.plot(epoch_range, history.history['val_loss'], 'r-',
                     label='Validation Loss', linewidth=2)
        ax1.set_ylabel('Loss', fontsize=12)
        ax1.set_title(f'{project_name} - Training Curves', fontsize=14, fontweight='bold')
        ax1.legend(loc='best')
        ax1.grid(True, alpha=0.3)

        # 下圖：Accuracy
        ax2.plot(epoch_range, history.history['accuracy'], 'b-',
                 label='Training Accuracy', linewidth=2)
        if 'val_accuracy' in history.history:
            ax2.plot(epoch_range, history.history['val_accuracy'], 'r-',
                     label='Validation Accuracy', linewidth=2)
        ax2.set_xlabel('Epoch', fontsize=12)
        ax2.set_ylabel('Accuracy', fontsize=12)
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


def generate_html_report(history_data, curve_b64, output_path, labels, project_name):
    """
    產生 HTML 訓練報告（內嵌圖表，可直接開啟）。

    Args:
        history_data: 訓練歷史資料字典
        curve_b64: base64 編碼的曲線圖（可為 None）
        output_path: HTML 輸出路徑
        labels: 分類標籤列表
        project_name: 專案名稱
    """
    accuracy_pct = float(history_data['finalAccuracy']) * 100
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
<title>{project_name} - 訓練報告</title>
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
  <h1>{project_name}</h1>
  <p class="subtitle">訓練完成時間: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">驗證準確率</div>
      <div class="value accuracy">{accuracy_pct:.2f}%</div>
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
      <div class="label">分類數</div>
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

  <div class="footer">Generated by Cocoya AI Training</div>
</div>
</body>
</html>'''

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"訓練報告已儲存: {output_path}")