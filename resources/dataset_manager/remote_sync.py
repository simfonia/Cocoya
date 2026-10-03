"""遠端 smart 同步（P2-3 自 remote_ssh.py 抽出）。

兩段流程，皆為「本地/遠端檔案清單比對 → 只上傳變更項」：
- `sync_dataset`：資料集（sync_mode = smart／always／skip）
- `sync_templates`：訓練模板（smart only，D13/D12；**本地模板必須存在**，
  掃不到時直接報錯——絕不可當作「已是最新」）

**純搬移，未改邏輯。** 抽出的理由：這是遠端訓練鏈中最長、且有獨立診斷價值的一段
（2026-09-23 的 smart sync 異常診斷 log 就在此），混在 800 行的 do_remote_train
裡難以閱讀與測試。
"""

import os

from remote_ssh import (
    _changed_files,
    _scan_remote_listing,
    _unzip_command,
    _walk_local_map,
    _zip_and_put,
)


def sync_dataset(ssh, run, local_dataset_dir, remote_dataset_dir, sync_mode, log):
    """資料集同步。log 為日誌回呼（rt_log）。回傳無（結果僅經 log 回報）。"""
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
        # 診斷（2026-09-23）：remote 清單恆 0 → smart 比對失效、每次全數上傳；
        # find 錯誤已被 2>/dev/null 吃掉，這裡把退出碼與「空清單」狀態顯形。
        if code_ls != 0 and not remote_files:
            log("[Remote] 遠端資料集清單讀取失敗 (find exit=" + str(code_ls) +
                   ")，將退化為全數上傳")
        elif not remote_files and local_files:
            log("[Remote] 遠端資料集清單為空（本地 " + str(len(local_files)) +
                   " 檔）——遠端目錄可能被清空，或 find 未回傳可解析輸出")
        if sync_mode == "always":
            changed = list(local_files.keys())
        else:
            changed = []
            for rel, (sz, mt) in local_files.items():
                r = remote_files.get(rel)
                if r is None or r[0] != sz or abs(r[1] - mt) > 2:
                    changed.append(rel)
        log("[Remote] 同步檢查(sync=" + sync_mode + "): 本地 " + str(len(local_files)) + " 檔，需上傳 " + str(len(changed)) + " 檔")
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
                log("[Remote] 同步完成")
            finally:
                try:
                    os.remove(tmp_zip)
                except Exception:
                    pass
    else:
        log("[Remote] sync=skip: 略過上傳，直接使用遠端現有資料")
def sync_templates(ssh, run, remote_base, log, base_dir=None):
    """訓練模板 smart 同步。bind mount 至容器 /workspace。"""
    import tempfile
    import zipfile

    # 根因修正：Rust canonicalize 啟動 sidecar 時 __file__ 可能帶 \\?\ 前綴，
    # 該模式下 Windows 不正規化分隔符，混合斜線路徑會炸 WinError 123 → 剝掉前綴
    base = base_dir or os.path.dirname(os.path.abspath(__file__))
    local_templates_root = os.path.abspath(os.path.join(
        base, "..", "..", "resources", "train_templates"))
    if local_templates_root.startswith("\\\\?\\"):
        local_templates_root = local_templates_root[4:]
    remote_templates_root = remote_base + "/templates"
    run('eval mkdir -p "' + remote_templates_root + '"')
    c_treal, o_treal, _ = run('eval realpath "' + remote_templates_root + '"')
    remote_templates_real = o_treal.strip().splitlines()[-1] \
        if c_treal == 0 and o_treal.strip() else remote_templates_root

    tmpl_local = _walk_local_map(local_templates_root)
    code_lt, tmpl_remote = _scan_remote_listing(run, remote_templates_real)
    # 診斷（2026-09-23）：遠端清單恆 0 時 smart 比對失效、每次全數上傳
    #（結果仍正確但失去增量）；將退出碼與空清單狀態顯形。
    if code_lt != 0 and not tmpl_remote:
        log("[Remote] 模板清單讀取失敗 (find exit=" + str(code_lt) + ")，將退化為全數上傳")
    elif not tmpl_remote and tmpl_local:
        log("[Remote] 遠端模板清單為空（本地 " + str(len(tmpl_local)) +
            " 檔）——遠端 templates 目錄可能被清空，或 find 未回傳可解析輸出")
    if not tmpl_local:
        # 防誤判：本地掃不到模板 = 路徑錯誤，絕不可當作「已是最新」
        raise RuntimeError(
            "本地模板目錄不存在或為空: " + local_templates_root +
            " (遠端現有 " + str(len(tmpl_remote)) + " 檔)，請檢查 sidecar 安裝位置")
    tmpl_changed = _changed_files(tmpl_local, tmpl_remote)
    log("[Remote] 模板同步檢查: 本地 " + str(len(tmpl_local)) + " 檔，遠端 " +
        str(len(tmpl_remote)) + " 檔，需上傳 " + str(len(tmpl_changed)) + " 檔")
    if tmpl_changed:
        log("[Remote] 模板同步: 偵測到 " + str(len(tmpl_changed)) + " 個模板變更，上傳中...")
        _zip_and_put(ssh, run, tmpl_changed, local_templates_root,
                     remote_templates_real, "_cocoya_templates.zip")
        log("[Remote] 模板同步完成 (bind mount /workspace)")
    else:
        log("[Remote] 模板已是最新，無需上傳")
    return remote_templates_real
