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
import re
import sys

# 確定性控制（與 classifier_train.py 一致）
os.environ['TF_DETERMINISTIC_OPS'] = '1'
os.environ['TF_CUDNN_DETERMINISTIC'] = '1'


def build_representative_dataset(dataset_dir, img_size=224, batch_size=1):
    """掃描 dataset 目錄，建 representative dataset（供 int8 量化取樣 100 張）

    鐵律：前處理必須與訓練 pipeline 完全一致。訓練端（classifier_dataset.py）
    用 Rescaling(1./255) 把輸入正規化到 [0,1]；這裡若直接餵 0~255 原始像素，
    converter 會把 input scale 估錯 255 倍 → int8 模型輸出近乎隨機（f32 正常、
    int8 精度崩壞的根因，2026-09-04）。
    """
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
    # 與訓練端 Rescaling(1./255) 對齊
    ds = ds.map(lambda x, y: (tf.cast(x, tf.float32) / 255.0, y),
                num_parallel_calls=tf.data.AUTOTUNE)
    return ds


def _sanitize_keras_config(keras_path):
    """預處理 .keras（實為 zip）內的 config.json，剝除本地 TF 不支援的層參數。

    遠端 Docker（較新版 TF/Keras）產出的 .keras 中，BatchNormalization config 含
    renorm / renorm_clipping / renorm_momentum（新版 Keras 3 才有的參數）；本地較舊
    TF 反序列化時直接拋 "Unrecognized keyword arguments"。實測 custom_objects 對
    內建類別（module: keras.layers）無效——Keras 3 優先走自家 registry——因此改為
    直接改寫 config.json 移除不支援的鍵後重打包，再交給 load_model。
    回傳暫存 .keras 路徑；無法處理時回傳 None（呼叫端沿用原檔 fallback）。
    """
    import json
    import shutil
    import tempfile
    import zipfile

    # 黑名單：遠端較新版 Keras 3 會寫入、本地較舊 Keras 不認得的層參數。
    # renorm 系列為 BatchNormalization；quantization_config / lora_* 為 Dense 等層
    # 的 Keras 3 新參數（值為 None 時剝除語義等價）。若之後再冒出新的
    # "Unrecognized keyword arguments"，把鍵名加進來即可。
    _STRIP_KEYS = {
        'renorm', 'renorm_clipping', 'renorm_momentum',
        'synchronized',
        'quantization_config',
        'lora_rank', 'lora_name', 'lora_scale',
    }

    def _strip(o):
        if isinstance(o, dict):
            for k in _STRIP_KEYS:
                o.pop(k, None)
            for v in o.values():
                _strip(v)
        elif isinstance(o, list):
            for v in o:
                _strip(v)

    try:
        with zipfile.ZipFile(keras_path) as zin:
            names = zin.namelist()
            target = None
            for n in names:
                if n == 'config.json' or n.endswith('/config.json'):
                    target = n
                    break
            if target is None:
                print("config 預處理跳過：.keras 內找不到 config.json")
                return None
            cfg = json.loads(zin.read(target).decode('utf-8'))
            _strip(cfg)
            tmpdir = tempfile.mkdtemp(prefix='cocoya_compat_')
            out_path = os.path.join(tmpdir, 'compat.keras')
            with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zout:
                for n in names:
                    data = zin.read(n)
                    if n == target:
                        data = json.dumps(cfg).encode('utf-8')
                    zout.writestr(n, data)
            return out_path
    except Exception as e:
        print(f"config 預處理失敗({e})，改用原檔載入")
        return None


def _load_model_compat(keras_path):
    """載入 keras 模型，容錯遠端（較新版 TF）產出模型帶有的 renorm 等 BatchNormalization 參數。

    流程：① 直接載入 → ② 失敗時以 _sanitize_keras_config 預處理後重載 →
    ③ 保留自訂寬容層與 compile=False 作最後保險。
    """
    import shutil
    import tensorflow as tf

    class _CompatBatchNorm(tf.keras.layers.BatchNormalization):
        def __init__(self, **kwargs):
            # 剝除本地 TF 不支援的 renorm 系列參數
            kwargs.pop('renorm', None)
            kwargs.pop('renorm_clipping', None)
            kwargs.pop('renorm_momentum', None)
            super().__init__(**kwargs)

    _CUSTOM = {'BatchNormalization': _CompatBatchNorm}

    try:
        return tf.keras.models.load_model(keras_path)
    except Exception as e_first:
        # 初次失敗：預處理 .keras config（剝除 renorm 系列）後重載
        sanitized = _sanitize_keras_config(keras_path)
        if sanitized:
            try:
                model = tf.keras.models.load_model(sanitized)
                try:
                    shutil.rmtree(os.path.dirname(sanitized), ignore_errors=True)
                except Exception:
                    pass
                return model
            except Exception as e_san:
                # 解析下一個不相容參數名，供快速擴充 _STRIP_KEYS 定位
                _hint = ''
                m = re.search(r"Unrecognized keyword arguments passed to (\w+): (\{[^}]*\})", str(e_san))
                if m:
                    _hint = f"（下一個不相容層: {m.group(1)}, 參數: {m.group(2)} → 加入 _STRIP_KEYS）"
                print(f"config 預處理後仍載入失敗{_hint}，改用 custom_objects fallback。原始錯誤: {e_san}")
        # 保險：寬容 layer / compile=False
        try:
            return tf.keras.models.load_model(
                keras_path, custom_objects=_CUSTOM)
        except Exception:
            return tf.keras.models.load_model(
                keras_path, custom_objects=_CUSTOM, compile=False)


def convert_tflite(keras_path, dataset_dir, output_dir, project_name, model_output, need_rep=None):
    import tensorflow as tf

    # need_rep：只有 int8 量化需要 representative dataset（統計 activation min/max）；
    # f32/keras 轉換只需模型本身，不必重掃樣本。預設依 model_output 自動判斷。
    if need_rep is None:
        need_rep = model_output in ('int8', 'int8+f32', 'all')

    print(f"載入 Keras 模型: {keras_path}")
    model = _load_model_compat(keras_path)

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
