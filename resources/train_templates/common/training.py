"""
訓練迴圈共同模組
提供 Class Weight 計算、優化器選擇、模型編譯與訓練功能。
"""

import numpy as np
import tensorflow as tf
from datetime import datetime
from sklearn.utils import class_weight


# 支援的優化器對照表
OPTIMIZER_REGISTRY = {
    'adam': lambda lr: tf.keras.optimizers.Adam(learning_rate=lr),
    'sgd': lambda lr: tf.keras.optimizers.SGD(learning_rate=lr, momentum=0.9),
    'rmsprop': lambda lr: tf.keras.optimizers.RMSprop(learning_rate=lr),
}


def get_optimizer(name, learning_rate=0.001):
    """
    根據名稱取得優化器。

    Args:
        name: 優化器名稱（'adam', 'sgd', 'rmsprop'）
        learning_rate: 學習率

    Returns:
        tf.keras.optimizers.Optimizer
    """
    key = name.lower().strip()
    if key not in OPTIMIZER_REGISTRY:
        print(f"警告: 不支援的優化器 '{name}'，使用預設 Adam")
        key = 'adam'

    return OPTIMIZER_REGISTRY[key](learning_rate)


def compute_class_weights(train_ds, num_classes):
    """
    從訓練集計算 Class Weight（處理資料不平衡）。

    Args:
        train_ds: 訓練集 tf.data.Dataset
        num_classes: 分類數

    Returns:
        dict: class_index -> weight
    """
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
    return class_weight_dict


def compile_and_train(model, train_ds, val_ds, optimizer_name='adam',
                      learning_rate=0.001, epochs=30,
                      class_weight_dict=None):
    """
    編譯並訓練模型。

    Args:
        model: tf.keras.Model
        train_ds: 訓練集 Dataset
        val_ds: 驗證集 Dataset（可為 None）
        optimizer_name: 優化器名稱
        learning_rate: 學習率
        epochs: 訓練輪數
        class_weight_dict: Class Weight 字典（可為 None）

    Returns:
        (history, train_time_seconds)
    """
    # 編譯模型
    optimizer = get_optimizer(optimizer_name, learning_rate)
    model.compile(
        optimizer=optimizer,
        loss='categorical_crossentropy',
        metrics=['accuracy']
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
    if class_weight_dict is not None:
        fit_kwargs['class_weight'] = class_weight_dict

    history = model.fit(train_ds, **fit_kwargs)

    train_time = (datetime.now() - start_time).total_seconds()
    print(f"\n訓練完成! 耗時: {train_time:.1f} 秒")

    # 顯示最終準確率
    if val_ds is not None:
        final_acc = history.history['val_accuracy'][-1]
        print(f"驗證準確率: {final_acc:.2%}")
    else:
        final_acc = history.history['accuracy'][-1]
        print(f"訓練準確率: {final_acc:.2%}")

    return history, train_time