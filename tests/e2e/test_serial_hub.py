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
