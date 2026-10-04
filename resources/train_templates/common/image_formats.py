# -*- coding: utf-8 -*-
"""common/image_formats.py — 訓練支援的影像副檔名 SSOT

【為何需要這個模組 —— 2026-10-03】
修 e2e 測試時發現同一份副檔名清單在專案裡被硬寫 **5 處**：
  classifier_dataset.py ×2、detector_dataset.py ×2、line_dataset.py ×2
且彼此不一致：classifier 只認 3 種，另兩個認 5 種（含 webp）。
散落多處的後果就是這次 —— 改一處忘三處，缺陷靜默存在數月。

【實測結論：解碼閘門是 tf.io.decode_image，不是宣稱】
TensorFlow 的解碼能力以實測為準（TF 2.18.0 / CPU / PIL 寫入 → tf 解碼）：

    格式   tf.io.decode_image   tf.image.decode_jpeg
    .jpg      ✅                    ✅
    .png      ✅                    ✅
    .gif      ✅                    ✅
    .bmp      ✅                    ❌  Trying to decode BMP using a wrong op
    .webp     ❌                    ❌  Unknown image file format

兩個重要結論：
1. **沒有任何 TF decode 支援 webp** —— 原先 detector/line 把 `.webp` 列為支援是
   **錯誤的宣稱**，使用者丟 webp 進去會在訓練途中拋出難懂的 TensorFlow 例外。
2. **只有 `decode_image` 能解 bmp** —— detector/line 原用 `decode_jpeg`，
   就算清單宣告支援 bmp 也會崩潰。故 common/ 內一律使用 `decode_image`。

【GIF 的取幀語意】
`decode_image(..., expand_animations=False)` 只取**第一幀**（實測動態 GIF 3 幀
→ shape (8,8,3) 而非 (3,8,8,3)）。對靜態 AI 訓練資料集這是正確行為：
一張 gif 就是一張訓練樣本，不是序列。

【維護鐵律】
新增副檔名時必須先實測 `tf.io.decode_image` 能否解碼，**不可憑印象加**；
common/ 內所有 loader 一律由此匯入，且解碼一律用 `tf.io.decode_image`。
"""


def decode_train_image(raw_bytes, img_size):
    """解碼並縮放訓練用影像（唯一的解碼入口）。

    ⚠️ 不可改用 `tf.image.decode_jpeg`：實測它不解 bmp 與多數非 jpeg 格式，
    會在訓練途中拋出與資料無關的 op 錯誤。
    """
    import tensorflow as tf
    img = tf.io.decode_image(raw_bytes, channels=3, expand_animations=False)
    return tf.image.resize(img, [img_size, img_size])


#: 訓練可用的影像副檔名（小寫比對，呼叫端請用 is_supported_image()）。
#: 順序僅為閱讀便利，不具語意。
IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.bmp', '.gif')

#: 明確不支援的副檔名 —— 附原因，供錯誤訊息與日誌說明（避免使用者重複踩坑）。
UNSUPPORTED_IMAGE_EXTENSIONS = {
    '.webp': 'TensorFlow tf.io.decode_image 不支援（實測 2.18.0：Unknown image file format）；'
             '請先轉為 jpg/png',
}


def is_supported_image(filename):
    """檔名是否為訓練可解碼的影像格式。"""
    return str(filename).lower().endswith(IMAGE_EXTENSIONS)


def describe_unsupported(filename):
    """若是不支援的格式，回傳原因字串；否則回 None。"""
    low = str(filename).lower()
    for ext, reason in UNSUPPORTED_IMAGE_EXTENSIONS.items():
        if low.endswith(ext):
            return reason
    return None

