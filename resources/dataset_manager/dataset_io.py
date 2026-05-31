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
    def export_dataset(source_dir, output_zip):
        """將資料集打包為 ZIP"""
        shutil.make_archive(output_zip.replace('.zip', ''), 'zip', source_dir)
        return output_zip
