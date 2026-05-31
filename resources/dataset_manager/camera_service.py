import cv2
import threading
import time
import base64
import os

class CameraService:
    def __init__(self):
        self.cap = None
        self.running = False
        self.frame = None
        self.lock = threading.Lock()
        self.thread = None
        self.window_name = "Cocoya Dataset Preview"

    def start(self, device_id=0):
        if self.running:
            return True
        
        # 嘗試開啟攝影機
        self.cap = cv2.VideoCapture(device_id)
        if not self.cap.isOpened():
            return False
        
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        return True

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
            self.cap = None

    def _run(self):
        cv2.namedWindow(self.window_name, cv2.WINDOW_AUTOSIZE)
        try:
            cv2.setWindowProperty(self.window_name, cv2.WND_PROP_TOPMOST, 1)
        except:
            pass

        while self.running:
            ret, frame = self.cap.read()
            if ret:
                display_frame = cv2.flip(frame, 1)
                with self.lock:
                    self.frame = frame.copy()
                
                cv2.imshow(self.window_name, display_frame)
                
                # waitKey 是必須的，否則視窗不會渲染
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                
                # 偵測視窗關閉 (X 按鈕)
                try:
                    # 在某些系統上，關閉視窗會讓這個屬性變為 -1 或 0
                    if cv2.getWindowProperty(self.window_name, cv2.WND_PROP_VISIBLE) < 1:
                        break 
                except:
                    break
            else:
                time.sleep(0.01)
        
        self.running = False
        cv2.destroyAllWindows()

    def capture(self, save_path=None):
        with self.lock:
            if self.frame is None:
                return None
            
            frame_to_save = self.frame.copy()
        
        # 如果有路徑則存檔
        if save_path:
            try:
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                cv2.imwrite(save_path, frame_to_save)
            except Exception as e:
                print(f"[Camera] Save failed: {str(e)}")
        
        # 產生 Base64 預覽圖給 Webview
        try:
            _, buffer = cv2.imencode('.jpg', frame_to_save)
            base64_str = base64.b64encode(buffer).decode('utf-8')
            
            return {
                "base64": base64_str,
                "width": frame_to_save.shape[1],
                "height": frame_to_save.shape[0]
            }
        except:
            return None
