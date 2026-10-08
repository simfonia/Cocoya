import io
import json
import os
import queue
import socket
import sys
import threading
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "resources"))
from deploy import serial_hub


class FakeSerial:
    instances = []

    def __init__(self, port, baudrate, timeout=0):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self._incoming = queue.Queue()
        self._closed = False
        self.writes = []
        FakeSerial.instances.append(self)

    @property
    def in_waiting(self):
        return self._incoming.qsize()

    def read(self, size):
        out = bytearray()
        for _ in range(size):
            try:
                out.extend(self._incoming.get_nowait())
            except queue.Empty:
                break
        return bytes(out)

    def write(self, data):
        if self._closed:
            raise OSError("closed")
        self.writes.append(bytes(data))
        return len(data)

    def close(self):
        self._closed = True

    def feed(self, data):
        for byte in data:
            self._incoming.put(bytes([byte]))


@pytest.fixture

def hub(monkeypatch, tmp_path):
    FakeSerial.instances.clear()
    metadata = tmp_path / "hub.json"
    lock = tmp_path / "hub.lock"
    monkeypatch.setattr(serial_hub, "_state_paths", lambda _port: (str(tmp_path), str(metadata), str(lock)))
    token = "test-token-serial-hub"
    server = serial_hub._PortHub("COM42", 115200, token, serial_factory=FakeSerial)
    thread = threading.Thread(target=server.serve, daemon=True)
    thread.start()
    deadline = time.monotonic() + 3
    while not metadata.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert metadata.exists(), "hub test server did not publish endpoint metadata"
    try:
        current = json.loads(metadata.read_text(encoding="utf-8"))
        assert current["token"] == token
        yield server
    finally:
        server.stopping.set()
        thread.join(timeout=2)


def test_monitor_receives_fanout_and_proxy_reads_without_terminal_routing(hub):
    monitor = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="monitor")
    proxy = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="proxy")
    try:
        deadline = time.monotonic() + 2
        while not FakeSerial.instances and time.monotonic() < deadline:
            time.sleep(0.01)
        physical = FakeSerial.instances[-1]
        physical.feed(b"sensor:17\n")

        assert monitor.readline() == b"sensor:17\n"
        assert proxy.readline() == b"sensor:17\n"
        assert proxy.write(b"command\n") == 8
        deadline = time.monotonic() + 1
        while not physical.writes and time.monotonic() < deadline:
            time.sleep(0.01)
        assert physical.writes == [b"command\n"]
    finally:
        proxy.close()
        monitor.close()


def test_only_one_proxy_writer_and_upload_lease_refuses_active_writer(hub):
    writer = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="proxy")
    second_reader_writer = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="proxy")
    try:
        assert second_reader_writer.is_open
        assert writer.write(b"first\n") == 6
        with pytest.raises(RuntimeError, match="SERIAL_WRITER_BUSY"):
            serial_hub.acquire_upload_lease("COM42", 115200)
        with pytest.raises(OSError, match="SERIAL_WRITER_BUSY"):
            second_reader_writer.write(b"second\n")
        with pytest.raises(RuntimeError, match="SERIAL_WRITER_BUSY"):
            serial_hub.acquire_upload_lease("COM42", 115200)
    finally:
        second_reader_writer.close()
        writer.close()

    lease = serial_hub.acquire_upload_lease("COM42", 115200)
    try:
        assert hub.uploading is True
        with pytest.raises(RuntimeError, match="SERIAL_PORT_BUSY_UPLOAD"):
            serial_hub.acquire_upload_lease("COM42", 115200)
        with pytest.raises(RuntimeError, match="SERIAL_PORT_BUSY_UPLOAD"):
            serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="monitor")
    finally:
        serial_hub.release_upload_lease()
    assert hub.uploading is False


def test_reset_input_buffer_is_per_client(hub):
    first = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="proxy")
    second = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="monitor")
    try:
        physical = FakeSerial.instances[-1]
        physical.feed(b"line\n")
        deadline = time.monotonic() + 1
        while (first.in_waiting == 0 or second.in_waiting == 0) and time.monotonic() < deadline:
            time.sleep(0.01)
        first.reset_input_buffer()
        assert first.in_waiting == 0
        assert second.readline() == b"line\n"
    finally:
        first.close()
        second.close()


# ---------------------------------------------------------------------------
# Phase 2 補測（2026-10-08）：交接文件點名的邊界
#   首次自動啟動 / stale metadata race / baud mismatch / auth /
#   Hub client crash / buffer overflow / lease-helper ready & error /
#   控制通道廣播隔離（小任務 2 修正的回歸守門）
# ---------------------------------------------------------------------------


class _FakeControlSocket:
    """依序回傳固定位元組串的假 socket（供 _read_control_response 單元測試）。"""

    def __init__(self, payload):
        self._data = payload
        self._pos = 0

    def settimeout(self, _value):
        pass

    def recv(self, _size):
        if self._pos >= len(self._data):
            return b""
        chunk = self._data[self._pos:self._pos + 1]
        self._pos += 1
        return chunk


def test_read_control_response_skips_broadcasts():
    """回歸守門：控制回應讀取必須跳過 type 廣播，直到讀到 ok 鍵。"""
    payload = (
        json.dumps({"type": "state", "connected": False, "reason": "upload"}).encode("utf-8")
        + b"\n"
        + json.dumps({"ok": False, "error": "SERIAL_PORT_BUSY_UPLOAD"}).encode("utf-8")
        + b"\n"
    )
    response = serial_hub._read_control_response(_FakeControlSocket(payload), 1.0)
    assert response["error"] == "SERIAL_PORT_BUSY_UPLOAD"


def test_read_control_response_times_out_when_only_broadcasts():
    class _SlowBroadcastSocket:
        def __init__(self):
            self._line = b'{"type":"state"}\n'
            self._pos = 0

        def settimeout(self, _value):
            pass

        def recv(self, _size):
            time.sleep(0.05)
            if self._pos >= len(self._line):
                self._pos = 0
            chunk = self._line[self._pos:self._pos + 1]
            self._pos += 1
            return chunk

    with pytest.raises(TimeoutError, match="SERIAL_HUB_CONTROL_TIMEOUT"):
        serial_hub._read_control_response(_SlowBroadcastSocket(), 0.2)


def test_broadcast_skips_admin_clients():
    """源頭守門：admin（lease 專用）不接收 data/state 廣播。"""
    hub_obj = serial_hub._PortHub("COM42", 115200, "tok", serial_factory=FakeSerial)
    admin = serial_hub._Client(object(), "admin")
    monitor = serial_hub._Client(object(), "monitor")
    hub_obj.clients.add(admin)
    hub_obj.clients.add(monitor)
    hub_obj._broadcast({"type": "state", "connected": True})
    assert monitor.outgoing.qsize() == 1
    assert admin.outgoing.qsize() == 0


def test_connect_accepts_baud_mismatch_and_warns(hub, capsys):
    """8b 決策（2026-10-08）：鮑率不一致放行但警告，hub 以先啟動者（115200）為準。"""
    proxy = serial_hub.SerialProxy("COM42", 9600, timeout=0.1, role="monitor")
    try:
        assert proxy.is_open
        err = capsys.readouterr().err
        assert "Baud mismatch" in err
        assert "115200" in err  # hub 實際鮑率（先啟動者）
    finally:
        proxy.close()


def test_idle_monitor_client_survives_hello_timeout(hub, monkeypatch):
    """Bug B 回歸（2026-10-08）：握手後回阻塞讀取，靜默 monitor 不得被 idle 踢掉。"""
    monkeypatch.setattr(serial_hub, "_HELLO_TIMEOUT", 0.3)
    monitor = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="monitor")
    try:
        time.sleep(0.6)  # 2x 舊 timeout；修前會被 socket.timeout → _drop
        assert monitor.is_open
        # client 仍在 hub 名冊且讀寫通道可用
        assert any(c.role == "monitor" for c in hub.clients)
        proxy = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="proxy")
        try:
            assert proxy.write(b"ping\n") == 5
        finally:
            proxy.close()
    finally:
        monitor.close()


def test_upload_lease_survives_idle_timeout(hub, monkeypatch):
    """Bug B 連帶（2026-10-08）：upload lease 的 admin 連線 idle 不得被動失效。"""
    monkeypatch.setattr(serial_hub, "_HELLO_TIMEOUT", 0.3)
    lease = serial_hub.acquire_upload_lease("COM42", 115200)
    try:
        time.sleep(0.6)  # 2x 舊 timeout
        assert hub.uploading is True, "upload lease was passively dropped while idle"
    finally:
        serial_hub.release_upload_lease()
    assert hub.uploading is False


def test_connect_rejects_port_mismatch(hub):
    """反向守門：port 不同仍拒絕 SERIAL_HUB_CONFIG_MISMATCH（只放行鮑率，不放行 port）。"""
    metadata = serial_hub._metadata_for("COM42")
    assert metadata is not None
    sock = socket.create_connection(("127.0.0.1", int(metadata["tcpPort"])), timeout=2)
    try:
        serial_hub._send_json(sock, threading.Lock(), {
            "op": "hello",
            "version": serial_hub._PROTOCOL_VERSION,
            "port": "COM99",
            "baudrate": 115200,
            "role": "monitor",
            "token": metadata["token"],
        })
        response = serial_hub._read_json_line(sock, 2.0)
        assert response.get("error") == "SERIAL_HUB_CONFIG_MISMATCH"
    finally:
        sock.close()


def test_hello_rejects_wrong_token(hub, tmp_path):
    metadata = json.loads((tmp_path / "hub.json").read_text(encoding="utf-8"))
    sock = socket.create_connection(("127.0.0.1", int(metadata["tcpPort"])), timeout=2)
    try:
        payload = {
            "op": "hello",
            "version": serial_hub._PROTOCOL_VERSION,
            "port": "COM42",
            "baudrate": 115200,
            "role": "monitor",
            "token": "wrong-token",
        }
        sock.sendall((json.dumps(payload) + "\n").encode("utf-8"))
        data = b""
        while b"\n" not in data:
            chunk = sock.recv(1)
            assert chunk, "hub closed before responding to hello"
            data += chunk
        response = json.loads(data.decode("utf-8"))
        assert response.get("error") == "SERIAL_HUB_AUTH_FAILED"
    finally:
        sock.close()


def test_first_client_auto_starts_hub(monkeypatch, tmp_path):
    """首次連線（無 metadata）→ _start_hub 啟動 hub → 連線成功。"""
    FakeSerial.instances.clear()
    metadata = tmp_path / "hub.json"
    lock_file = tmp_path / "hub.lock"
    monkeypatch.setattr(
        serial_hub, "_state_paths", lambda _port: (str(tmp_path), str(metadata), str(lock_file))
    )
    servers = []

    def fake_popen(args, **kwargs):
        # args: [python, script, "--serve", port, baudrate, token]
        assert args[2] == "--serve"
        server = serial_hub._PortHub(args[3], int(args[4]), args[5], serial_factory=FakeSerial)
        thread = threading.Thread(target=server.serve, daemon=True)
        thread.start()
        servers.append((server, thread))

        class _Proc:
            pid = 4242

        return _Proc()

    monkeypatch.setattr(serial_hub.subprocess, "Popen", fake_popen)
    try:
        connection = serial_hub._connect_admin("COM42", 115200)
        assert connection is not None
        sock, _lock, response = connection
        assert response.get("ok") is True
        sock.close()
    finally:
        for server, thread in servers:
            server.stopping.set()
            thread.join(timeout=2)


def test_stale_metadata_times_out(monkeypatch, tmp_path):
    """stale metadata（指向無人監聽的 port）→ 連線失敗循環 → START_TIMEOUT。"""
    metadata = tmp_path / "hub.json"
    lock_file = tmp_path / "hub.lock"
    monkeypatch.setattr(
        serial_hub, "_state_paths", lambda _port: (str(tmp_path), str(metadata), str(lock_file))
    )
    metadata.write_text(
        json.dumps({"port": "COM42", "baudrate": 115200, "token": "stale",
                    "tcpPort": 1, "pid": 999999}),
        encoding="utf-8",
    )
    # 假裝子進程已 spawn 但 metadata 永遠連不上（stale）
    monkeypatch.setattr(serial_hub.subprocess, "Popen", lambda *a, **k: type("P", (), {"pid": 1})())
    monkeypatch.setattr(serial_hub, "_START_TIMEOUT", 0.3)
    with pytest.raises(RuntimeError, match="SERIAL_HUB_START_TIMEOUT"):
        serial_hub._start_hub("COM42", 115200, "monitor")


def test_writer_client_crash_releases_lease(hub):
    """proxy 直接斷 socket（未走 close 協議）→ hub 應釋放 writer lease。"""
    first = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="proxy")
    second = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="proxy")
    try:
        assert first.write(b"first\n") == 6
        with pytest.raises(OSError, match="SERIAL_WRITER_BUSY"):
            second.write(b"nope\n")
        # 模擬 crash：繞過 close 協議直接斷連
        assert first._socket is not None  # Pylance narrowing：連線成功後必為 socket
        first._socket.shutdown(socket.SHUT_RDWR)
        deadline = time.monotonic() + 2
        while hub.writer is not None and time.monotonic() < deadline:
            time.sleep(0.01)
        assert hub.writer is None, "hub did not release writer lease after client crash"
        assert second.write(b"second\n") == 7
    finally:
        first.is_open = False
        first.close()
        second.close()


def test_upload_owner_crash_releases_uploading(hub):
    """上傳租約持有者 crash → hub 應清除 uploading 狀態。"""
    lease = serial_hub.acquire_upload_lease("COM42", 115200)
    try:
        assert hub.uploading is True
        sock, _lock = lease
        assert sock is not None  # Pylance narrowing：lease 成功後必為 socket
        sock.shutdown(socket.SHUT_RDWR)
        deadline = time.monotonic() + 2
        while hub.uploading and time.monotonic() < deadline:
            time.sleep(0.01)
        assert hub.uploading is False, "hub did not clear uploading after lease owner crash"
    finally:
        serial_hub.release_upload_lease()


def test_client_buffer_overflow_raises(hub):
    """proxy RX buffer 溢位 → read() 拋 SERIAL_HUB_CLIENT_BUFFER_OVERFLOW。"""
    proxy = serial_hub.SerialProxy("COM42", 115200, timeout=0.1, role="monitor")
    try:
        proxy._buffer_limit = 8
        deadline = time.monotonic() + 2
        while not FakeSerial.instances and time.monotonic() < deadline:
            time.sleep(0.01)
        assert FakeSerial.instances, "hub never opened the fake serial handle"
        FakeSerial.instances[-1].feed(b"0123456789ABCDEF")  # 16 bytes > limit 8
        deadline = time.monotonic() + 2
        while proxy._buffer_error is None and time.monotonic() < deadline:
            time.sleep(0.01)
        assert proxy._buffer_error == "SERIAL_HUB_CLIENT_BUFFER_OVERFLOW"
        with pytest.raises(OSError, match="SERIAL_HUB_CLIENT_BUFFER_OVERFLOW"):
            proxy.read(1)
    finally:
        proxy.close()


def test_lease_cli_error_marker(monkeypatch, capsys):
    def boom(_port, _baudrate=115200):
        raise RuntimeError("SERIAL_WRITER_BUSY: occupied by another window")

    monkeypatch.setattr(serial_hub, "acquire_upload_lease", boom)
    with pytest.raises(SystemExit) as excinfo:
        serial_hub._lease_cli(["--lease", "COM42", "115200"])
    assert excinfo.value.code == 2
    out = capsys.readouterr().out
    assert "__COCOYA_UPLOAD_LEASE_ERROR__:SERIAL_WRITER_BUSY" in out


def test_lease_cli_ready_then_release_on_stdin(monkeypatch, capsys):
    released = {"called": False}
    monkeypatch.setattr(
        serial_hub, "acquire_upload_lease", lambda _port, _baudrate=115200: ("sock", "lock")
    )
    monkeypatch.setattr(
        serial_hub, "release_upload_lease", lambda: released.__setitem__("called", True)
    )
    monkeypatch.setattr(serial_hub.sys, "stdin", io.StringIO("\n"))
    serial_hub._lease_cli(["--lease", "COM42", "115200"])
    out = capsys.readouterr().out
    assert "__COCOYA_UPLOAD_LEASE_READY__" in out
    assert released["called"] is True
