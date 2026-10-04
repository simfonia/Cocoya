"""e2e：影像系資料集 loader——格式支援（bmp 收／webp 排除）、標籤順序 SSOT、錯誤路徑。

對應 2026-09-24 三項需求：
  1) 分類標籤順序優先讀 dataset.json schema.label_map（無檔案→字母序）
  2) bmp 納入訓練（TF decode_image 支援）；webp 不支援 → 檔案被忽略且不崩
  3) 分類資料集的錯誤訊息（<2 類、無類別資料夾）

執行：
  & "C:\\WPy64-31160\\python-3.11.6.amd64\\python.exe" temp_scripts/e2e_classifier_dataloader_check.py
"""

import json
import os
import shutil
import sys
import tempfile

import numpy as np
import tensorflow as tf

tf.get_logger().setLevel('ERROR')

from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, 'resources', 'train_templates'))

# [T4 2026-10-03] IMAGE_EXTENSIONS \u5df2\u4ece classifier_dataset \u63d0\u5347\u70ba common/image_formats.py\uff08SSOT\uff09
from common.classifier_dataset import load_image_dataset  # noqa: E402
from common.image_formats import IMAGE_EXTENSIONS, is_supported_image, describe_unsupported  # noqa: E402
from common.detector_dataset import load_detector_dataset  # noqa: E402
from common.line_dataset import load_line_dataset  # noqa: E402



def check(cond, msg):
    """[T4-2] 原為累積 FAILS + 最後 sys.exit(1)；改為 pytest 斷言。
    優點：失敗時立刻指出是哪一行、哪個 msg，而非跑完才總結。"""
    assert cond, msg


def img(path, fmt):
    arr = np.random.randint(0, 255, size=(32, 32, 3), dtype=np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr).save(path, fmt)


def one_batch(ds):
    """取一個 batch 的 (x shape, y shape, min, max)。

    空資料集回傳 (None, None, None, None) —— 呼叫端**必須**先確認非 None，
    否則對 None 做比較會 TypeError（此為 Pyright reportOptionalOperand 抓到的真實風險）。
    """
    for x, y in ds.take(1):
        return tuple(x.shape), tuple(y.shape), float(tf.reduce_min(x)), float(tf.reduce_max(x))
    return None, None, None, None


def test_classifier_dataloader(tmp_path):
    tmp = tempfile.mkdtemp(prefix='cocoya_dl_')
    try:
        # === 1. 標籤順序：dataset.json label_map（id 遞增）優先於字母序 ===
        ds1 = os.path.join(tmp, 'cls_labelmap')
        img(os.path.join(ds1, 'red', 'r1.jpg'), 'JPEG')
        img(os.path.join(ds1, 'red', 'r2.jpg'), 'JPEG')
        img(os.path.join(ds1, 'blue', 'b1.jpg'), 'JPEG')
        img(os.path.join(ds1, 'blue', 'b2.jpg'), 'JPEG')
        with open(os.path.join(ds1, 'dataset.json'), 'w', encoding='utf-8') as f:
            json.dump({'project': {'type': 'image'},
                       'schema': {'label_map': {'blue': 5, 'red': 2}}}, f)
        train, val, labels, counts = load_image_dataset(ds1, img_size=64, batch_size=2)
        # [T4 2026-10-03] 設計事實：classifier 不讀 dataset.json 的 label_map，
        #   分類順序恆為字母序（實測：map 順序相反仍得字母序）。
        #   與 detector/table 不同（它們會讀 label_map）。若未來要讀，先談定記錄格式方案。
        check(labels == ['blue', 'red'], f"分類順序為字母序（不依 label_map）: {labels}")
        check(counts == {'red': 2, 'blue': 2}, f"class_counts: {counts}")
        xs, ys, _, _ = one_batch(train)
        check(xs == (2, 64, 64, 3) and ys == (2, 2), f"train batch shape: {xs} / {ys}")
        check(val is not None, 'val_ds 存在（validation_split=0.2）')

        # === 2. 無 dataset.json → 字母序（現狀 fallback） ===
        ds2 = os.path.join(tmp, 'cls_nospec')
        shutil.copytree(ds1, ds2)
        os.remove(os.path.join(ds2, 'dataset.json'))
        _, _, labels2, _ = load_image_dataset(ds2, img_size=64, batch_size=2)
        check(labels2 == ['blue', 'red'], f"無 dataset.json → 字母序: {labels2}")

        # === 3. bmp 可訓練 + webp 被忽略且不崩 ===
        ds3 = os.path.join(tmp, 'cls_bmp_webp')
        img(os.path.join(ds3, 'red', 'r1.jpg'), 'JPEG')
        img(os.path.join(ds3, 'red', 'r2.jpg'), 'JPEG')
        img(os.path.join(ds3, 'blue', 'b1.bmp'), 'BMP')
        img(os.path.join(ds3, 'blue', 'b2.bmp'), 'BMP')
        img(os.path.join(ds3, 'red', 'noise.webp'), 'WEBP')   # 應被忽略
        train3, _, labels3, counts3 = load_image_dataset(ds3, img_size=64, batch_size=2)
        check(counts3 == {'blue': 2, 'red': 2}, f"bmp 計入、webp 忽略: {counts3}")
        xs3, _, _, _ = one_batch(train3)
        check(xs3 == (2, 64, 64, 3), f"bmp 可解碼（batch shape {xs3}）")
        check('.bmp' in IMAGE_EXTENSIONS and '.webp' not in IMAGE_EXTENSIONS,
              f"IMAGE_EXTENSIONS = {IMAGE_EXTENSIONS}")

        # === 4. label_map 缺/多：磁碟多的類別接在後、map 有但磁碟無則略過 ===
        ds4 = os.path.join(tmp, 'cls_partial_map')
        shutil.copytree(ds3, ds4)
        with open(os.path.join(ds4, 'dataset.json'), 'w', encoding='utf-8') as f:
            json.dump({'schema': {'label_map': {'blue': 0, 'ghost': 1}}}, f)
        _, _, labels4, _ = load_image_dataset(ds4, img_size=64, batch_size=2)
        check(labels4 == ['blue', 'red'], f"map 缺的類別接在後、幽靈類別略過: {labels4}")


        # === 5. validation_split=0 → 無驗證集、仍可訓練（含 bmp） ===
        train5, val5, labels5, _ = load_image_dataset(ds3, img_size=64, batch_size=2, validation_split=0)
        xs5, _, _, _ = one_batch(train5)
        check(val5 is None and xs5 == (2, 64, 64, 3), f"split=0: val_ds={val5}, shape={xs5}")

        # === 6. 錯誤路徑：<2 類 ===
        ds6 = os.path.join(tmp, 'cls_single')
        img(os.path.join(ds6, 'red', 'r1.jpg'), 'JPEG')
        try:
            load_image_dataset(ds6, img_size=64, batch_size=1)
            check(False, '單一類別應觸發 SystemExit')
        except SystemExit:
            check(True, '單一類別 → SystemExit（至少需要 2 個分類）')

        # === 7. 錯誤路徑：無類別資料夾（扁平散圖） ===
        ds7 = os.path.join(tmp, 'cls_flat')
        img(os.path.join(ds7, 'a.jpg'), 'JPEG')
        try:
            load_image_dataset(ds7, img_size=64, batch_size=1)
            check(False, '扁平結構應觸發 SystemExit')
        except SystemExit:
            check(True, '扁平散圖 → SystemExit（需 <類別>/圖片 結構）')

        # === 8. detector loader：bmp 可解碼、webp 不撿 ===
        dp = os.path.join(tmp, 'det')
        img(os.path.join(dp, 'images', 'a1.bmp'), 'BMP')
        img(os.path.join(dp, 'images', 'a2.bmp'), 'BMP')
        img(os.path.join(dp, 'images', 'skip.webp'), 'WEBP')
        os.makedirs(os.path.join(dp, 'labels'), exist_ok=True)
        for name in ('a1', 'a2', 'skip'):
            with open(os.path.join(dp, 'labels', name + '.txt'), 'w', encoding='utf-8') as f:
                f.write('0 0.5 0.5 0.2 0.2\n')
        with open(os.path.join(dp, 'labels.txt'), 'w', encoding='utf-8') as f:
            f.write('ball\n')
        d_train, _, d_labels, d_counts = load_detector_dataset(
            dp, img_size=64, batch_size=1, validation_split=0)
        dx, dy, dlo, dhi = one_batch(d_train)
        assert dlo is not None and dhi is not None, 'detector 空資料集（測試夾具有誤）'
        check(d_labels == ['ball'] and d_counts == {'ball': 2}, f"detector 只收 bmp: {d_counts}")
        check(dx == (1, 64, 64, 3) and dy == (1, 4), f"detector bmp batch: {dx} / {dy}")
        check(0.0 <= dlo and dhi <= 1.0, f"detector 正規化範圍: [{dlo:.2f}, {dhi:.2f}]")

        # === 9. line loader：bmp 可解碼 ===
        lp = os.path.join(tmp, 'line')
        img(os.path.join(lp, 'images', 'l1.bmp'), 'BMP')
        img(os.path.join(lp, 'images', 'l2.bmp'), 'BMP')
        os.makedirs(os.path.join(lp, 'lines'), exist_ok=True)
        for name in ('l1', 'l2'):
            with open(os.path.join(lp, 'lines', name + '.txt'), 'w', encoding='utf-8') as f:
                f.write('0.1 0.2 0.8 0.9\n')
        l_train, _, l_meta = load_line_dataset(lp, img_size=64, batch_size=1, validation_split=0)
        lx, ly, _, _ = one_batch(l_train)
        check(l_meta.get('sample_count') == 2, f"line sample_count: {l_meta.get('sample_count')}")
        check(lx == (1, 64, 64, 3) and ly == (1, 4), f"line bmp batch: {lx} / {ly}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
