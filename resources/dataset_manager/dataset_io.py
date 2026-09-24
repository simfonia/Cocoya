import os
import shutil
import json

class DatasetIO:
    @staticmethod
    def save_sample(image_data, base_path, label, filename):
        """儲存單張樣本影像"""
        target_dir = os.path.join(base_path, label)
        os.makedirs(target_dir, exist_ok=True)
        
        target_path = os.path.join(target_dir, filename)
        # 這裡假設 image_data 是 numpy array (OpenCV frame)
        import cv2
        cv2.imwrite(target_path, image_data)
        return target_path

    @staticmethod
    def export_dataset(source_dir, output_zip, exclude_top_dirs=None):
        """將資料集打包為 ZIP。

        exclude_top_dirs（2026-09-22 OD 對齊）：偵測/循跡匯出時，訓練用 images/+
        labels/（或 lines/）已扁平化建好，原始 <label>/ 子資料夾對 py_ai_train_run
        是冗餘副本（且 ZIP 體積雙倍）——以頂層資料夾黑名單排除，不刪磁碟檔。
        classifier（image 類型）不傳此參數，<label>/ 子資料夾即訓練佈局，照常打包。
        """
        import zipfile
        exclude = set(exclude_top_dirs or [])
        base = os.path.abspath(source_dir)
        out = output_zip if output_zip.endswith('.zip') else output_zip + '.zip'
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(base):
                rel_root = os.path.relpath(root, base)
                top = rel_root.split(os.sep)[0] if rel_root != '.' else ''
                # 頂層黑名單資料夾整棵跳過（含自身空目錄）
                if top and top in exclude:
                    dirs[:] = []
                    continue
                for fname in files:
                    fpath = os.path.join(root, fname)
                    arc = os.path.relpath(fpath, base).replace(os.sep, '/')
                    zf.write(fpath, arc)
        return output_zip
