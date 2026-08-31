#!/usr/bin/env python3
"""
本地 TFLite 轉換（由 trainRemote 於遠端下載 keras 後呼叫）
鐵律 D10/D15：TFLite 只在本地(AMD64) 轉，因 DGX(ARM64) TF 有 keras_deps bug。
iron 選項 1：int8 量化使用「本地 dataset/<資料集名>」重建 representative dataset。
99% 對齊 classifier_train.py --model_output 的命名：
  int8        -> {project}.tflite
  f32         -> {project}_f32.tflite
  keras       -> 僅需 keras（已下載，本腳本不重做）
  int8+f32/all-> {project}.tflite + {project}_f32.tflite
永遠不動 keras（已由 sidecar 下載）。
"""
import argparse
import os
import sys

# 確定性控制（與 classifier_train.py 一致）
os.environ['TF_DETERMINISTIC_OPS'] = '1'
os.environ['TF_CUDNN_DETERMINISTIC'] = '1'


def build_representative_dataset(dataset_dir, img_size=224, batch_size=1):
    """掃描 dataset 目錄，建 representative dataset（供 int8 量化取樣 100 張）"""
    import tensorflow as tf
    if not os.path.isdir(dataset_dir):
        # dataset 不存在時退回升級為 f32（不強求 representative）
        return None
    labels = sorted([d for d in os.listdir(dataset_dir)
                     if os.path.isdir(os.path.join(dataset_dir, d))])
    if len(labels) < 2:
        return None
    ds = tf.keras.preprocessing.image_dataset_from_directory(
        dataset_dir,
        image_size=(img_size, img_size),
        batch_size=batch_size,
        label_mode='categorical',
        shuffle=True,
        seed=123
    )
    return ds


def convert_tflite(keras_path, dataset_dir, output_dir, project_name, model_output, need_rep=None):
    import tensorflow as tf

    # need_rep：只有 int8 量化需要 representative dataset（統計 activation min/max）；
    # f32/keras 轉換只需模型本身，不必重掃樣本。預設依 model_output 自動判斷。
    if need_rep is None:
        need_rep = model_output in ('int8', 'int8+f32', 'all')

    print(f"載入 Keras 模型: {keras_path}")
    model = tf.keras.models.load_model(keras_path)

    rep_ds = build_representative_dataset(dataset_dir) if need_rep else None
    if need_rep:
        print("int8 量化：掃描本地 dataset 建 representative（樣本越多越久，請耐心等待）")
    else:
        print(f"model_output={model_output}：不需 representative dataset，跳過樣本掃描")

    def make_rep_gen():
        def gen():
            if rep_ds is None:
                return
            for images, _ in rep_ds.take(100):
                yield [images]
        return gen

    def write_tflite(converter, out_path):
        tflite_model = converter.convert()
        with open(out_path, 'wb') as f:
            f.write(tflite_model)
        print(f"TFLite 已儲存: {out_path} ({len(tflite_model)/1024:.1f} KB)")

    output_root = output_dir

    # keras 選項：不需轉換（keras 已由 sidecar 下載），僅標示
    if model_output == 'keras':
        print("model_output=keras：keras 已由 sidecar 下載，不需 TFLite 轉換")
        return

    # int8 量化
    if model_output in ('int8', 'int8+f32', 'all'):
        out_int8 = os.path.join(output_root, f"{project_name}.tflite")
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        if rep_ds is not None:
            converter.optimizations = [tf.lite.Optimize.DEFAULT]
            converter.representative_dataset = make_rep_gen()
            converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
            converter.inference_input_type = tf.uint8
            converter.inference_output_type = tf.uint8
            try:
                write_tflite(converter, out_int8)
            except Exception as e:
                print(f"int8 量化失敗({e})，降級 Float32 儲存到 {out_int8}")
                c2 = tf.lite.TFLiteConverter.from_keras_model(model)
                write_tflite(c2, out_int8)
        else:
            # 無 representative，降級 Float32（仍命名 project.tflite）
            print("無驗證的 representative dataset，int8 降級為 Float32")
            c3 = tf.lite.TFLiteConverter.from_keras_model(model)
            write_tflite(c3, out_int8)

    # Float32 TFLite
    if model_output in ('f32', 'int8+f32', 'all'):
        out_f32 = os.path.join(output_root, f"{project_name}_f32.tflite")
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        write_tflite(converter, out_f32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--keras_path', required=True)
    parser.add_argument('--dataset_dir', required=True)
    parser.add_argument('--output_dir', required=True)
    parser.add_argument('--project_name', required=True)
    parser.add_argument('--model_output', required=True)
    args = parser.parse_args()

    try:
        import tensorflow as tf
    except ImportError:
        print("錯誤: 本地未安裝 tensorflow，無法轉換 TFLite。請 pip install tensorflow")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)
    convert_tflite(args.keras_path, args.dataset_dir, args.output_dir,
                   args.project_name, args.model_output)
    print("本地 TFLite 轉換流程完成")


if __name__ == '__main__':
    main()
