import sys
import json
import time
import os
import threading
from camera_service import CameraService

class DatasetSidecar:
    def __init__(self):
        self.camera = CameraService()
        self.running = True
        self.last_camera_running = False

    def _monitor_camera(self):
        """背景監控攝影機狀態，若手動關閉則主動回報"""
        while self.running:
            is_running = self.camera.running
            if is_running != self.last_camera_running:
                # 狀態發生變化
                self.send_event("cameraStatus", {"running": is_running})
                self.last_camera_running = is_running
            time.sleep(0.5)

    def run(self):
        """主迴圈：從 stdin 讀取 JSON 指令，並透過 stdout 回傳結果"""
        # 啟動監控執行緒
        monitor_thread = threading.Thread(target=self._monitor_camera, daemon=True)
        monitor_thread.start()

        # 使用串流模式讀取 stdin
        while self.running:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                
                trimmed = line.strip()
                if not trimmed:
                    continue

                msg = json.loads(trimmed)
                command = msg.get("command")
                request_id = msg.get("requestId")
                
                if command == "startCamera":
                    device_id = msg.get("deviceId", 0)
                    success = self.camera.start(device_id)
                    self.send_response(request_id, {"success": success})
                
                elif command == "stopCamera":
                    self.camera.stop()
                    self.send_response(request_id, {"success": True})
                
                elif command == "captureImage":
                    save_path = msg.get("savePath")
                    label = msg.get("label", "unlabeled")
                    print(f"[Sidecar Log] Capturing image for label: {label}", file=sys.stderr)
                    
                    result = self.camera.capture(save_path)
                    if result:
                        self.send_response(request_id, {
                            "success": True,
                            "base64": result["base64"],
                            "width": result["width"],
                            "height": result["height"],
                            "label": label,
                            "savePath": save_path
                        })
                    else:
                        print(f"[Sidecar Log] Capture failed", file=sys.stderr)
                        self.send_response(request_id, {"success": False, "error": "Capture failed"})

                elif command == "exportDataset":
                    source_dir = msg.get("sourceDir")
                    output_zip = msg.get("outputZip")
                    print(f"[Sidecar Log] Exporting dataset from {source_dir} to {output_zip}", file=sys.stderr)
                    
                    try:
                        import os
                        from dataset_io import DatasetIO
                        if not os.path.exists(source_dir):
                            raise Exception(f"Source directory does not exist: {source_dir}")
                            
                        result_path = DatasetIO.export_dataset(source_dir, output_zip)
                        self.send_response(request_id, {"success": True, "path": result_path})
                    except Exception as e:
                        print(f"[Sidecar Log] Export failed: {str(e)}", file=sys.stderr)
                        self.send_response(request_id, {"success": False, "error": str(e)})
                
                elif command == "exit":
                    self.camera.stop()
                    self.running = False
                    self.send_response(request_id, {"success": True})
                
            except Exception as e:
                self.send_error(None, str(e))

    def send_response(self, request_id, data):
        response = {
            "type": "response",
            "requestId": request_id
        }
        response.update(data)
        print(json.dumps(response), flush=True)

    def send_event(self, event_name, data):
        """主動發送事件給 Host (非請求回覆)"""
        event = {
            "type": "event",
            "event": event_name
        }
        event.update(data)
        print(json.dumps(event), flush=True)

    def send_error(self, request_id, error_msg):
        response = {
            "type": "error",
            "requestId": request_id,
            "error": error_msg
        }
        print(json.dumps(response), flush=True)

if __name__ == "__main__":
    # 確保輸出不被快取
    sys.stdout.reconfigure(encoding='utf-8')
    sidecar = DatasetSidecar()
    sidecar.run()
