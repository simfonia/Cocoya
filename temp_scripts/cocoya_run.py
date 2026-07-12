import cv2
import serial
import time


class _ModelClassifier:
    def __init__(self, model_path):
        import os, sys, cv2, numpy as np
        try:
            import tflite_runtime.interpreter as tflite
        except ImportError:
            try:
                from tensorflow import lite as tflite
            except ImportError:
                print("Error: install tflite-runtime"); sys.exit(1)
        # 智能搜尋模型檔案
        if not model_path.endswith(".tflite"):
            # 如果路徑是目錄，在裡面搜尋 .tflite 檔案
            if os.path.isdir(model_path):
                import glob
                tflite_files = glob.glob(os.path.join(model_path, "*.tflite"))
                if tflite_files:
                    if len(tflite_files) > 1:
                        print(f"警告: 找到多個模型檔案，使用第一個: {tflite_files[0]}")
                    model_path = tflite_files[0]
                else:
                    # 如果目錄中沒有 .tflite 檔案，嘗試原本的邏輯
                    model_path = model_path + ".tflite"
        d = os.path.dirname(model_path)
        lbl = os.path.join(d, os.path.basename(d) + "_labels.txt")
        if not os.path.exists(model_path): raise FileNotFoundError("Model: " + model_path)
        if not os.path.exists(lbl): raise FileNotFoundError("Labels: " + lbl)
        self.it = tflite.Interpreter(model_path=model_path)
        self.it.allocate_tensors(); self.i = self.it.get_input_details(); self.o = self.it.get_output_details()
        self.isf = self.i[0]["dtype"] == np.float32
        self.ls = [line.strip() for line in open(lbl)]

    def _predict(self, frame):
        import numpy as np
        # 檢查 frame 是否有效
        if frame is None or frame.size == 0:
            return ("none", 0.0)
        s = self.i[0]["shape"][1]
        d2 = cv2.resize(frame, (s, s))
        d2 = d2.astype(np.float32)/255.0 if self.isf else d2.astype(np.uint8)
        d2 = np.expand_dims(d2, axis=0)
        self.it.set_tensor(self.i[0]["index"], d2); self.it.invoke()
        out = self.it.get_tensor(self.o[0]["index"])[0]
        out = out.astype(np.float32)/255.0 if not self.isf else out
        cid = int(np.argmax(out)); conf = float(out[cid])
        lb = self.ls[cid] if cid < len(self.ls) else "class_" + str(cid)
        return (lb, conf)

    def predict(self, frame):
        return self._predict(frame)


  # S_ID:TW939Xfqdz=i#~l%IE4.
_model_classifier = _ModelClassifier("model/classifier_dataset")  # S_ID:ZNXsCDVS3xfW;ngq2tGO  # E_ID:ZNXsCDVS3xfW;ngq2tGO
ser = serial.Serial('COM4', 115200, timeout=0.01, write_timeout=0)  # S_ID:ser_init  # E_ID:ser_init  # E_ID:TW939Xfqdz=i#~l%IE4.

if __name__ == "__main__":  # S_ID:Iv8!zE5oU-Rl`?clOlTb
    cap = cv2.VideoCapture(0)  # S_ID:iRYRZaR*kFmX0F^.f:6(  # E_ID:iRYRZaR*kFmX0F^.f:6(
    while True:  # S_ID:}-:W1Y^n+:5GawnA#_5a
        ret, frame = cap.read()  # S_ID:O6YLd|SE2C-U8Z3{e;Ao  # E_ID:O6YLd|SE2C-U8Z3{e;Ao
        result = _model_classifier.predict(frame)  # S_ID:U+gFSS1wGn5gBjMBy|+/  # E_ID:U+gFSS1wGn5gBjMBy|+/
        frame = cv2.flip(frame, 1)  # S_ID:v*FxVv,Xxz#}FiLX9!bl  # E_ID:v*FxVv,Xxz#}FiLX9!bl
        cv2.imshow('Cocoya Video', frame)  # S_ID:Q4mK*/c?A#;[mr{u(,=B  # E_ID:Q4mK*/c?A#;[mr{u(,=B
        if result[1] > 0.75:  # S_ID:}XIen7s?y-~K.YJ#7u*)
            ser.write((str(result[0]) + "\n").encode('utf-8'))  # S_ID:)_KTI-zsE33#tdL,?Gda  # E_ID:)_KTI-zsE33#tdL,?Gda
            print(result[0])  # S_ID:)vJ2fkMz@S_X+OIuUW,^  # E_ID:)vJ2fkMz@S_X+OIuUW,^
        else:
            print('Not sure!')  # S_ID:`[6E=?sH$t^Ij(Y2:uYS  # E_ID:`[6E=?sH$t^Ij(Y2:uYS  # E_ID:}XIen7s?y-~K.YJ#7u*)
        time.sleep(0.2)  # S_ID:|bTqz/E)Ay]S2V)PWh[}  # E_ID:|bTqz/E)Ay]S2V)PWh[}
        if cv2.waitKey(1) & 0xFF == ord('q'):  # S_ID:E)!0^ha28O~xD3.4T|}C
            break  # E_ID:E)!0^ha28O~xD3.4T|}C  # E_ID:}-:W1Y^n+:5GawnA#_5a  # E_ID:Iv8!zE5oU-Rl`?clOlTb