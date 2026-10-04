import sys
import json
import time
import os
import csv
import shutil
import threading
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

# ⚠️ 強制 UTF-8 I/O（AGENTS.md「Python 子進程編碼鐵律」第 (4) 項）。
#
#   為什麼必要：stdout 的**寫出**編碼不由父進程的 Popen(encoding=...) 決定 ——
#   那是父進程的「讀取解碼器」。子進程寫出時用的是自己的 stdout 編碼，
#   在 Windows 上預設跟隨系統 ANSI codepage（CI 的 GitHub runner 是 **cp1252**）。
#
#   本檔的診斷訊息幾乎都是中文（`[Sidecar Log] ...`），一旦在 cp1252 環境執行，
#   print() 會在寫入階段直接拋 UnicodeEncodeError —— 而 stdout 還承載著
#   對 Host 的 JSON 回應，一次崩潰會讓整條命令鏈無回應（症狀與病因完全無關）。
#
#   訓練模板（*_train.py）已有同樣的防護，這裡是 sidecar 端補齊。
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from camera_service import CameraService
# P2-3：本地 Keras → TFLite 轉換已抽出為獨立模組（原本夾在 trainRemote 分支中）
from remote_tflite import convert_keras_to_tflite
# P2-3：本地訓練（trainLocal）已抽出為獨立模組
from local_training import start_train_local_async
# P2-3：遠端 SSH／訓練（checkRemoteEnvironment／uploadDataset／trainRemote／stopTraining）已抽出
from remote_ssh import (
    handle_check_remote_environment,
    handle_upload_dataset,
    handle_train_remote,
    handle_stop_training,
)

# Windows: 隱藏子進程 console（Tauri 為 GUI subsystem，避免 python pip 安裝彈出黑視窗）
if os.name == 'nt':
    _HIDE = 0x08000000
    _POPEN = dict(creationflags=_HIDE)
else:
    _HIDE = 0
    _POPEN = dict()

# paramiko 缺裝錯誤碼（P1-5，2026-10-03）
# 舊實作在此處未經使用者同意直接 `pip install paramiko`，會在未告知的情況下
# 修改全域 Python 環境（離線必失敗、可能觸及權限提升）。現改為純降級：
# 需要 paramiko 的指令（checkRemoteEnvironment / uploadDataset / trainRemote /
# stopTraining）一律回報本碼，由前端 i18n 顯示安裝指引。
# 安裝途徑：Python 環境設定面板（config/python_modules.json 已含 paramiko 條目）。
PARAMIKO_MISSING = "SSH_PARAMIKO_MISSING"


def _require_paramiko():
    """匯入 paramiko；缺裝時回傳 (None, errorCode)。不再自動 pip 安裝（P1-5）。"""
    try:
        import paramiko as _paramiko
        return _paramiko, None
    except ImportError:
        return None, PARAMIKO_MISSING


class DatasetSidecar:
    def __init__(self):
        self.camera = CameraService()
        self.running = True
        self.last_camera_running = False
        self.feature = None  # MediaPipeService lazy 實例（collectFeature 首次使用才初始化）

    # --- 遠端訓練狀態存取（P2-3：供 remote_ssh 模組以回呼注入使用，避免循環 import）---
    def _get_remote_state(self):
        """目前進行中的遠端訓練階段（供 stopTraining 中斷用）；無則 None。"""
        return getattr(self, "_remote_train", None)

    def _set_remote_state(self, state):
        """設定／清除遠端訓練階段。"""
        self._remote_train = state

    def _get_feature_service(self):
        """取得（惰性初始化）MediaPipe 特徵服務。回 None 表示缺裝。"""
        if self.feature is None:
            try:
                from media_pipe_service import MediaPipeService
                self.feature = MediaPipeService()
            except Exception:
                self.feature = None
        return self.feature
    @staticmethod
    def _src_abs_in_staging(source_dir, rel_path):
        rel = (rel_path or '').replace('\\', '/').lstrip('/')
        if not rel or os.path.isabs(rel) or '..' in rel.split('/'):
            return None
        p = os.path.normpath(os.path.join(source_dir, rel))
        if not p.startswith(os.path.normpath(source_dir) + os.sep):
            return None
        return p
    @staticmethod
    def _flatten_images_for_training(source_dir, samples_list):
        imgs = os.path.join(source_dir, 'images')
        os.makedirs(imgs, exist_ok=True)
        flat_map = {}
        copied, missing = 0, 0
        for s in samples_list:
            src_p = DatasetSidecar._src_abs_in_staging(source_dir, s.get('image_path', ''))
            if not src_p:
                continue
            if not os.path.isfile(src_p):
                missing += 1
                continue
            rel = (s.get('image_path', '') or '').replace('\\', '/').lstrip('/')
            base = os.path.basename(rel)
            stem, ext = os.path.splitext(base)
            flat = base
            if flat in flat_map and flat_map[flat] != src_p:
                parent = rel.split('/')[0] if '/' in rel else ''
                if parent and parent != base:
                    cand = parent + '_' + base
                else:
                    cand = stem + '_2' + ext
                if cand in flat_map and flat_map[cand] != src_p:
                    i = 3
                    while (stem + '_' + str(i) + ext) in flat_map:
                        i += 1
                    cand = stem + '_' + str(i) + ext
                flat = cand
            flat_map[flat] = src_p
            dst = os.path.join(imgs, flat)
            if not os.path.exists(dst):
                shutil.copy2(src_p, dst)
                copied += 1
        print('[Sidecar Log] images/ flat: copy %d, missing %d' % (copied, missing), file=sys.stderr)
        return flat_map



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
                
                elif command == "getCameraStatus":
                    self.send_response(request_id, {
                        "success": True,
                        "running": self.camera.is_running(),
                    })

                elif command == "startCamera":
                    device_id = msg.get("deviceId", 0)
                    success = self.camera.start(device_id)
                    if success:
                        # 啟動成功顯式推送一次狀態（不依賴 0.5s monitor 差分），
                        # 讓前端啟動分支能立即同步；Ctrl+R 後 sidecar 殘留 running
                        # 時 start() 早退 True，此事件保證前端仍收到明確狀態。
                        self.send_event("cameraStatus", {"running": True})
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

                elif command == "collectFeature":
                    # M4：特徵採集——取目前相機幀 → MediaPipe 提取 Hand/Pose landmarks → 回傳
                    # 前端持有 schema（featureSchema.js）與 row 組裝，sidecar 僅回傳原始 landmark 結構。
                    label = msg.get("label", "unlabeled")
                    use_z = bool(msg.get("useZ", False))
                    print(f"[Sidecar Log] Collecting feature for label: {label} (use_z={use_z})", file=sys.stderr)

                    if not self.camera.is_running():
                        self.send_response(request_id, {"success": False, "error": "攝影機預覽已關閉"})
                        continue

                    frame = self.camera.get_current_frame()
                    if frame is None:
                        self.send_response(request_id, {"success": False, "error": "尚無可用影像幀"})
                        continue

                    svc = self._get_feature_service()
                    if svc is None or not getattr(svc, "enabled", False):
                        self.send_response(request_id, {
                            "success": False,
                            "errorCode": "FEATURE_MEDIAPIPE_MISSING",
                            "error": "MediaPipe 未安裝或初始化失敗，無法採集特徵"
                        })
                        continue

                    try:
                        result = svc.extract_landmarks(frame, use_z=use_z)
                    except Exception as e:
                        print(f"[Sidecar Log] Feature extraction failed: {str(e)}", file=sys.stderr)
                        self.send_response(request_id, {"success": False, "error": "特徵提取失敗: " + str(e)})
                        continue

                    if not result.get("available"):
                        self.send_response(request_id, {
                            "success": False,
                            "errorCode": "FEATURE_MEDIAPIPE_MISSING",
                            "error": "MediaPipe 不可用，無法採集特徵"
                        })
                        continue

                    self.send_response(request_id, {
                        "success": True,
                        "label": label,
                        "useZ": use_z,
                        "hand_detected": result.get("hand_detected", False),
                        "pose_detected": result.get("pose_detected", False),
                        "hand": result.get("hand"),
                        "pose": result.get("pose")
                    })

                elif command == "exportDataset":
                    source_dir = msg.get("sourceDir")
                    output_zip = msg.get("outputZip")
                    print(f"[Sidecar Log] Exporting dataset from {source_dir} to {output_zip}", file=sys.stderr)
                    
                    try:
                        from dataset_io import DatasetIO
                        if not os.path.exists(source_dir):
                            raise Exception(f"Source directory does not exist: {source_dir}")

                        # 2026-09-22 OD 對齊：偵測/循跡分支會把「非訓練佈局的頂層
                        # 資料夾」（即 DM 工作用 <label>/ 原始副本）加入此清單，
                        # ZIP 只留 images/+labels/（lines/）+dataset.json+labels.txt；
                        # 磁碟不刪（staging 為 temp；VSIX 舊路徑直接對 source_dir 打包亦安全）。
                        zip_exclude = set()
                        # 檢查是否有 dataset.json，若有 annotations 則寫入 YOLO labels
                        spec_path = os.path.join(source_dir, "dataset.json")
                        if os.path.exists(spec_path):
                            with open(spec_path, 'r', encoding='utf-8') as f:
                                spec = json.load(f)
                            
                            project_type = spec.get("project", {}).get("type", "")
                            samples = spec.get("data_source", {}).get("samples", [])
                            
                            if project_type == "object_detection" and samples:
                                flat_map = DatasetSidecar._flatten_images_for_training(source_dir, samples)
                                mpath = os.path.join(source_dir, "export_manifest.json")
                                relmap = {}
                                for k in sorted(flat_map.keys()):
                                    relmap[k] = os.path.relpath(flat_map[k], source_dir).replace(chr(92), "/")
                                with open(mpath, "w", encoding="utf-8") as f:
                                    json.dump(relmap, f, ensure_ascii=False, indent=2)
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
                                skipped_neg = 0
                                skipped_empty = 0
                                for sample in samples:
                                    image_path = sample.get("image_path", "")
                                    annotations = sample.get("annotations", [])
                                    
                                    if not image_path or not annotations:
                                        skipped_empty += 1
                                        continue
                                    src_abs = DatasetSidecar._src_abs_in_staging(source_dir, image_path)
                                    stem = None
                                    if src_abs is not None:
                                        for flat, pp in flat_map.items():
                                            if pp == src_abs:
                                                stem = os.path.splitext(flat)[0]
                                                break
                                    if stem is None:
                                        skipped_empty += 1
                                        continue
                                    label_filepath = os.path.join(labels_dir, stem + ".txt")
                                    wrote = 0
                                    # 配對檔名已由扁平化決定
                                    
                                    
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
                                                if isinstance(class_id, int) and class_id < 0:
                                                    skipped_neg += 1
                                                    continue
                                                f.write(f"{class_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")
                                                wrote += 1
                                    if wrote == 0 and os.path.exists(label_filepath):
                                        os.remove(label_filepath)
                                
                                print(f"[Sidecar Log] Wrote YOLO labels for {len(samples)} images", file=sys.stderr)
                                if skipped_neg:
                                    print("[Sidecar Log] warn: skip unclassified boxes", file=sys.stderr)
                                if skipped_empty:
                                    print("[Sidecar Log] unannotated or missing samples skipped", file=sys.stderr)

                            elif project_type in ("table", "feature") and samples:
                                # M-T1：表格 → data.csv；M4：feature 同款分流 → data.csv
                                # （欄序 = schema.columns 順序，UTF-8；truncated 警告沿用）
                                columns = spec.get("schema", {}).get("columns", [])
                                col_names = [c.get("name", "") for c in columns if c.get("name")]
                                csv_path = os.path.join(source_dir, "data.csv")
                                with open(csv_path, 'w', encoding='utf-8', newline='') as f:
                                    writer = csv.writer(f)
                                    writer.writerow(col_names)
                                    for sample in samples:
                                        writer.writerow([sample.get(name, "") for name in col_names])
                                print(f"[Sidecar Log] Wrote data.csv: {len(col_names)} columns, {len(samples)} rows", file=sys.stderr)
                                if spec.get("stats", {}).get("samples_truncated"):
                                    print(f"[Sidecar Log] 警告: 表格樣本超過 2000 筆上限，dataset.json 僅保留前 2000 筆，訓練資料亦以此為限", file=sys.stderr)

                            elif project_type == "line_following" and samples:
                                flat_map = DatasetSidecar._flatten_images_for_training(source_dir, samples)
                                # M-L1：循線 → lines/ 目錄（每張標註影像一個同名 .txt，一行 x1 y1 x2 y2 歸一化比例座標）
                                lines_dir = os.path.join(source_dir, "lines")
                                os.makedirs(lines_dir, exist_ok=True)
                                total, written = 0, 0
                                for sample in samples:
                                    total += 1
                                    annotations = sample.get("annotations", [])
                                    if not annotations:
                                        continue
                                    line = annotations[0].get("line")
                                    if not line or len(line) != 4:
                                        continue
                                    src_abs = DatasetSidecar._src_abs_in_staging(source_dir, sample.get("image_path", ""))
                                    stem = None
                                    if src_abs is not None:
                                        for flat, pp in flat_map.items():
                                            if pp == src_abs:
                                                stem = os.path.splitext(flat)[0]
                                                break
                                    if stem is None:
                                        continue
                                    txt_name = stem + ".txt"
                                    txt_path = os.path.join(lines_dir, txt_name)
                                    with open(txt_path, 'w', encoding='utf-8') as f:
                                        f.write(f"{line[0]:.6f} {line[1]:.6f} {line[2]:.6f} {line[3]:.6f}\n")
                                    written += 1
                                print(f"[Sidecar Log] Wrote lines/ for {written}/{total} images", file=sys.stderr)
                                if total > 0 and written < total / 2:
                                    print(f"[Sidecar Log] 警告: 超過半數影像未標註線段（未標註 {total - written}/{total}），訓練資料量可能不足", file=sys.stderr)

                            # 2026-09-22：偵測/循跡 ZIP 去重——排除所有非訓練佈局的
                            # 頂層資料夾（DM 工作用 <label>/ 副本；images/ labels/ lines/ 保留）。
                            if project_type in ("object_detection", "line_following") and samples:
                                keep = {"images", "labels", "lines"}
                                for entry in os.listdir(source_dir):
                                    full = os.path.join(source_dir, entry)
                                    if os.path.isdir(full) and entry not in keep:
                                        zip_exclude.add(entry)
                                if zip_exclude:
                                    print(f"[Sidecar Log] ZIP 排除冗餘原始標籤資料夾: {sorted(zip_exclude)}", file=sys.stderr)
                       
                        # 注意：只能打包一次——舊 code 曾殘留第二個無 exclude 的
                        # export_dataset 呼叫，會把去重後的 ZIP 又覆寫回雙份佈局。
                        result_path = DatasetIO.export_dataset(
                            source_dir, output_zip,
                            exclude_top_dirs=(sorted(zip_exclude) if zip_exclude else None)
                        )
                        self.send_response(request_id, {"success": True, "path": result_path})
                    except Exception as e:
                        print(f"[Sidecar Log] Export failed: {str(e)}", file=sys.stderr)
                        self.send_response(request_id, {"success": False, "error": str(e)})

                elif command == "checkRemoteEnvironment":
                    # P2-3：71 行已抽出至 remote_ssh.handle_check_remote_environment()
                    handle_check_remote_environment(msg, request_id, self.send_response)

                elif command == "uploadDataset":
                    # P2-3：91 行已抽出至 remote_ssh.handle_upload_dataset()
                    handle_upload_dataset(msg, request_id, self.send_response)

                elif command == "trainRemote":
                    # P2-3：396 行已抽出至 remote_ssh.handle_train_remote()
                    handle_train_remote(
                        msg, request_id, self.send_response, self.send_event,
                        get_state=self._get_remote_state, set_state=self._set_remote_state,
                        tflite_converter=convert_keras_to_tflite,
                    )

                elif command == "stopTraining":
                    # P2-3：25 行已抽出至 remote_ssh.handle_stop_training()
                    handle_stop_training(
                        request_id, self.send_response, self.send_event,
                        get_state=self._get_remote_state, set_state=self._set_remote_state,
                    )

                elif command == "trainLocal":
                    # P2-3：110 行已抽出至 local_training.start_train_local_async()
                    start_train_local_async(
                        msg, request_id, self.send_response, self.send_event,
                        popen_kwargs=_POPEN,
                    )

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
