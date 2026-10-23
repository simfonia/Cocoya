"""
tests/e2e/test_camera_resource_release.py — 相機／Sidecar／MediaPipe 資源釋放回歸測試

【背景】2026-10-21 修正 Dataset Manager 即時採集流程的資源洩漏：
- camera_service.list_cameras() 在 read()/get() 拋錯時跳過 release()，累積 camera handle。
- camera_service.start() 開啟失敗時不 release；_run() 在例外路徑不釋放 cap。
- camera_service.stop() 非冪等，且逾時時不中斷阻塞中的 read()。
- media_pipe_service.close() 重複呼叫會對同一 solution 再 close()，句柄未清空。
- dataset_sidecar 的結束路徑（stdin 關閉／例外）不釋放相機與 MediaPipe。

【測試策略】以假的 cv2 / mediapipe 模組注入 sys.modules，模擬真實 OpenCV 句柄
語意（release 後 isOpened() 轉 False），斷言「每個開啟的 cap 都被釋放一次」、
「重複 stop 不會二次釋放」、「舊 session 執行緒不誤殺新 session」。
"""
import json
import os
import sys
import types

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIDECAR_DIR = os.path.join(REPO_ROOT, "resources", "dataset_manager")
if SIDECAR_DIR not in sys.path:
    sys.path.insert(0, SIDECAR_DIR)


class FakeCap:
    """假的 VideoCapture：以 released 旗標模擬 OpenCV 句柄語意。"""

    def __init__(self, device_id=0, opened=True, read_ok=True, read_raises=False):
        self.device_id = device_id
        self._opened = opened
        self._read_ok = read_ok
        self._read_raises = read_raises
        self.release_count = 0

    def isOpened(self):
        return self._opened and self.release_count == 0

    def read(self):
        if self._read_raises:
            raise RuntimeError("read boom")
        if not self._read_ok or self.release_count > 0:
            return False, None
        return True, [[0]]

    def get(self, prop):
        return 640

    def release(self):
        self.release_count += 1
        self._opened = False


class FakeCv2(types.ModuleType):
    """假的 cv2 模組：記錄所有建立與釋放的 cap，並模擬 HighGUI。"""

    CAP_PROP_FRAME_WIDTH = 3
    CAP_PROP_FRAME_HEIGHT = 4
    WINDOW_AUTOSIZE = 1
    WND_PROP_TOPMOST = 2
    WND_PROP_VISIBLE = 4

    def __init__(self):
        super().__init__("cv2")
        self.caps = []
        self.destroy_count = 0
        self.named_window_count = 0
        self.next_cap_kwargs = {}

    def VideoCapture(self, device_id=0):
        cap = FakeCap(device_id, **self.next_cap_kwargs)
        self.caps.append(cap)
        return cap

    def namedWindow(self, *args, **kwargs):
        self.named_window_count += 1

    def setWindowProperty(self, *args, **kwargs):
        pass

    def destroyAllWindows(self):
        self.destroy_count += 1

    def flip(self, frame, _code):
        return frame

    def imshow(self, *args, **kwargs):
        pass

    def waitKey(self, _delay):
        return -1

    def getWindowProperty(self, *args, **kwargs):
        return 1

    def imwrite(self, *args, **kwargs):
        return True

    def imencode(self, *args, **kwargs):
        return True, b"x"

    def cvtColor(self, frame, *args, **kwargs):
        return frame

    @property
    def live_caps(self):
        return [c for c in self.caps if c.release_count == 0]


@pytest.fixture
def fake_cv2(monkeypatch):
    cv2 = FakeCv2()
    monkeypatch.setitem(sys.modules, "cv2", cv2)
    # 重新載入 camera_service，確保它抓到假的 cv2
    monkeypatch.delitem(sys.modules, "camera_service", raising=False)
    import camera_service
    monkeypatch.setitem(sys.modules, "camera_service", camera_service)
    return cv2


@pytest.fixture
def camera(fake_cv2):
    import camera_service
    return camera_service.CameraService()


# ---------------------------------------------------------------------------
# camera_service：相機句柄釋放
# ---------------------------------------------------------------------------


def test_list_cameras_releases_caps_on_read_error(fake_cv2):
    """read() 拋錯時仍必須釋放 cap（原本會跳過 release，累積 camera handle）。"""
    fake_cv2.next_cap_kwargs = {"read_raises": True}
    import camera_service

    result = camera_service.CameraService.list_cameras(max_test=3)

    assert result == []
    assert len(fake_cv2.caps) >= 1
    assert fake_cv2.live_caps == [], "仍有未釋放的 VideoCapture handle"


def test_list_cameras_releases_caps_on_success(fake_cv2):
    """正常列出攝影機後，所有試探用的 cap 都必須釋放。"""
    import camera_service

    result = camera_service.CameraService.list_cameras(max_test=2)

    assert len(result) == 2
    assert fake_cv2.live_caps == []


def test_start_failure_releases_cap(fake_cv2):
    """開啟失敗（isOpened() 為 False）也必須 release。"""
    fake_cv2.next_cap_kwargs = {"opened": False}
    import camera_service

    svc = camera_service.CameraService()
    assert svc.start(0) is False
    assert fake_cv2.live_caps == []
    assert fake_cv2.caps[0].release_count == 1


def test_stop_releases_cap_and_is_idempotent(fake_cv2):
    """stop() 冪等：重複呼叫不重複釋放，且最後 cap 一定被釋放。"""
    import camera_service

    svc = camera_service.CameraService()
    assert svc.start(0) is True
    svc.stop()
    svc.stop()
    svc.stop()

    assert fake_cv2.live_caps == []
    assert fake_cv2.caps[0].release_count == 1


def test_run_thread_releases_cap_on_exception(fake_cv2):
    """_run 內 read() 拋錯時，finally 仍要釋放 cap。"""
    fake_cv2.next_cap_kwargs = {"read_raises": True}
    import camera_service

    svc = camera_service.CameraService()
    assert svc.start(0) is True
    thread = svc.thread
    assert thread is not None
    thread.join(timeout=3.0)
    assert not thread.is_alive()
    assert fake_cv2.live_caps == []
    assert fake_cv2.caps[0].release_count == 1


def test_restart_after_stop_does_not_leak(fake_cv2):
    """停止後重新啟動：兩個 session 的 cap 都必須釋放，且舊執行緒不誤殺新 session。"""
    import camera_service

    svc = camera_service.CameraService()
    assert svc.start(0) is True
    svc.stop()
    assert svc.start(0) is True
    svc.stop()

    assert fake_cv2.live_caps == []
    assert all(c.release_count == 1 for c in fake_cv2.caps)


# ---------------------------------------------------------------------------
# media_pipe_service：close() 冪等
# ---------------------------------------------------------------------------


class FakeSolution:
    def __init__(self):
        self.close_count = 0

    def close(self):
        self.close_count += 1


class _HandsFactory:
    def __init__(self, solution):
        self._solution = solution

    def Hands(self, **kwargs):
        return self._solution


class _PoseFactory:
    def __init__(self, solution):
        self._solution = solution

    def Pose(self, **kwargs):
        return self._solution


class FakeSolutions:
    """假的 mp.solutions：hands.Hands() / pose.Pose() 各自回傳一個可追蹤句柄。"""

    def __init__(self):
        self.hands_solution = FakeSolution()
        self.pose_solution = FakeSolution()
        self.hands = _HandsFactory(self.hands_solution)
        self.pose = _PoseFactory(self.pose_solution)


def test_media_pipe_close_is_idempotent(monkeypatch):
    """close() 重複呼叫：每個 solution 只 close 一次，句柄清空、服務停用。"""
    fake_mp = types.ModuleType("mediapipe")
    solutions = FakeSolutions()
    # ModuleType 沒有宣告 `solutions` 屬性 → 以 setattr 動態掛載
    setattr(fake_mp, "solutions", solutions)
    monkeypatch.setitem(sys.modules, "mediapipe", fake_mp)
    monkeypatch.delitem(sys.modules, "media_pipe_service", raising=False)
    import media_pipe_service

    svc = media_pipe_service.MediaPipeService()
    assert svc.enabled is True
    assert svc._hands is not None and svc._pose is not None

    svc.close()
    svc.close()

    assert svc._hands is None and svc._pose is None
    assert svc.enabled is False
    assert solutions.hands_solution.close_count == 1
    assert solutions.pose_solution.close_count == 1


# ---------------------------------------------------------------------------
# dataset_sidecar：結束路徑必須釋放相機與 MediaPipe
# ---------------------------------------------------------------------------


def _make_sidecar(monkeypatch, fake_cv2):
    """建立一個不依賴真實相機的 DatasetSidecar 實例。"""
    monkeypatch.delitem(sys.modules, "dataset_sidecar", raising=False)
    import dataset_sidecar

    sidecar = dataset_sidecar.DatasetSidecar.__new__(dataset_sidecar.DatasetSidecar)
    # camera/feature 以替身注入（型別與正式型別不同）→ 以 setattr 繞過靜態檢查
    setattr(sidecar, "camera", fake_cv2_camera_stub())
    setattr(sidecar, "feature", None)
    sidecar.running = True
    return sidecar


def fake_cv2_camera_stub():
    class _Cam:
        def __init__(self):
            self.stop_count = 0

        def stop(self):
            self.stop_count += 1

        @property
        def running(self):
            return False

    return _Cam()


def test_sidecar_shutdown_stops_camera_and_closes_feature(monkeypatch):
    """shutdown() 必須停止相機並釋放 MediaPipe，且可重複呼叫。"""
    sidecar = _make_sidecar(monkeypatch, None)

    feature = types.SimpleNamespace(close_count=0)
    feature.close = lambda: setattr(feature, "close_count", feature.close_count + 1)
    setattr(sidecar, "feature", feature)

    sidecar.shutdown()
    sidecar.shutdown()

    assert getattr(sidecar.camera, "stop_count") == 2
    assert feature.close_count == 1
    assert sidecar.feature is None
    assert sidecar.running is False


def test_sidecar_exit_command_calls_shutdown(monkeypatch, capsys):
    """`exit` 指令必須走 shutdown()（相機 + MediaPipe 一起釋放）。"""
    sidecar = _make_sidecar(monkeypatch, None)

    sent = []
    monkeypatch.setattr(sidecar, "send_response", lambda rid, data: sent.append((rid, data)))
    monkeypatch.setattr(sidecar, "_command_loop", lambda: None)

    # 直接走 _command_loop 的實作：以假的 stdin 餵入 exit 指令
    import dataset_sidecar

    class _FakeStdin:
        def __init__(self, lines):
            self._lines = list(lines)

        def readline(self):
            if self._lines:
                return self._lines.pop(0)
            return ""

    monkeypatch.setattr(sys, "stdin", _FakeStdin([json.dumps({"command": "exit", "requestId": "r1"}) + "\n"]))
    monkeypatch.setattr(sidecar, "send_response", lambda rid, data: sent.append((rid, data)))

    dataset_sidecar.DatasetSidecar._command_loop(sidecar)

    assert getattr(sidecar.camera, "stop_count") == 1
    assert sidecar.running is False
    assert sent and sent[0][0] == "r1"

