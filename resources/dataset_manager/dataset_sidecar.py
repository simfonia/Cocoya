import sys
import json
import time
import os
import threading
import warnings

# 抑制 CryptographyDeprecationWarning 與一般 DeprecationWarning 雜訊
# 這些警告來自 paramiko 相依函式庫，但不影響功能，且會導致 VSCode Console 出現 [Sidecar Error]
warnings.filterwarnings("ignore", category=DeprecationWarning)
try:
    # 嘗試導入特定的警告類別以精確抑制
    from cryptography.utils import CryptographyDeprecationWarning
    warnings.filterwarnings("ignore", category=CryptographyDeprecationWarning)
except ImportError:
    pass

from camera_service import CameraService

# 嘗試自動安裝 paramiko 連線庫，確保開箱即用
try:
    import paramiko
except ImportError:
    import subprocess
    print("[Sidecar Log] paramiko not found, attempting to install via pip...", file=sys.stderr)
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"])
        print("[Sidecar Log] paramiko successfully installed!", file=sys.stderr)
    except Exception as inst_err:
        print(f"[Sidecar Log] Failed to auto-install paramiko: {str(inst_err)}", file=sys.stderr)

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
                
                if command == "listCameras":
                    cameras = CameraService.list_cameras()
                    self.send_response(request_id, {"success": True, "cameras": cameras})
                
                elif command == "startCamera":
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

                elif command == "checkRemoteEnvironment":
                    host = msg.get("host")
                    port = msg.get("port", 22)
                    username = msg.get("username")
                    password = msg.get("password")
                    
                    try:
                        import paramiko
                    except ImportError:
                        self.send_response(request_id, {
                            "command": "checkRemoteEnvironmentResult",
                            "success": False,
                            "error": "本地電腦缺少 paramiko 庫，請在本地終端機執行 'pip install paramiko'。"
                        })
                        continue

                    def do_diagnose():
                        ssh = paramiko.SSHClient()
                        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                        try:
                            ssh.connect(host, port=port, username=username, password=password, timeout=10)
                            
                            result = {
                                "cudaAvailable": False,
                                "gpuName": "",
                                "dockerRunning": False,
                                "gpuPassthrough": False,
                                "errors": []
                            }
                            
                            def run_cmd(cmd):
                                stdin, stdout, stderr = ssh.exec_command(cmd)
                                exit_status = stdout.channel.recv_exit_status()
                                return exit_status, stdout.read().decode('utf-8'), stderr.read().decode('utf-8')

                            # 1. 偵測 GPU
                            status, out, err = run_cmd('nvidia-smi --query-gpu=name --format=csv,noheader')
                            if status == 0:
                                result["cudaAvailable"] = True
                                result["gpuName"] = out.strip() or "NVIDIA GPU"
                            else:
                                result["errors"].append(f"無法偵測到 NVIDIA GPU。詳情: {err.strip() or 'nvidia-smi 執行失敗'}")

                            # 2. 偵測 Docker
                            status, out, err = run_cmd('docker info')
                            if status == 0:
                                result["dockerRunning"] = True
                            else:
                                result["errors"].append(f"Docker 服務未執行或無存取權限。詳情: {err.strip() or 'docker info 執行失敗'}")

                            # 3. 偵測 Container Toolkit
                            status, out, err = run_cmd('docker run --help')
                            if status == 0 and '--gpus' in out:
                                result["gpuPassthrough"] = True
                            else:
                                result["errors"].append(f"未偵測到 Docker --gpus 參數支援。詳情: {err.strip() or '--gpus 參數不可用'}")

                            self.send_response(request_id, {
                                "command": "checkRemoteEnvironmentResult",
                                "success": True,
                                "status": result
                            })
                        except Exception as e:
                            self.send_response(request_id, {
                                "command": "checkRemoteEnvironmentResult",
                                "success": False,
                                "error": f"SSH 連線失敗: {str(e)}"
                            })
                        finally:
                            ssh.close()

                    threading.Thread(target=do_diagnose, daemon=True).start()

                elif command == "uploadDataset":
                    host = msg.get("host")
                    port = msg.get("port", 22)
                    username = msg.get("username")
                    password = msg.get("password")
                    project_name = msg.get("projectName", "dataset")
                    local_zip_path = msg.get("localZipPath")

                    try:
                        import paramiko
                    except ImportError:
                        self.send_response(request_id, {
                            "command": "datasetUploadResult",
                            "success": False,
                            "error": "本地電腦缺少 paramiko 庫，請在本地終端機執行 'pip install paramiko'。"
                        })
                        continue

                    def do_upload():
                        ssh = paramiko.SSHClient()
                        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                        try:
                            # 1. 建立 SSH 連線
                            ssh.connect(host, port=port, username=username, password=password, timeout=15)
                            
                            # 2. 探測遠端的 Homedir
                            stdin, stdout, stderr = ssh.exec_command('echo $HOME')
                            homedir = stdout.read().decode('utf-8').strip() or ('/home/' + username)
                            
                            import socket
                            machine_id = socket.gethostname() or 'Unknown_PC'
                            
                            remote_base_dir = f"{homedir}/cocoya_ai/sessions/{machine_id}/dataset"
                            remote_project_dir = f"{remote_base_dir}/{project_name}"
                            remote_zip_path = f"{remote_base_dir}/{project_name}_temp.zip"

                            # 建立遠端目錄
                            ssh.exec_command(f'mkdir -p "{remote_project_dir}"')

                            # 3. 建立 SFTP 連線並上傳檔案
                            print(f"[Sidecar Log] Starting SFTP upload from {local_zip_path} to {remote_zip_path}", file=sys.stderr)
                            sftp = ssh.open_sftp()
                            sftp.put(local_zip_path, remote_zip_path)
                            sftp.close()
                            print(f"[Sidecar Log] SFTP upload completed", file=sys.stderr)

                            # 4. 在遠端執行 Python 一鍵解壓縮（用單引號包圍整段 Python，路徑用雙引號）
                            ez = remote_zip_path.replace("'", "\\'")
                            et = remote_project_dir.replace("'", "\\'")
                            unzip_cmd = (
                                "python3 -c '"
                                "import zipfile, os; "
                                'z = zipfile.ZipFile("' + ez + '", "r"); '
                                'z.extractall("' + et + '"); '
                                "z.close(); "
                                'os.remove("' + ez + '"); '
                                "print(\"OK\")"
                                "'"
                            )
                            stdin, stdout, stderr = ssh.exec_command(unzip_cmd)
                            exit_status = stdout.channel.recv_exit_status()
                            out = stdout.read().decode('utf-8').strip()
                            err = stderr.read().decode('utf-8').strip()

                            if exit_status == 0 and "OK" in out:
                                self.send_response(request_id, {
                                    "command": "datasetUploadResult",
                                    "success": True
                                })
                            else:
                                self.send_response(request_id, {
                                    "command": "datasetUploadResult",
                                    "success": False,
                                    "error": f"遠端解壓失敗: {err or out or '原因未知'}"
                                })

                        except Exception as e:
                            self.send_response(request_id, {
                                "command": "datasetUploadResult",
                                "success": False,
                                "error": f"SSH/SFTP 上傳失敗: {str(e)}"
                            })
                        finally:
                            ssh.close()
                            # 嘗試刪除本地暫存 ZIP 檔
                            try:
                                if os.path.exists(local_zip_path):
                                    os.remove(local_zip_path)
                            except:
                                pass

                    threading.Thread(target=do_upload, daemon=True).start()
                
                elif command == "trainLocal":
                    project_name = msg.get("projectName", "training_project")
                    task_type = msg.get("taskType", "classifier")
                    dataset_dir = msg.get("datasetDir", "")
                    output_dir = msg.get("outputDir", "")
                    hyperparams = msg.get("hyperparams", {})
                    
                    print(f"[Sidecar Log] Starting local training: {project_name} ({task_type})", file=sys.stderr)
                    
                    def do_train():
                        try:
                            import subprocess
                            import sys
                            
                            # 通用訓練腳本路徑（使用實際的訓練腳本）
                            script_path = os.path.join(os.path.dirname(__file__), "..", "..", "train_templates", task_type, "classifier_train.py")
                            
                            if not os.path.exists(script_path):
                                self.send_response(request_id, {
                                    "success": False,
                                    "error": f"訓練模板不存在: {script_path}"
                                })
                                return
                            
                            # 準備命令列參數
                            cmd = [
                                sys.executable,
                                script_path,
                                f"--project_name={project_name}",
                                f"--dataset_dir={dataset_dir}",
                                f"--output_dir={output_dir}",
                                f"--model_type=mobilenetv2",
                                f"--epochs={hyperparams.get('epochs', 30)}",
                                f"--batch_size={hyperparams.get('batchSize', 32)}",
                                f"--learning_rate={hyperparams.get('learningRate', 0.001)}"
                            ]
                            
                            print(f"[Sidecar Log] Executing: {' '.join(cmd)}", file=sys.stderr)
                            
                            # 執行訓練腳本
                            process = subprocess.Popen(
                                cmd,
                                stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE,
                                text=True,
                                bufsize=1,
                                universal_newlines=True
                            )
                            
                            # 解析訓練結果
                            training_result = {
                                "success": False,
                                "modelDir": output_dir,
                                "projectName": project_name
                            }
                            
                            # 即時傳送輸出到前端
                            for line in process.stdout:
                                line = line.strip()
                                self.send_event("trainingLog", {"message": line})
                                
                                # 解析 RESULT JSON
                                if line.startswith("RESULT:"):
                                    try:
                                        result_json = line.split("RESULT:", 1)[1].strip()
                                        training_result = json.loads(result_json)
                                    except Exception as e:
                                        print(f"[Sidecar Log] Failed to parse RESULT JSON: {e}", file=sys.stderr)
                            
                            process.wait()
                            
                            if process.returncode == 0 and training_result.get("success"):
                                # 訓練成功，回傳完整結果
                                self.send_response(request_id, {
                                    "success": True,
                                    "modelDir": training_result.get("modelDir", output_dir),
                                    "projectName": training_result.get("projectName", project_name),
                                    "accuracy": training_result.get("accuracy"),
                                    "epochs": training_result.get("epochs"),
                                    "curvePath": training_result.get("curvePath"),
                                    "historyPath": training_result.get("historyPath"),
                                    "reportPath": training_result.get("reportPath")
                                })
                            else:
                                stderr_output = process.stderr.read()
                                self.send_response(request_id, {
                                    "success": False,
                                    "error": f"訓練失敗 (exit code {process.returncode}): {stderr_output}"
                                })
                                
                        except Exception as e:
                            self.send_response(request_id, {
                                "success": False,
                                "error": f"訓練過程發生錯誤: {str(e)}"
                            })
                    
                    threading.Thread(target=do_train, daemon=True).start()

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
