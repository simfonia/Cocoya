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
        self.frame_id = 0
        self.lock = threading.Lock()
        self.thread = None
        self.window_name = "Cocoya Dataset Preview"
        # [2026-10-21 資源釋放] session 計數：每次 start() 遞增。
        # _run 以啟動當下的 session 值判斷「自己是否仍是當前 session」，
        # 避免舊執行緒在 finally 中釋放/關閉新 session 的 cap 與 OpenCV 視窗。
        self._session = 0

    @staticmethod
    def list_cameras(max_test=5):
        """列舉系統中所有可用的攝影機裝置
        
        依序測試 index 0 ~ max_test-1，回傳可用的裝置清單。
        當連續 2 個 index 失敗時提前中止，避免測試過多不存在的裝置。
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
        consecutive_failures = 0
        try:
            for i in range(max_test):
                cap = None
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
                            consecutive_failures = 0
                        else:
                            consecutive_failures += 1
                    else:
                        consecutive_failures += 1
                except Exception:
                    consecutive_failures += 1
                finally:
                    # [2026-10-21 資源釋放] cap 釋放必須在 finally：
                    #   read()/get() 拋錯時原本會跳過 release()，累積 camera handle。
                    if cap is not None:
                        try:
                            cap.release()
                        except Exception:
                            pass

                # 連續 2 個失敗就停止，避免測試太多不存在的 index
                if consecutive_failures >= 2:
                    break
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

        # [2026-10-21 資源釋放] 若前一個 session 的執行緒還活著（stop() 逾時未收），
        # 先等它退出，避免兩個 _run 執行緒同時對同一個 OpenCV 視窗 imshow/destroy。
        if self.thread is not None and self.thread.is_alive():
            self.thread.join(timeout=2.0)

        # 嘗試開啟攝影機
        cap = cv2.VideoCapture(device_id)
        if not cap.isOpened():
            # [2026-10-21 資源釋放] 開啟失敗也要 release，否則 handle 殘留。
            try:
                cap.release()
            except Exception:
                pass
            self.cap = None
            return False

        self.cap = cap
        self.running = True
        self._session += 1
        session = self._session
        self.thread = threading.Thread(target=self._run, args=(session,), daemon=True)
        self.thread.start()
        return True

    def stop(self):
        """停止相機（冪等，可重複呼叫）。

        - 只設 flag 並等待 _run 執行緒自行退出。
        - 鐵律：OpenCV HighGUI（Windows）視窗操作不可跨執行緒——若從 stdin 讀取
        執行緒呼叫 destroyAllWindows，會與 _run 的 imshow/waitKey 相撞，隨機
        deadlock/crash（2026-09-10 Tauri 實機：stopCamera response 30s timeout）。
        - _run 迴圈每幀檢查 running，最多 ~33ms 後自行 destroy 視窗並釋放 cap。
        - [2026-10-21] 逾時未收時，強制釋放 cap 以中斷阻塞中的 read()（釋放
        cap 本身不涉及 HighGUI，不違反上面的鐵律）。
        """
        self.running = False
        thread = self.thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=2.0)
            if thread.is_alive():
                cap = self.cap
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass

    def is_running(self):
        return self.running

    def get_preview_frame(self):
        """回傳目前最新幀的 base64 JPEG（供 live 預覽用，不存檔）。未啟動/尚無幀回 None。

        預覽幀會降解析度至 320x240 並以 JPEG quality 70 編碼，以降低 IPC 傳輸負載；
        capture() 仍保持全解析度，不受影響。
        """
        PREVIEW_WIDTH = 320
        PREVIEW_HEIGHT = 240
        JPEG_QUALITY = 70
        with self.lock:
            if self.frame is None:
                return None
            frame = self.frame.copy()
            fid = self.frame_id
        try:
            # [2026-10-23 優化 A] 預覽幀降解析度 + 降 JPEG quality，減少 base64 IPC 負載
            if frame.shape[1] > PREVIEW_WIDTH or frame.shape[0] > PREVIEW_HEIGHT:
                frame = cv2.resize(frame, (PREVIEW_WIDTH, PREVIEW_HEIGHT), interpolation=cv2.INTER_AREA)
            # [2026-10-23 小修] 預覽水平翻转（鏡像效果，符合自拍直覺；拍照 capture() 不受影響）
            frame = cv2.flip(frame, 1)
            t0 = time.time()
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            base64_str = base64.b64encode(buffer.tobytes()).decode('utf-8')
            encode_ms = int((time.time() - t0) * 1000)
            return {
                "base64": base64_str,
                "width": frame.shape[1],
                "height": frame.shape[0],
                "frame_id": fid,
                "encode_ms": encode_ms
            }
        except Exception:
            return None
    def get_current_frame(self):
        """回傳目前最新幀的副本；未啟動/尚無幀回 None（供特徵提取用，不存取不複製）。"""
        with self.lock:
            if self.frame is None:
                return None
            return self.frame.copy()


    def _run(self, session=None):
        # [2026-10-23 內嵌預覽] 不再開啟 OpenCV 視窗；_run 只負責採集幀寫入 self.frame，
        # 供 get_preview_frame() / capture() 編碼為 base64 給前端預覽。
        # [2026-10-21 資源釋放] session 為啟動當下的序號；若期間有新的 start()，
        # 舊執行緒必須立刻退出，且不得釋放新 session 的 cap。
        if session is None:
            session = self._session
        cap = self.cap
        try:
            while self.running and session == self._session:
                # 每幀取本地參照：避免 stop() 逾時後 _run 與釋放路徑競爭 self.cap
                if cap is None:
                    break
                try:
                    ret, frame = cap.read()
                except Exception as e:
                    import sys as _sys
                    print(f"[Camera] read exception: {e}", file=_sys.stderr, flush=True)
                    self.running = False
                    break
                if ret:
                    with self.lock:
                        self.frame = frame
                        self.frame_id += 1
                else:
                    time.sleep(0.01)
        finally:
            # [2026-10-21 資源釋放] 釋放必須在 finally：read() 拋錯時原本會跳過釋放。
            try:
                if cap is not None:
                    cap.release()
            except Exception:
                pass
            # 只有仍為當前 session 的執行緒才可以清掉 self.cap，
            # 避免舊執行緒誤殺新 session（stop() 逾時後立刻 restart 的情境）。
            if session == self._session:
                if self.cap is not None and self.cap is not cap:
                    try:
                        self.cap.release()
                    except Exception:
                        pass
                self.cap = None

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
        
        try:
            # 產生 Base64 預覽圖給 Webview
            _, buffer = cv2.imencode('.jpg', frame_to_save)
            # buffer 為 numpy 陣列（uint8），base64 僅接受 buffer protocol；
            # 以 memoryview/bytes 靜態轉換為 bytes 後再編碼。
            base64_str = base64.b64encode(buffer.tobytes()).decode('utf-8')
            
            return {
                "base64": base64_str,
                "width": frame_to_save.shape[1],
                "height": frame_to_save.shape[0]
            }
        except:
            return None
