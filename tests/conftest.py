r"""
tests/conftest.py — pytest 全域設定與共用夾具（P2-1 T4，2026-10-03）

【為何需要】
temp_scripts/e2e_*.py 原本是 9 支一次性驗證腳本：寫完有效，隨後被重構
靜默腐化（實測 5 支失效），且因位於 gitignore 目錄、不被任何 CI 執行，
腐化長期無人察覺。本檔將它們轉為常設測試。

【設計原則】
1. **不改變被測行為**：每支腳本的斷言邏輯逐字保留，只改執行框架。
2. **隔離性**：全部使用 pytest 的 tmp_path，不依賴任何外部資料集。
   原 e2e_export_check.py 硬編碼本機路徑（使用者桌面資料集），
   換台機器就失敗 —— 這是它失效的主因之一。
3. **可分層執行**：-m "not slow" 跳過需實際訓練的慢速測試。

【sys.path 陷阱（2026-10-03 實踩）】
不要把 resources/train_templates/common 直接加進 sys.path。
該目錄有 __init__.py，且內部模組使用 from common.xxx import 的
package-relative 寫法；只加子目錄會讓 common 這個套件名解析不到
（實測 ModuleNotFoundError: No module named 'common'）。
正解是加入**父目錄** resources/train_templates。

【本檔使用 raw 字串的原因】
上方說明提及 Windows 路徑含反斜線，非 raw docstring 會被當跳脫序列
（實測 SyntaxError: truncated \UXXXXXXXX escape）。
"""
import os
import sys

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAIN_TEMPLATES = os.path.join(REPO_ROOT, "resources", "train_templates")
SIDECAR_DIR = os.path.join(REPO_ROOT, "resources", "dataset_manager")

# 父目錄（非 common/ 本身）—— 見模組 docstring 的說明
if TRAIN_TEMPLATES not in sys.path:
    sys.path.insert(0, TRAIN_TEMPLATES)


def pytest_configure(config):
    """註冊 slow 標記（執行時用 -m "not slow" 跳過慢速測試）。"""
    config.addinivalue_line(
        "markers", "slow: 需實際訓練，耗時數十秒（預設仍會執行，可 -m 'not slow' 略過）")


def pytest_collection_modifyitems(config, items):
    """訓練組測試預設標記為 slow（實測 task_type_rename 需 ~50 秒）。"""
    for item in items:
        if "train" in item.nodeid.lower() and "not slow" in config.getoption("-m", ""):
            item.add_marker(pytest.mark.slow)


@pytest.fixture(scope="session")
def repo_root():
    return REPO_ROOT


@pytest.fixture
def png_bytes():
    """回傳產生一張 16x16 PNG 的函式（測試內建資料集用，免外部檔案）。"""
    import io

    import numpy as np
    from PIL import Image

    def _make(fmt="JPEG", size=(16, 16)):
        arr = np.random.randint(0, 255, (size[0], size[1], 3), dtype=np.uint8)
        buf = io.BytesIO()
        Image.fromarray(arr).save(buf, format=fmt)
        return buf.getvalue()

    return _make


@pytest.fixture
def write_image(tmp_path):
    """回傳 (path, fmt) -> None，把影像寫到指定路徑並自動建父目錄。"""
    import io

    import numpy as np
    from PIL import Image

    def _write(path, fmt="JPEG", size=(16, 16)):
        path.parent.mkdir(parents=True, exist_ok=True)
        arr = np.random.randint(0, 255, (size[0], size[1], 3), dtype=np.uint8)
        Image.fromarray(arr).save(str(path), fmt)

    return _write
