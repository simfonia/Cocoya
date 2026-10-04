# -*- coding: utf-8 -*-
"""E2E：驗證 todo backlog「匯出 staging 路徑驗證」的兩個疑點是否仍成立。

背景（log/todo.md 2026-09-17 backlog 原始描述）：
  ① Tauri export_dataset 只複製 sourceFolderPath，live 模式該值為 null
     → 疑似 live 匯出 ZIP 只有 dataset.json、沒有照片。
  ② VSIX handleDatasetExport 用 workspaceFolders[0] 而非專案根 dataset/<名>
     → 疑似 xml 居子資料夾時取錯目錄。

本腳本自足（不依賴本機遺留路徑），模擬「live 落盤真相」佈局並走真實 sidecar
exportDataset 路徑，驗證 ZIP 是否含影像。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIDECAR_DIR = os.path.join(REPO, "resources", "dataset_manager")

# 1x1 合法 JPEG（最小可解碼影像）
JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300"
    + "08060607060508070707090908090a0c140d0c0b0b0c191213"
    + "0f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30"
    + "313434341f27393d38323c2e333432"
    + "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000000009ffda0008010100003f00fbfe8a28a2803fffd9"
)


def _png_pillow():
    try:
        from PIL import Image
        return "pillow"
    except ImportError:
        return None


def write_image(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if _png_pillow() == "pillow":
        from PIL import Image
        Image.new("RGB", (4, 4), (200, 40, 40)).save(path, format="JPEG")
        return
    with open(path, "wb") as f:
        f.write(JPEG)


def make_live_layout(root, project_name, ptype, labels):
    """建立 live 落盤真相佈局：dataset/<名>/<label>/*.jpg + dataset.json"""
    ds = os.path.join(root, "dataset", project_name)
    samples = []
    for i, label in enumerate(labels):
        for k in range(2):
            fn = "%s_%d.jpg" % (label, k)
            write_image(os.path.join(ds, label, fn))
            samples.append({"image_path": "%s/%s" % (label, fn)})
    spec = {
        "project": {"name": project_name, "type": ptype},
        "data_source": {"samples": samples},
        "schema": {"label_map": {name: i for i, name in enumerate(labels)}},
    }
    os.makedirs(ds, exist_ok=True)
    with open(os.path.join(ds, "dataset.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
    return ds, spec


def run_sidecar_export(source_dir, output_zip):
    """啟動真實 sidecar 走 exportDataset，走 stdin/stdout JSON。"""
    proc = subprocess.Popen(
        [sys.executable, "-u", "dataset_sidecar.py"],
        cwd=SIDECAR_DIR,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    try:
        proc.stdin.write(json.dumps({
            "command": "ping", "requestId": "p0"}) + "\n")
        proc.stdin.flush()
        proc.stdout.readline()  # ping 回應

        proc.stdin.write(json.dumps({
            "command": "exportDataset",
            "requestId": "e1",
            "sourceDir": source_dir,
            "outputZip": output_zip,
        }) + "\n")
        proc.stdin.flush()
        line = proc.stdout.readline()
        return json.loads(line)
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
        proc.kill()
        proc.wait(timeout=10)


def zip_entries(path):
    with zipfile.ZipFile(path) as z:
        return z.namelist()


def check(project_name, ptype, labels):
    """回傳 (passed: bool, detail: str)"""
    tmp = tempfile.mkdtemp(prefix="cocoya_export_verify_")
    try:
        root = os.path.join(tmp, "proj")
        ds, _ = make_live_layout(root, project_name, ptype, labels)
        out_zip = os.path.join(tmp, project_name + ".zip")
        resp = run_sidecar_export(ds, out_zip)
        if not resp.get("success"):
            return False, "sidecar 匯出失敗: %s" % resp

        names = zip_entries(resp["path"])
        imgs = [n for n in names if n.lower().endswith((".jpg", ".jpeg", ".png"))]
        has_spec = any(n.endswith("dataset.json") for n in names)

        # 疑點①的核心斷言：live 落盤影像必須進到 ZIP
        if not imgs:
            return False, "ZIP 無任何影像（疑點①成立）：entries=%s" % names[:20]
        if not has_spec:
            return False, "ZIP 缺 dataset.json：entries=%s" % names[:20]
        if len(imgs) != len(labels) * 2:
            return False, "影像數不符：期望 %d，實際 %d" % (len(labels) * 2, len(imgs))
        return True, "OK 影像 %d 張 ＋ dataset.json，entries=%s" % (len(imgs), sorted(set(
            n.split('/')[0] for n in names)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_export_live_layout(tmp_path):
    cases = [
        ("live_image", "image", ["none", "paper"]),
        ("live_detector", "object_detection", ["redBall", "blueBall"]),
        ("live_line", "line_following", ["track"]),
    ]
    failed = 0
    for name, ptype, labels in cases:
        ok, detail = check(name, ptype, labels)
        print(("  PASS  " if ok else "  FAIL  ") + "%-14s %s" % (name, detail))
        if not ok:
            failed += 1
    print("\n%s" % ("ALL PASS" if failed == 0 else "FAILED: %d" % failed))
