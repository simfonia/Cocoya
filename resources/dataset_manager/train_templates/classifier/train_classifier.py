"""
train_classifier.py
Docker 容器內的訓練腳本 — MobileNetV2 轉移學習

執行方式（在 Docker 容器內）:
  python train_classifier.py

輸入: /dataset/  (子目錄名 = label)
輸出: /output/gesture_model.tflite, /output/labels.txt
"""

import os
import sys
import argparse
import tensorflow as tf
from datetime import datetime

# === 命令列參數 ===
parser = argparse.ArgumentParser(description='手勢分類訓練')
parser.add_argument('--epochs', type=int, default=20, help='訓練 epoch 數')
parser.add_argument('--batch_size', type=int, default=32, help='batch size')
parser.add_argument('--input_size', type=int, default=224, help='輸入影像大小')
parser.add_argument('--lr', type=float, default=0.001, help='學習率')
args = parser.parse_args()

# === 設定 ===
DATASET_DIR = '/dataset'
OUTPUT_DIR = '/output'
IMG_SIZE = args.input_size
BATCH_SIZE = args.batch_size
EPOCHS = args.epochs
LEARNING_RATE = args.lr

os.makedirs(OUTPUT_DIR, exist_ok=True)

# === 檢查資料集 ===
if not os.path.exists(DATASET_DIR):
    print(f"錯誤: 找不到資料集目錄 {DATASET_DIR}")
    sys.exit(1)

labels = sorted([d for d in os.listdir(DATASET_DIR)
                 if os.path.isdir(os.path.join(DATASET_DIR, d))])

if len(labels) < 2:
    print(f"錯誤: 至少需要 2 個分類，目前只有 {len(labels)} 個")
    sys.exit(1)

print(f"找到 {len(labels)} 個分類: {labels}")

# 計算各分類的張數
for label in labels:
    count = len([f for f in os.listdir(os.path.join(DATASET_DIR, label))
                 if f.endswith(('.jpg', '.jpeg', '.png'))])
    print(f"  {label}: {count} 張")

# === 載入資料集 ===
print("\n載入資料集...")
train_ds = tf.keras.preprocessing.image_dataset_from_directory(
    DATASET_DIR,
    validation_split=0.2,
    subset='training',
    seed=123,
    image_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    label_mode='categorical'
)

val_ds = tf.keras.preprocessing.image_dataset_from_directory(
    DATASET_DIR,
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
base_model.trainable = False

model = tf.keras.Sequential([
    base_model,
    tf.keras.layers.GlobalAveragePooling2D(),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(len(labels), activation='softmax')
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=LEARNING_RATE),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

model.summary()

# === 計算 Class Weight ===
print("\n計算 Class Weight...")
from sklearn.utils import class_weight
import numpy as np

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
print(f"\n開始訓練 ({EPOCHS} epochs)...")
start_time = datetime.now()

history = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS,
    class_weight=class_weight_dict,
    verbose=1
)

train_time = (datetime.now() - start_time).total_seconds()
print(f"\n訓練完成! 耗時: {train_time:.1f} 秒")

final_acc = history.history['val_accuracy'][-1]
print(f"驗證準確率: {final_acc:.2%}")

# === 儲存 Keras 模型（TFLite 轉換在本地 PC 進行）===
print("\n儲存 Keras 模型...")
keras_path = os.path.join(OUTPUT_DIR, 'gesture_model.keras')
model.save(keras_path)
print(f"✅ Keras 模型已儲存: {keras_path}")
print("   TFLite 轉換將在本地 PC 進行（容器內 TensorFlow 2.16 ARM64 不相容）")

# === 儲存 labels.txt ===
labels_path = os.path.join(OUTPUT_DIR, 'labels.txt')
with open(labels_path, 'w') as f:
    for label in labels:
        f.write(f"{label}\n")
print(f"Labels 已儲存: {labels_path}")

print("\n✅ 訓練完成！產出檔案:")
for f in os.listdir(OUTPUT_DIR):
    fpath = os.path.join(OUTPUT_DIR, f)
    size = os.path.getsize(fpath)
    print(f"  {f} ({size/1024:.1f} KB)")