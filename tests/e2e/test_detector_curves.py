"""e2e：物件偵測訓練曲線圖「Loss / MAE / IoU 三面板」檢查（不跑訓練）。

用途：以假 history 直接呼叫 detector_train.plot_detector_curves，
驗證（1）面板數依 history 欄位動態決定、（2）MAE 面板確實被繪製、
（3）舊 history（無 mae／bbox_iou）不中斷、（4）PNG 實體檔案產出。

執行：
  & "C:\\WPy64-31160\\python-3.11.6.amd64\\python.exe" temp_scripts/e2e_detector_curve_check.py
"""

import base64
import importlib.util
import os
import struct
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGET = os.path.join(REPO, 'resources', 'train_templates', 'object_detection', 'object_detection_train.py')



def check(name, ok, detail=''):
    """[T4-2] 原為累積 FAILS；改為 pytest 斷言。"""
    assert ok, name + ((' -> ' + detail) if detail else '')


def load_target():
    spec = importlib.util.spec_from_file_location('object_detection_train_under_test', TARGET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class FakeHistory:
    def __init__(self, hist):
        self.history = hist


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(33)
    ok_magic = head[:8] == b'\x89PNG\r\n\x1a\n'
    w, h = struct.unpack('>II', head[16:24])
    return ok_magic, w, h


def make_history(kind):
    n = 5
    base = {
        'loss': [0.5 - 0.05 * i for i in range(n)],
        'val_loss': [0.6 - 0.04 * i for i in range(n)],
    }
    if kind in ('full', 'no_iou', 'no_mae'):
        base['mae'] = [0.4 - 0.03 * i for i in range(n)]
        base['val_mae'] = [0.45 - 0.02 * i for i in range(n)]
    if kind in ('full', 'no_mae'):
        base['bbox_iou'] = [0.1 + 0.05 * i for i in range(n)]
        base['val_bbox_iou'] = [0.08 + 0.04 * i for i in range(n)]
    return base


def run_case(mod, plt, kind, expect_rows, expect_labels, out_dir):
    captured = {'rows': None, 'fig': None}
    orig = plt.subplots

    def spy(nrows=1, ncols=1, **kwargs):
        captured['rows'] = nrows
        result = orig(nrows, ncols, **kwargs)
        captured['fig'] = result[0]
        return result

    plt.subplots = spy
    try:
        png = os.path.join(out_dir, f'curve_{kind}.png')
        b64 = mod.plot_detector_curves(FakeHistory(make_history(kind)), png, 'e2e_proj', 5)
    finally:
        plt.subplots = orig

    check(f'[{kind}] 面板數 = {expect_rows}', captured['rows'] == expect_rows,
          f"got {captured['rows']}")
    check(f'[{kind}] base64 回傳非空', bool(b64) and len(b64) > 1000, f'len={len(b64) if b64 else 0}')

    labels = []
    for ax in captured['fig'].get_axes():
        labels.extend([ln.get_label() for ln in ax.get_lines()])
    for want in expect_labels:
        check(f'[{kind}] 曲線標籤含 {want}', want in labels, 'labels=' + ','.join(labels))

    magic, w, h = png_size(png)
    check(f'[{kind}] PNG 檔存在且格式正確', magic and os.path.getsize(png) > 5000,
          f'{w}x{h}px, {os.path.getsize(png)} bytes')

    if b64:
        decoded = base64.b64decode(b64)
        check(f'[{kind}] base64 解碼為 PNG', decoded[:8] == b'\x89PNG\r\n\x1a\n')
    plt.close('all')


def test_detector_curves(tmp_path):
    if not os.path.exists(TARGET):
        print(f'找不到目標檔: {TARGET}')

    mod = load_target()
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    out_dir = tempfile.mkdtemp(prefix='cocoya_det_curve_')
    print(f'輸出目錄: {out_dir}\n')

    run_case(mod, plt, 'full', 3,
             ['Training Loss (MSE)', 'Validation Loss (MSE)',
              'Training MAE', 'Validation MAE',
              'Training IoU', 'Validation IoU'], out_dir)
    # 舊 history：無 IoU 欄 → Loss + MAE 兩面板
    run_case(mod, plt, 'no_iou', 2,
             ['Training Loss (MSE)', 'Training MAE', 'Validation MAE'], out_dir)
    # 舊 history：無 MAE／無 IoU → 僅 Loss（MAE 欄位是 compile metrics 保證存在，
    # 此案例模擬外部匯入的殘缺 history，確認不中斷）
    run_case(mod, plt, 'minimal', 1, ['Training Loss (MSE)'], out_dir)

    print()
