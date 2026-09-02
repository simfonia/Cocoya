import sys
import json
import time
import os
import threading
import importlib
import tempfile
import tempfile
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
                
                if command == "ping":
                    # 輕量健康檢查指令，立即回覆，不執行任何耗時操作
                    self.send_response(request_id, {"success": True})

                elif command == "listCameras":
                    cameras = CameraService.list_cameras()
                    self.send_response(request_id, {"success": True, "cameras": cameras})
                
                elif command == "startCamera":
                    device_id = msg.get("deviceId", 0)
                    success = self.camera.start(device_id)
                    self.send_response(request_id, {"success": success})
                
                elif command == "stopCamera":
                    self.camera.stop()
                    self.send_event("cameraStatus", {"running": False})
                    self.send_response(request_id, {"success": True})
                
                elif command == "captureImage":
                    save_path = msg.get("savePath")
                    label = msg.get("label", "unlabeled")
                    print(f"[Sidecar Log] Capturing image for label: {label}", file=sys.stderr)
                    
                    if not self.camera.is_running():
                        self.send_response(request_id, {"success": False, "error": "攝影機預覽已關閉"})
                        continue
                    
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
                        from dataset_io import DatasetIO
                        if not os.path.exists(source_dir):
                            raise Exception(f"Source directory does not exist: {source_dir}")
                        
                        # 檢查是否有 dataset.json，若有 annotations 則寫入 YOLO labels
                        spec_path = os.path.join(source_dir, "dataset.json")
                        if os.path.exists(spec_path):
                            with open(spec_path, 'r', encoding='utf-8') as f:
                                spec = json.load(f)
                            
                            project_type = spec.get("project", {}).get("type", "")
                            samples = spec.get("data_source", {}).get("samples", [])
                            
                            if project_type == "object_detection" and samples:
                                labels_dir = os.path.join(source_dir, "labels")
                                os.makedirs(labels_dir, exist_ok=True)
                                
                                # 寫入 labels.txt（類別名稱）
                                label_map = spec.get("schema", {}).get("label_map", {})
                                if label_map:
                                    # 依 class_id 排序
                                    sorted_labels = sorted(label_map.items(), key=lambda x: x[1])
                                    labels_txt_path = os.path.join(source_dir, "labels.txt")
                                    with open(labels_txt_path, 'w', encoding='utf-8') as f:
                                        for name, cid in sorted_labels:
                                            f.write(f"{name}\n")
                                    print(f"[Sidecar Log] Wrote labels.txt with {len(sorted_labels)} classes", file=sys.stderr)
                                
                                # 為每張影像寫入 YOLO label 檔案
                                for sample in samples:
                                    image_path = sample.get("image_path", "")
                                    annotations = sample.get("annotations", [])
                                    
                                    if not image_path or not annotations:
                                        continue
                                    
                                    # 取得影像檔名（不含副檔名）
                                    img_filename = os.path.basename(image_path)
                                    label_filename = os.path.splitext(img_filename)[0] + ".txt"
                                    label_filepath = os.path.join(labels_dir, label_filename)
                                    
                                    with open(label_filepath, 'w') as f:
                                        for ann in annotations:
                                            if "bbox" in ann and "class_id" in ann:
                                                bbox = ann["bbox"]
                                                class_id = ann["class_id"]
                                                # bbox 格式: [x, y, w, h]（比例座標）
                                                # YOLO 格式: class_id cx cy w h
                                                # Dataset Manager 的 bbox 已經是 [x, y, w, h]（左上角 + 寬高）
                                                # 需要轉換為 YOLO 的 [cx, cy, w, h]（中心點 + 寬高）
                                                x, y, w, h = bbox[0], bbox[1], bbox[2], bbox[3]
                                                cx = x + w / 2
                                                cy = y + h / 2
                                                f.write(f"{class_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")
                                
                                print(f"[Sidecar Log] Wrote YOLO labels for {len(samples)} images", file=sys.stderr)
                        
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
                
                elif command == "trainRemote":
                    # 遠端訓練（RemoteTrainingRefactor D4/S6）：移植 mvp_hand_gesture 04/05/06 已驗證流程
                    # 流程: SSH 連線 -> 資料同步(smart/always/skip) -> Docker 遠端訓練(只產 .keras+labels) -> SFTP 下載模型
                    # 記錄訓練工作階段供 stopTraining 中斷用
                    _pn = str(msg.get("projectName", "training_project"))
                    _safe = "".join(ch if (ch.isalnum() or ch in "_.-") else "_" for ch in _pn)
                    self._remote_train = {
                        "host": msg.get("host"), "port": msg.get("port", 22),
                        "username": msg.get("username"), "password": msg.get("password"),
                        "container": "cocoya_train_" + _safe
                    }
                    host = msg.get("host")
                    port = msg.get("port", 22)
                    username = msg.get("username")
                    password = msg.get("password")
                    local_dataset_dir = msg.get("localDatasetDir", "")
                    project_name = msg.get("projectName", "training_project")
                    sync_mode = msg.get("syncMode", "smart")
                    hyperparams = msg.get("hyperparams", {})
                    output_dir = msg.get("outputDir", "")
                    docker_image = msg.get("dockerImage", "cocoya-train-classifier")

                    def rt_log(line):
                        try:
                            self.send_event("trainingLog", {"message": line})
                        except Exception:
                            pass
                        print("[RemoteTrain] " + str(line), file=sys.stderr)

                    def do_remote_train():
                        ssh = None
                        try:
                            import paramiko
                        except ImportError:
                            self.send_response(request_id, {"success": False, "error": "本地電腦缺少 paramiko 庫，請在本地終端機執行 'pip install paramiko'。"})
                            return
                        # 先連 SSH 再驗本地資料集（錯誤診斷順序：連線問題優先呈現）
                        try:
                            import socket
                            import zipfile
                            import tempfile

                            ssh = paramiko.SSHClient()
                            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                            rt_log("[Remote] 連線中: " + str(username) + "@" + str(host) + ":" + str(port) + " (timeout 15s)")
                            ssh.connect(hostname=host, port=port, username=username, password=password, timeout=15)
                            rt_log("[Remote] SSH 連線成功")
                        except Exception as e:
                            self.send_response(request_id, {"success": False, "error": "SSH 連線失敗: " + str(e)})
                            return
                        if not local_dataset_dir or not os.path.isdir(local_dataset_dir):
                            self.send_response(request_id, {"success": False, "error": "找不到本地資料集目錄: " + str(local_dataset_dir)})
                            return
                        try:

                            def run(cmd):
                                stdin, stdout, stderr = ssh.exec_command(cmd)
                                out = stdout.read().decode("utf-8", "replace")
                                err = stderr.read().decode("utf-8", "replace")
                                code2 = stdout.channel.recv_exit_status()
                                return code2, out, err

                            machine_id = socket.gethostname()
                            remote_base = "~/cocoya_ai/sessions/" + machine_id
                            remote_dataset_dir = remote_base + "/dataset/" + project_name
                            remote_output_dir = remote_base + "/models/" + project_name
                            run('eval mkdir -p "' + remote_dataset_dir + '" "' + remote_output_dir + '"')
                            # --- 資料同步 ---
                            if sync_mode != "skip":
                                local_files = {}
                                for root, dirs, files in os.walk(local_dataset_dir):
                                    for fn in files:
                                        fp = os.path.join(root, fn)
                                        rel = os.path.relpath(fp, local_dataset_dir).replace(os.sep, "/")
                                        st = os.stat(fp)
                                        local_files[rel] = (st.st_size, int(st.st_mtime))
                                code_ls, out_ls, _ = run('eval find "' + remote_dataset_dir + '" -type f -printf "%P\\t%s\\t%T@\\n" 2>/dev/null')
                                remote_files = {}
                                if code_ls == 0:
                                    for ln in out_ls.splitlines():
                                        parts = ln.split("\t")
                                        if len(parts) >= 3:
                                            try:
                                                remote_files[parts[0]] = (int(parts[1]), float(parts[2]))
                                            except ValueError:
                                                pass
                                if sync_mode == "always":
                                    changed = list(local_files.keys())
                                else:
                                    changed = []
                                    for rel, (sz, mt) in local_files.items():
                                        r = remote_files.get(rel)
                                        if r is None or r[0] != sz or abs(r[1] - mt) > 2:
                                            changed.append(rel)
                                rt_log("[Remote] 同步檢查(sync=" + sync_mode + "): 本地 " + str(len(local_files)) + " 檔，需上傳 " + str(len(changed)) + " 檔")
                                if changed:
                                    tmp_fd, tmp_zip = tempfile.mkstemp(suffix=".zip")
                                    os.close(tmp_fd)
                                    try:
                                        with zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                                            for rel in changed:
                                                zf.write(os.path.join(local_dataset_dir, rel.replace("/", os.sep)), rel)
                                        sftp = ssh.open_sftp()
                                        # SFTP 不展開 ~，需以 realpath 取得遠端絕對路徑
                                        c_rd, o_rd, _ = run('eval realpath "' + remote_dataset_dir + '"')
                                        remote_dataset_real = o_rd.strip().splitlines()[-1] if c_rd == 0 and o_rd.strip() else remote_dataset_dir
                                        remote_zip = remote_dataset_real + "/_cocoya_sync.zip"
                                        sftp.put(tmp_zip, remote_zip)
                                        sftp.close()
                                        ez = remote_zip.replace("'", "'\\''")
                                        et = remote_dataset_real.replace("'", "'\\''")
                                        unzip_cmd = (
                                            "python3 -c '"
                                            "import zipfile, os; "
                                            'z = zipfile.ZipFile("' + ez + '", "r"); '
                                            'z.extractall("' + et + '"); '
                                            "z.close(); "
                                            'os.remove("' + ez + '"); '
                                            'print("OK")'
                                            "'"
                                        )
                                        c3, o3, e3 = run(unzip_cmd)
                                        if not (c3 == 0 and "OK" in o3):
                                            raise RuntimeError("遠端解壓失敗: " + (e3 or o3 or "原因未知"))
                                        rt_log("[Remote] 同步完成")
                                    finally:
                                        try:
                                            os.remove(tmp_zip)
                                        except Exception:
                                            pass
                            else:
                                rt_log("[Remote] sync=skip: 略過上傳，直接使用遠端現有資料")
                            # --- 模板 smart 同步（只上傳變更 ++ 自動，D13/D12）---
                            # 根因修正：Rust canonicalize 啟動 sidecar 時 __file__ 可能帶 \\?\ 前綴，
                            # \\?\ 模式下 Windows 不正規化分隔符，混合斜線路徑會炸 WinError 123 → 剝掉前綴
                            local_templates_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "resources", "train_templates"))
                            if local_templates_root.startswith("\\\\?\\"):
                                local_templates_root = local_templates_root[4:]
                            remote_templates_root = remote_base + "/templates"
                            run('eval mkdir -p "' + remote_templates_root + '"')
                            c_treal, o_treal, _ = run('eval realpath "' + remote_templates_root + '"')
                            remote_templates_real = o_treal.strip().splitlines()[-1] if c_treal == 0 and o_treal.strip() else remote_templates_root
                            tmpl_local = {}
                            for troot, tdirs, tfiles in os.walk(local_templates_root):
                                for fn in tfiles:
                                    fp = os.path.join(troot, fn)
                                    rel = os.path.relpath(fp, local_templates_root).replace(os.sep, "/")
                                    st = os.stat(fp)
                                    tmpl_local[rel] = (st.st_size, int(st.st_mtime))
                            code_lt, out_lt, _ = run('eval find "' + remote_templates_real + '" -type f -printf "%P\\t%s\\t%T@\\n" 2>/dev/null')
                            tmpl_remote = {}
                            if code_lt == 0:
                                for ln in out_lt.splitlines():
                                    parts = ln.split("\t")
                                    if len(parts) >= 3:
                                        try:
                                            tmpl_remote[parts[0]] = (int(parts[1]), float(parts[2]))
                                        except ValueError:
                                            pass
                            tmpl_changed = []
                            for rel, (sz, mt) in tmpl_local.items():
                                r = tmpl_remote.get(rel)
                                if r is None or r[0] != sz or abs(r[1] - mt) > 2:
                                    tmpl_changed.append(rel)
                            if not tmpl_local:
                                # 防誤判：本地掃不到模板 = 路徑錯誤，絕不可當作「已是最新」
                                raise RuntimeError(
                                    "本地模板目錄不存在或為空: " + local_templates_root +
                                    " (遠端現有 " + str(len(tmpl_remote)) + " 檔)，請檢查 sidecar 安裝位置")
                            rt_log("[Remote] 模板同步檢查: 本地 " + str(len(tmpl_local)) + " 檔，遠端 " + str(len(tmpl_remote)) + " 檔，需上傳 " + str(len(tmpl_changed)) + " 檔")
                            if tmpl_changed:
                                rt_log("[Remote] 模板同步: 偵測到 " + str(len(tmpl_changed)) + " 個模板變更，上傳中...")
                                t_fd, t_zip = tempfile.mkstemp(suffix=".zip")
                                os.close(t_fd)
                                try:
                                    with zipfile.ZipFile(t_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                                        for rel in tmpl_changed:
                                            zf.write(os.path.join(local_templates_root, rel.replace("/", os.sep)), rel)
                                    sftp_t = ssh.open_sftp()
                                    tzip_remote = remote_templates_real + "/_cocoya_templates.zip"
                                    sftp_t.put(t_zip, tzip_remote)
                                    sftp_t.close()
                                    tez = tzip_remote.replace("'", "'\\''")
                                    tgt = remote_templates_real.replace("'", "'\\''")
                                    unzip_cmd = (
                                        "python3 -c '"
                                        "import zipfile, os; "
                                        'z = zipfile.ZipFile("' + tez + '", "r"); '
                                        'z.extractall("' + tgt + '"); '
                                        "z.close(); "
                                        'os.remove("' + tez + '"); '
                                        'print("OK")'
                                        "'"
                                    )
                                    c_tz, o_tz, e_tz = run(unzip_cmd)
                                    if not (c_tz == 0 and "OK" in o_tz):
                                        raise RuntimeError("遠端模板解壓失敗: " + (e_tz or o_tz or "原因未知"))
                                    rt_log("[Remote] 模板同步完成 (bind mount /workspace)")
                                finally:
                                    try:
                                        os.remove(t_zip)
                                    except Exception:
                                        pass
                            else:
                                rt_log("[Remote] 模板已是最新，無需上傳")

                            # --- 遠端 Docker 訓練 (cocoya classifier_train.py v2) ---
                            task_type = str(hyperparams.get("taskType", "classifier")).lower()
                            if task_type == "detector":
                                script_rel = "object_detection/object_detection_train.py"
                            elif task_type == "line_follower":
                                script_rel = "line_following/line_following_train.py"
                            elif task_type == "table":
                                script_rel = "table/table_train.py"
                            elif task_type == "feature":
                                script_rel = "feature/feature_train.py"
                            elif task_type == "serial":
                                script_rel = "serial/serial_train.py"
                            else:
                                script_rel = "classifier/classifier_train.py"
                            epochs = hyperparams.get("epochs", 30)
                            batch_size = hyperparams.get("batchSize", 32)
                            lr = hyperparams.get("learningRate", 0.001)
                            user_model_output = str(hyperparams.get("modelOutput", "none"))
                            # D10/D15 鐵律：TFLite 只在本地轉。遠端只依使用者選擇產 keras。
                            # 選 none → 遠端只產報告/數據 (--model_output none)；其餘 → 遠端只產 keras (--model_output keras)
                            remote_model_output = "keras" if user_model_output != "none" else "none"
                            # 訓練前清空遠端 output 目錄：同專案前次訓練的殘留會污染下載清單與掃描
                            run('eval rm -rf "' + remote_output_dir + '" && mkdir -p "' + remote_output_dir + '"')
                            rt_log("[Remote] 啟動 Docker 訓練容器: " + docker_image + " (task=" + task_type + ", model_output=" + remote_model_output + ", bind=/workspace)")
                            docker_cmd = (
                                'docker run --gpus all --rm '
                                '--entrypoint python3 '
                                '--name ' + str(self._remote_train.get("container")) + ' '
                                '-v "$(eval realpath ' + remote_dataset_dir + ')\":/dataset '
                                '-v "$(eval realpath ' + remote_output_dir + ')\":/output '
                                '-v "' + remote_templates_real + '":/workspace '
                                + docker_image + ' /workspace/' + script_rel +
                                ' --dataset_dir /dataset' +
                                ' --output_dir /output' +
                                ' --project_name ' + str(project_name) +
                                ' --epochs ' + str(epochs) +
                                ' --batch_size ' + str(batch_size) +
                                ' --learning_rate ' + str(lr) +
                                ' --validation_split ' + str(hyperparams.get("validationSplit", 0.2)) +
                                ' --dropout ' + str(hyperparams.get("dropout", 0.2)) +
                                ' --augmentation ' + str(hyperparams.get("augmentation", "true")).lower() +
                                ' --backbone ' + str(hyperparams.get("backbone", "mobilenetv2")) +
                                ' --optimizer ' + str(hyperparams.get("optimizer", "adam")) +
                                ' --dnn_layers ' + str(hyperparams.get("dnnLayers", "128,64")) +
                                ' --fine_tune ' + str(hyperparams.get("fineTune", "false")).lower() +
                                ' --model_output ' + str(remote_model_output)
                            )
                            stdin, stdout, stderr = ssh.exec_command(docker_cmd)
                            # 對齊本地訓練輸出：decode UTF-8、剝除 ANSI 色碼、把 \r 更新切成行；
                            # Keras 進度條每 epoch 只留最後一行摘要（含 val_accuracy 的完整行）
                            import re as _re
                            _ansi = _re.compile(r"\x1b\[[0-9;]*m")
                            for raw in stdout:
                                text = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw
                                text = _ansi.sub("", text)
                                # 對齊本地：每個 step 各自一行（Keras \r 原地更新 → 切成一行的進度更新）
                                for part in text.replace("\r", "\n").split("\n"):
                                    part = part.strip()
                                    if not part:
                                        continue
                                    rt_log(part)
                            exit_status = stdout.channel.recv_exit_status()
                            err_output = stderr.read().decode("utf-8", "replace").strip()
                            if err_output:
                                rt_log("[stderr] " + err_output)
                            if exit_status != 0:
                                raise RuntimeError("遠端訓練失敗 (exit code: " + str(exit_status) + ")")

                            # --- 下載模型 (.keras + labels.txt)；TFLite 一律本地轉（鐵律 D9） ---
                            code_rp, out_rp, _ = run('eval realpath "' + remote_output_dir + '"')
                            remote_out_real = out_rp.strip().splitlines()[-1] if out_rp.strip() else remote_output_dir
                            os.makedirs(output_dir, exist_ok=True)
                            sftp = ssh.open_sftp()
                            downloaded = []
                            for attr in sftp.listdir_attr(remote_out_real):
                                fn = attr.filename
                                # 只下載當前專案的產物 + labels.txt；跳過殘留的舊專案檔
                                # （遠端 output 目錄共用且不清空，舊 keras 會被誤下載）
                                if not fn or fn.startswith("."):
                                    continue
                                if user_model_output == "none" and fn.endswith(".keras"):
                                    continue
                                if not (fn.startswith(project_name) or fn == "labels.txt"):
                                    continue
                                local_path = os.path.join(output_dir, fn)
                                sftp.get(remote_out_real + "/" + fn, local_path)
                                downloaded.append(fn)
                            sftp.close()
                            rt_log("[Remote] 已下載: " + ", ".join(downloaded))
                            if user_model_output != "none":
                                rt_log("[Remote] 訓練完成！.keras 已下載，TFLite 將於本地依 model_output=" + user_model_output + " 轉換")
                            self._remote_train = None
                            # 掃描本地產物路徑（對齊本地 classifier_train 命名），供前端開啟報告/模型
                            def _pick(pred):
                                for fn in os.listdir(output_dir):
                                    if pred(fn):
                                        return os.path.join(output_dir, fn)
                                return None
                            report_path = _pick(lambda f: f.endswith("_training_report.html"))
                            # 選 none 時不掃 keras：避免本地殘留的舊 keras 被誤報為本次產物
                            keras_path = _pick(lambda f: f.endswith(".keras")) if user_model_output != "none" else None
                            curve_path = _pick(lambda f: f.endswith("_training_curve.png"))
                            history_path = _pick(lambda f: f.endswith("_training_history.json"))

                            # --- 本地 TFLite 轉換（D10/D15 鐵律：僅本地做；選項1：掃本地 dataset 建 representative） ---
                            tflite_paths = {}
                            if user_model_output != "none" and keras_path:
                                rt_log("[Remote] 於本地依 model_output=" + user_model_output + " 轉換 TFLite...")
                                try:
                                    import subprocess, sys, threading, time as _time
                                    convert_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_local_convert_tflite.py")
                                    if not os.path.isfile(convert_script):
                                        raise RuntimeError("轉換腳本不存在: " + convert_script)
                                    rt_log("[LocalTFLite] 本機 python: " + sys.executable)
                                    if importlib.util.find_spec("tensorflow") is None:
                                        raise RuntimeError("本機 python 未安裝 tensorflow，無法轉換 TFLite。請 pip install tensorflow (python=" + sys.executable + ")")
                                    # 子進程 + 乾淨環境：sidecar 承載自 Tauri 的環境雜訊會讓 TF import 卡死
                                    # （進程內 import 亦會因 Windows DLL loader lock 於工作執行緒卡死），
                                    # 故只繼承 python 必要的系統變數（本地訓練子進程即為乾淨環境，可正常轉換）
                                    _clean_keys = ("SystemRoot", "TEMP", "TMP", "PATH", "PATHEXT", "USERPROFILE",
                                                   "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMDATA",
                                                   "NUMBER_OF_PROCESSORS", "COMPUTERNAME", "USERNAME",
                                                   "HOMEDRIVE", "HOMEPATH", "WINDIR", "SYSTEMDRIVE")
                                    conv_env = {k: os.environ[k] for k in _clean_keys if k in os.environ}
                                    conv_env["PYTHONUNBUFFERED"] = "1"
                                    conv_env["PYTHONIOENCODING"] = "utf-8"
                                    conv_env["TF_DETERMINISTIC_OPS"] = "1"
                                    conv_env["TF_CUDNN_DETERMINISTIC"] = "1"
                                    conv_cmd = [
                                        sys.executable, convert_script,
                                        "--keras_path", keras_path,
                                        "--dataset_dir", local_dataset_dir,
                                        "--output_dir", output_dir,
                                        "--project_name", project_name,
                                        "--model_output", user_model_output
                                    ]
                                    CREATE_NO_WINDOW = 0x08000000
                                    p_conv = subprocess.Popen(conv_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                                              stdin=subprocess.DEVNULL,
                                                              universal_newlines=True, encoding="utf-8", errors="replace",
                                                              env=conv_env, creationflags=CREATE_NO_WINDOW)
                                    rt_log("[LocalTFLite] 轉換進程已啟動 (pid=" + str(p_conv.pid) + ", 乾淨環境)，import tensorflow 約數十秒，int8 量化掃樣本需數分鐘...")
                                    got_output = [False]
                                    def _watchdog():
                                        _time.sleep(60)
                                        if not got_output[0]:
                                            try:
                                                dump = os.path.join(tempfile.gettempdir(), "cocoya_sidecar_env_dump.txt")
                                                with open(dump, "w", encoding="utf-8") as f:
                                                    for k2 in sorted(os.environ):
                                                        f.write(k2 + "=" + str(os.environ[k2])[:300] + "\n")
                                                rt_log("[LocalTFLite] 警告: 子進程 60 秒無任何輸出（疑遭環境攔截），sidecar 環境變數已傾印: " + dump)
                                            except Exception:
                                                pass
                                    threading.Thread(target=_watchdog, daemon=True).start()
                                    for cline in p_conv.stdout:
                                        got_output[0] = True
                                        cline = cline.strip()
                                        if cline:
                                            rt_log("[LocalTFLite] " + cline)
                                    p_conv.wait()
                                    if p_conv.returncode != 0:
                                        raise RuntimeError("本地 TFLite 轉換失敗 (exit=" + str(p_conv.returncode) + ")")
                                    # 重新掃描 tflite 產出
                                    for fn2 in os.listdir(output_dir):
                                        if fn2.endswith(".tflite"):
                                            tflite_paths[fn2] = os.path.join(output_dir, fn2)
                                    rt_log("[Remote] 本地 TFLite 轉換完成: " + ", ".join(tflite_paths.keys()) if tflite_paths else "[Remote] 本地轉換無 tflite 產出")
                                except Exception as ce:
                                    rt_log("[Remote] 本地 TFLite 轉換失敗: " + str(ce))

                            self.send_response(request_id, {
                                "success": True,
                                "modelDir": output_dir,
                                "projectName": project_name,
                                "downloaded": downloaded,
                                "modelOutput": user_model_output,
                                "reportPath": report_path or "",
                                "kerasPath": keras_path or "",
                                "curvePath": curve_path or "",
                                "historyPath": history_path or "",
                                "tflitePaths": tflite_paths
                            })
                        except Exception as e:
                            rt_log("[Remote] 錯誤: " + str(e))
                            self._remote_train = None
                            self.send_response(request_id, {"success": False, "error": str(e)})
                        finally:
                            try:
                                if ssh is not None:
                                    ssh.close()
                            except Exception:
                                pass

                    threading.Thread(target=do_remote_train, daemon=True).start()

                elif command == "stopTraining":
                    # 中斷遠端訓練：另開 SSH 連線 docker rm -f 容器（--rm 容器被強制移除即終止）
                    info = getattr(self, "_remote_train", None)
                    if not info:
                        self.send_response(request_id, {"success": False, "error": "目前沒有進行中的遠端訓練"})
                    else:
                        def do_stop():
                            try:
                                import paramiko
                                ssh2 = paramiko.SSHClient()
                                ssh2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                                ssh2.connect(hostname=info["host"], port=info["port"], username=info["username"], password=info["password"], timeout=10)
                                _, o2, e2 = ssh2.exec_command("docker rm -f " + str(info["container"]) + " 2>&1")
                                out2 = o2.read().decode("utf-8", "replace").strip()
                                ssh2.close()
                                self.send_event("trainingLog", {"message": "[Remote] 已送出中斷指令: " + (out2 or "docker rm -f")})
                                self.send_response(request_id, {"success": True})
                            except Exception as e:
                                self.send_response(request_id, {"success": False, "error": "中斷失敗: " + str(e)})
                            finally:
                                self._remote_train = None
                        threading.Thread(target=do_stop, daemon=True).start()

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
