"""遠端 SSH／訓練指令（P2-3 自 dataset_sidecar.py 抽出）。

涵蓋四個指令 handler：
- `handle_check_remote_environment`：遠端 GPU／Docker／Container Toolkit 診斷
- `handle_upload_dataset`：SFTP 上傳 ZIP + 遠端 python3 解壓
- `handle_train_remote`：SSH 連線 → 資料 smart sync → 模板 smart sync → Docker 訓練 → SFTP 下載
- `handle_stop_training`：`docker rm -f` 中斷遠端訓練容器

**純搬移，未改任何邏輯**（以機械式抽取 + 逐行取代 `self.send_*` / `self._remote_train`
→ 注入參數，內容與原實作逐行一致）。回呼以參數注入以維持 dataset_sidecar 的
stdout 單一 JSON 契約，並避免循環 import。

paramiko 延遲載入且**不自動安裝**（P1-5）：缺裝時回報 `SSH_PARAMIKO_MISSING`，
由前端 i18n 顯示安裝指引。
"""

import os
import re
import sys
import tempfile
import threading
import zipfile

# 缺 paramiko 時的錯誤碼（與 dataset_sidecar.PARAMIKO_MISSING 一致）
PARAMIKO_MISSING = "SSH_PARAMIKO_MISSING"

# task_type → 遠端訓練腳本相對路徑（容器內 bind mount 於 /workspace）
# ⚠ serial 為「預留、模板未實作」—— train_templates/serial/ 不存在，走到這裡必失敗。
#   見 docs/dataset_types_matrix.md §3 G2；前端 exportUseCases 亦擋下 serial 匯出，故目前不可達。
REMOTE_SCRIPTS = {
    "object_detection": "object_detection/object_detection_train.py",
    "line_following": "line_following/line_following_train.py",
    "table": "table/table_train.py",
    "feature": "feature/feature_train.py",
    "serial": "serial/serial_train.py",
}
REMOTE_SCRIPT_DEFAULT = "image_classification/image_classification_train.py"

# 遠端/本地清單比對的 mtime 容差（秒）——避免浮點時間戳造成每次都判定「已變更」
MTIME_TOLERANCE_SECONDS = 2

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def _require_paramiko():
    """匯入 paramiko；缺裝時回傳 (None, errorCode)。不自動 pip 安裝（P1-5）。"""
    try:
        import paramiko as _paramiko
        return _paramiko, None
    except ImportError:
        return None, PARAMIKO_MISSING


def resolve_remote_script(task_type):
    """task_type → 遠端腳本相對路徑（未知類型回退 image_classification）。"""
    return REMOTE_SCRIPTS.get(str(task_type).lower(), REMOTE_SCRIPT_DEFAULT)


def build_container_name(project_name):
    """容器名稱：非 [alnum._-] 字元一律換成底線。"""
    safe = ''.join(ch if (ch.isalnum() or ch in '_.-\\') else '_' for ch in str(project_name))


def _unzip_command(remote_zip, remote_target):
    """遠端解壓命令（保留原實作之單引號跳脫寫法，純搬移）。"""
    ez = remote_zip.replace("'", "'\\''")
    et = remote_target.replace("'", "'\\''")
    return (
        "python3 -c '"
        "import zipfile, os; "
        'z = zipfile.ZipFile("' + ez + '", "r"); '
        'z.extractall("' + et + '"); '
        "z.close(); "
        'os.remove("' + ez + '"); '
        'print("OK")'
        "'"
    )


def _scan_remote_listing(run, remote_dir):
    """列出遠端目錄檔案，回傳 (exit_code, {rel: (size, mtime)})。"""
    code, out, _ = run('eval find "' + remote_dir + '" -type f -printf "%P\\t%s\\t%T@\\n" 2>/dev/null')
    files = {}
    if code == 0:
        for ln in out.splitlines():
            parts = ln.split("\t")
            if len(parts) >= 3:
                try:
                    files[parts[0]] = (int(parts[1]), float(parts[2]))
                except ValueError:
                    pass
    return code, files


def _walk_local_map(local_root):
    """掃描本地目錄，回傳 {rel_posix: (size, mtime)}。"""
    result = {}
    for root, dirs, files in os.walk(local_root):
        for fn in files:
            fp = os.path.join(root, fn)
            rel = os.path.relpath(fp, local_root).replace(os.sep, "/")
            st = os.stat(fp)
            result[rel] = (st.st_size, int(st.st_mtime))
    return result


def _changed_files(local_map, remote_map):
    """smart 同步比對：回傳需上傳的檔名清單。"""
    changed = []
    for rel, (sz, mt) in local_map.items():
        r = remote_map.get(rel)
        if r is None or r[0] != sz or abs(r[1] - mt) > MTIME_TOLERANCE_SECONDS:
            changed.append(rel)
    return changed


def _zip_and_put(ssh, run, changed, local_root, remote_dir_real, zip_name):
    """把變更檔案打包上傳並於遠端解壓。"""
    fd, zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for rel in changed:
                zf.write(os.path.join(local_root, rel.replace("/", os.sep)), rel)
        sftp = ssh.open_sftp()
        remote_zip = remote_dir_real + "/" + zip_name
        sftp.put(zip_path, remote_zip)
        sftp.close()
        c, o, e = run(_unzip_command(remote_zip, remote_dir_real))
        if not (c == 0 and "OK" in o):
            raise RuntimeError("遠端解壓失敗: " + (e or o or "原因未知"))
    finally:
        try:
            os.remove(zip_path)
        except Exception:
            pass


def _docker_command(docker_image, container, remote_dataset_dir, remote_keras_cache,
                    remote_output_dir, remote_templates_real, script_rel,
                    project_name, hyperparams, remote_model_output):
    """組出 docker run 命令字串（純搬移原實作之引號寫法）。"""
    return (
        'docker run --gpus all --rm '
        '--entrypoint python3 '
        '--name ' + str(container) + ' '
        '-v "$(eval realpath ' + remote_dataset_dir + ')\":/dataset '
        '-v "$(eval realpath ' + remote_keras_cache + ')\":/root/.keras/models '
        '-v "$(eval realpath ' + remote_output_dir + ')\":/output '
        '-v "' + remote_templates_real + '":/workspace '
        + docker_image + ' /workspace/' + script_rel +
        ' --dataset_dir /dataset' +
        ' --output_dir /output' +
        ' --project_name ' + str(project_name) +
        ' --epochs ' + str(hyperparams.get("epochs", 30)) +
        ' --batch_size ' + str(hyperparams.get("batchSize", 32)) +
        ' --learning_rate ' + str(hyperparams.get("learningRate", 0.001)) +
        ' --validation_split ' + str(hyperparams.get("validationSplit", 0.2)) +
        ' --dropout ' + str(hyperparams.get("dropout", 0.2)) +
        ' --augmentation ' + str(hyperparams.get("augmentation", "true")).lower() +
        ' --backbone ' + str(hyperparams.get("backbone", "mobilenetv2")) +
        ' --optimizer ' + str(hyperparams.get("optimizer", "adam")) +
        ' --dnn_layers ' + str(hyperparams.get("dnnLayers", "128,64")) +
        ' --fine_tune ' + str(hyperparams.get("fineTune", "false")).lower() +
        ' --model_output ' + str(remote_model_output)
    )


def _strip_longpath_prefix(path):
    """Rust canonicalize 啟動 sidecar 時 __file__ 可能帶 \\?\ 前綴，
    該模式下 Windows 不正規化分隔符，混合斜線路徑會炸 WinError 123 → 剝掉前綴。"""
    if path.startswith("\\\\?\\"):
        return path[4:]
    return path


# ---------------------------------------------------------------------------
# checkRemoteEnvironment
# ---------------------------------------------------------------------------




def handle_check_remote_environment(msg, request_id, send_response):
    host = msg.get("host")
    port = msg.get("port", 22)
    username = msg.get("username")
    password = msg.get("password")
    
    paramiko, _pk_err = _require_paramiko()
    if _pk_err:
        send_response(request_id, {
            "command": "checkRemoteEnvironmentResult",
            "success": False,
            "errorCode": _pk_err,
            "error": "paramiko not installed"
        })
        return  # P2-3：原為 continue（跳過 dispatch 迴圈），函式化後等價於結束本 handler

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

            send_response(request_id, {
                "command": "checkRemoteEnvironmentResult",
                "success": True,
                "status": result
            })
        except Exception as e:
            send_response(request_id, {
                "command": "checkRemoteEnvironmentResult",
                "success": False,
                "error": f"SSH 連線失敗: {str(e)}"
            })
        finally:
            ssh.close()

    threading.Thread(target=do_diagnose, daemon=True).start()


# ---------------------------------------------------------------------------
# uploadDataset
# ---------------------------------------------------------------------------


def handle_upload_dataset(msg, request_id, send_response):
    host = msg.get("host")
    port = msg.get("port", 22)
    username = msg.get("username")
    password = msg.get("password")
    project_name = msg.get("projectName", "dataset")
    local_zip_path = msg.get("localZipPath")

    paramiko, _pk_err = _require_paramiko()
    if _pk_err:
        send_response(request_id, {
            "command": "datasetUploadResult",
            "success": False,
            "errorCode": _pk_err,
            "error": "paramiko not installed"
        })
        return  # P2-3：原為 continue（跳過 dispatch 迴圈），函式化後等價於結束本 handler

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
                send_response(request_id, {
                    "command": "datasetUploadResult",
                    "success": True
                })
            else:
                send_response(request_id, {
                    "command": "datasetUploadResult",
                    "success": False,
                    "error": f"遠端解壓失敗: {err or out or '原因未知'}"
                })

        except Exception as e:
            send_response(request_id, {
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


# ---------------------------------------------------------------------------
# trainRemote
# ---------------------------------------------------------------------------


def handle_train_remote(msg, request_id, send_response, send_event, get_state, set_state, tflite_converter):
    """遠端訓練（背景執行緒）。

    get_state/set_state 記錄訓練階段（供 stopTraining）；tflite_converter 為
    convert_keras_to_tflite（延遲注入避免循環 import）。
    """
    # 遠端訓練（RemoteTrainingRefactor D4/S6）：移植 mvp_hand_gesture 04/05/06 已驗證流程
    # 流程: SSH 連線 -> 資料同步(smart/always/skip) -> Docker 遠端訓練(只產 .keras+labels) -> SFTP 下載模型
    # 記錄訓練工作階段供 stopTraining 中斷用
    _pn = str(msg.get("projectName", "training_project"))
    _safe = "".join(ch if (ch.isalnum() or ch in "_.-") else "_" for ch in _pn)
    _state = {
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
            send_event("trainingLog", {"message": line})
        except Exception:
            pass
        print("[RemoteTrain] " + str(line), file=sys.stderr)

    def do_remote_train():
        ssh = None
        paramiko, _pk_err = _require_paramiko()
        if _pk_err:
            send_response(request_id, {"success": False, "errorCode": _pk_err, "error": "paramiko not installed"})
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
            send_response(request_id, {"success": False, "error": "SSH 連線失敗: " + str(e)})
            return
        if not local_dataset_dir or not os.path.isdir(local_dataset_dir):
            send_response(request_id, {"success": False, "error": "找不到本地資料集目錄: " + str(local_dataset_dir)})
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
            # --- 資料同步 + 模板 smart 同步 ---
            # P2-3：155 行已抽出至 remote_sync.sync_dataset() / sync_templates()
            # 延遲 import：remote_sync 反向引用本模組的 helper（頂層 import 會成循環）
            from remote_sync import sync_dataset, sync_templates
            sync_dataset(ssh, run, local_dataset_dir, remote_dataset_dir, sync_mode, rt_log)
            remote_templates_real = sync_templates(ssh, run, remote_base, rt_log)

            # --- 遠端 Docker 訓練 + 產物下載 + 本地 TFLite 轉換 ---
            # P2-3：164 行已抽出至 remote_docker.run_docker_training()
            # 延遲 import：remote_docker 反向引用本模組的 helper（頂層 import 會成循環）
            from remote_docker import run_docker_training
            send_response(request_id, run_docker_training(
                ssh, run, project_name, output_dir, hyperparams, docker_image,
                remote_dataset_dir, remote_output_dir, remote_templates_real,
                local_dataset_dir, rt_log, tflite_converter,
                set_state=set_state, get_state=get_state,
            ))
        except Exception as e:
            rt_log("[Remote] 錯誤: " + str(e))
            set_state(None)
            send_response(request_id, {"success": False, "error": str(e)})
        finally:
            try:
                if ssh is not None:
                    ssh.close()
            except Exception:
                pass

    threading.Thread(target=do_remote_train, daemon=True).start()


# ---------------------------------------------------------------------------
# stopTraining
# ---------------------------------------------------------------------------


def handle_stop_training(request_id, send_response, send_event, get_state, set_state):
    # 中斷遠端訓練：另開 SSH 連線 docker rm -f 容器（--rm 容器被強制移除即終止）
    info = get_state()
    if not info:
        send_response(request_id, {"success": False, "error": "目前沒有進行中的遠端訓練"})
    else:
        def do_stop():
            paramiko, _pk_err = _require_paramiko()
            if _pk_err:
                send_response(request_id, {"success": False, "errorCode": _pk_err, "error": "paramiko not installed"})
                set_state(None)
                return
            try:
                ssh2 = paramiko.SSHClient()
                ssh2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                ssh2.connect(hostname=info["host"], port=info["port"], username=info["username"], password=info["password"], timeout=10)
                _, o2, e2 = ssh2.exec_command("docker rm -f " + str(info["container"]) + " 2>&1")
                out2 = o2.read().decode("utf-8", "replace").strip()
                ssh2.close()
                send_event("trainingLog", {"message": "[Remote] 已送出中斷指令: " + (out2 or "docker rm -f")})
                send_response(request_id, {"success": True})
            except Exception as e:
                send_response(request_id, {"success": False, "error": "中斷失敗: " + str(e)})
            finally:
                set_state(None)
        threading.Thread(target=do_stop, daemon=True).start()
