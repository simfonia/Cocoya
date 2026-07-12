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

    @staticmethod
    def list_cameras(max_test=10):
        """列舉系統中所有可用的攝影機裝置
        
        依序測試 index 0 ~ max_test-1，回傳可用的裝置清單。
        暫時重導 stderr 以抑制 OpenCV 對不存在的 index 的錯誤訊息。
        """
        # 暫時重導 stderr 到 devnull 抑制 OpenCV 的 obsensor 錯誤輸出
        try:
            import os as _os
            _stderr_fd = _os.dup(2)
            _devnull_fd = _os.open(_os.devnull, _os.O_WRONLY)
            _os.dup2(_devnull_fd, 2)
            _os.close(_devnull_fd)
        except:
            _stderr_fd = None

        available = []
        try:
            for i in range(max_test):
                try:
                    cap = cv2.VideoCapture(i)
                    if cap.isOpened():
                        ret, _ = cap.read()
                        if ret:
                            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                            name = f"Camera {i} ({width}x{height})"
                            available.append({
                                "id": i,
                                "name": name
                            })
                        cap.release()
                except:
                    pass
        finally:
            # 還原 stderr
            if _stderr_fd is not None:
                try:
                    import os as _os
                    _os.dup2(_stderr_fd, 2)
                    _os.close(_stderr_fd)
                except:
                    pass

        return available

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
                    self.running = False
                    break
                
                # 偵測視窗關閉 (X 按鈕)
                try:
                    # 在某些系統上，關閉視窗會讓這個屬性變為 -1 或 0
                    if cv2.getWindowProperty(self.window_name, cv2.WND_PROP_VISIBLE) < 1:
                        self.running = False
                        break 
                except:
                    self.running = False
                    break
            else:
                time.sleep(0.01)
        
        # 確保釋放攝影機資源
        if self.cap:
            self.cap.release()
            self.cap = None
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
