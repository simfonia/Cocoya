"""Windows Tauri serial-port hub and pyserial-compatible client.

The hub owns one physical COM handle per port. Local TCP clients authenticate
with a per-port random token; monitor clients receive RX fan-out, while only one
proxy client may hold the write lease. MCU uploads acquire an exclusive lease,
which pauses readers and releases the COM handle until the deployer resumes it.
"""

import base64
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import secrets
import hashlib
import queue

try:
    import serial as _pyserial
except ImportError:
    _pyserial = None

_PROTOCOL_VERSION = 1
_IDLE_EXIT_SECONDS = 20.0
_CONNECT_TIMEOUT = 0.35
_START_TIMEOUT = 8.0
_HELLO_TIMEOUT = 2.0
_READ_CHUNK = 4096
_MAX_CONTROL_LINE = 2 * 1024 * 1024
_ACTIVE_UPLOAD_LEASE = None


def _state_paths(port):
    key = hashlib.sha256(port.upper().encode("utf-8")).hexdigest()[:24]
    root = os.path.join(tempfile.gettempdir(), "Cocoya", "serial_hub")
    os.makedirs(root, exist_ok=True)
    return root, os.path.join(root, key + ".json"), os.path.join(root, key + ".lock")


def _read_json_line(sock, timeout=None):
    if timeout is not None:
        sock.settimeout(timeout)
    data = bytearray()
    while len(data) <= _MAX_CONTROL_LINE:
        chunk = sock.recv(1)
        if not chunk:
            raise ConnectionError("Hub closed the connection")
        if chunk == b"\n":
            return json.loads(data.decode("utf-8"))
        data.extend(chunk)
    raise ValueError("Hub control message exceeded maximum size")


def _read_control_response(sock, timeout=2.0):
    """Read the next control response, skipping any broadcast messages.

    Admin (lease) connections share one socket with unsolicited ``type``-bearing
    broadcasts such as ``{"type": "state", ...}``. A blind single-line read can
    mistake a broadcast for the reply to ``acquire_upload``/``release_upload``,
    which degraded the error code to SERIAL_PORT_BUSY and made release return
    before the hub had actually released the lease. Control responses always
    carry an ``ok`` key (protocol invariant), broadcasts never do.
    """
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("SERIAL_HUB_CONTROL_TIMEOUT")
        message = _read_json_line(sock, remaining)
        if "ok" in message:
            return message


def _send_json(sock, lock, message):
    payload = (json.dumps(message, separators=(",", ":")) + "\n").encode("utf-8")
    with lock:
        sock.sendall(payload)


def _metadata_for(port):
    _, metadata_path, _ = _state_paths(port)
    try:
        with open(metadata_path, "r", encoding="utf-8") as stream:
            metadata = json.load(stream)
        if metadata.get("port") == port:
            return metadata
    except (OSError, ValueError):
        return None
    return None


def _write_metadata(path, data):
    temp_path = path + ".{}.tmp".format(os.getpid())
    with open(temp_path, "w", encoding="utf-8") as stream:
        json.dump(data, stream)
    os.replace(temp_path, path)


def _connect(port, baudrate, role, timeout=_CONNECT_TIMEOUT):
    metadata = _metadata_for(port)
    if not metadata:
        return None
    sock = socket.create_connection(("127.0.0.1", int(metadata["tcpPort"])), timeout=timeout)
    lock = threading.Lock()
    _send_json(sock, lock, {
        "op": "hello",
        "version": _PROTOCOL_VERSION,
        "port": port,
        "baudrate": int(baudrate),
        "role": role,
        "token": metadata["token"],
    })
    response = _read_json_line(sock, timeout)
    if not response.get("ok"):
        sock.close()
        raise RuntimeError(response.get("error", "SERIAL_HUB_REJECTED"))
    sock.settimeout(None)
    # 鮑率不一致警告（決策 2026-10-08：放行但警告，hub 鮑率以先啟動者為準）。
    # hub 在 hello 回應帶 hubBaudrate；不同則在本 client 終端（stderr）印一行提示。
    hub_baud = response.get("hubBaudrate")
    if hub_baud is not None and int(hub_baud) != int(baudrate):
        print(
            "[Cocoya Serial Hub] Baud mismatch: program requested {req}, hub uses {hub} "
            "(first starter wins); USB CDC devices are unaffected. "
            "/ 鮑率不一致：程式宣告 {req}，hub 實際使用 {hub}（先啟動者為準）；USB CDC 裝置不受影響。".format(
                req=int(baudrate), hub=int(hub_baud)
            ),
            file=sys.stderr,
            flush=True,
        )
    return sock, lock, response


def _start_hub(port, baudrate, role="proxy"):
    script = os.environ.get("COCOYA_SERIAL_HUB_SCRIPT") or os.path.abspath(__file__)
    if not script or not os.path.isfile(script):
        raise RuntimeError("SERIAL_HUB_SCRIPT_NOT_FOUND")
    _, metadata_path, lock_path = _state_paths(port)
    token = secrets.token_urlsafe(32)
    flags = 0
    if os.name == "nt":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    subprocess.Popen(
        [sys.executable, script, "--serve", port, str(int(baudrate)), token],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=flags,
        cwd=os.path.dirname(script),
    )
    deadline = time.monotonic() + _START_TIMEOUT
    while time.monotonic() < deadline:
        metadata = _metadata_for(port)
        if metadata:
            try:
                return _connect(port, baudrate, role, timeout=0.5)
            except OSError:
                pass
        time.sleep(0.05)
    raise RuntimeError("SERIAL_HUB_START_TIMEOUT")


def _friendly_error(code):
    messages = {
        "SERIAL_WRITER_BUSY": "序列埠已由另一個 Cocoya 視窗寫入；請關閉占用的視窗或序列埠程式後再試。 / The port has another writer. Close the occupying window or serial application, then retry.",
        "SERIAL_PORT_BUSY_UPLOAD": "序列埠正由上傳程序獨佔；請稍候再試。 / The port is reserved for upload. Retry after the upload finishes.",
        "SERIAL_HUB_CONFIG_MISMATCH": "同一序列埠的 Hub 已使用不同鮑率；請先停止該埠其他序列工作階段。 / The port's hub uses a different baud rate. Stop other serial sessions first.",
        "SERIAL_HUB_AUTH_FAILED": "無法驗證本機 Serial Hub。 / Local serial hub authentication failed.",
    }
    return code + ": " + messages.get(code, code)


class SerialProxy:
    """Small pyserial-shaped proxy for generated Cocoya PC programs."""

    def __init__(self, port, baudrate=9600, timeout=None, write_timeout=None, role="proxy", **_kwargs):
        self.port = str(port)
        self.baudrate = int(baudrate)
        self.timeout = timeout
        self.write_timeout = write_timeout
        self.role = role
        self.dtr = False
        self.rts = False
        self.is_open = False
        self.connected = False
        self._buffer = bytearray()
        self._buffer_limit = 1024 * 1024
        self._buffer_error = None
        self._condition = threading.Condition()
        self._request_id = 0
        self._responses = {}
        self._send_lock = None
        self._socket = None
        self._reader = None
        self._connect()

    def _connect(self):
        try:
            connection = _connect(self.port, self.baudrate, self.role)
        except RuntimeError as error:
            raise RuntimeError(_friendly_error(str(error)))
        except OSError:
            if self.role == "admin":
                _start_hub(self.port, self.baudrate, self.role)
                connection = _connect(self.port, self.baudrate, self.role)
            else:
                # Starting with proxy role obtains the writer lease atomically.
                connection = _start_hub(self.port, self.baudrate, self.role)
        if connection is None:
            connection = _start_hub(self.port, self.baudrate, self.role)
        if connection is None:
            raise RuntimeError("SERIAL_HUB_START_FAILED")
        sock, send_lock, response = connection
        self._socket = sock
        self._send_lock = send_lock
        self.connected = bool(response.get("connected"))
        self.is_open = True
        self._reader = threading.Thread(target=self._read_messages, daemon=True)
        self._reader.start()

    def _read_messages(self):
        pending = bytearray()
        sock = self._socket
        if sock is None:
            return
        try:
            while self.is_open:
                chunk = sock.recv(65536)
                if not chunk:
                    break
                pending.extend(chunk)
                while b"\n" in pending:
                    raw, _, rest = pending.partition(b"\n")
                    pending = bytearray(rest)
                    message = json.loads(raw.decode("utf-8"))
                    kind = message.get("type")
                    if kind == "data":
                        decoded = base64.b64decode(message.get("data", ""))
                        with self._condition:
                            overflow = len(self._buffer) + len(decoded) - self._buffer_limit
                            if overflow > 0:
                                del self._buffer[:overflow]
                                self._buffer_error = "SERIAL_HUB_CLIENT_BUFFER_OVERFLOW"
                            self._buffer.extend(decoded)
                            self._condition.notify_all()
                    elif kind == "state":
                        with self._condition:
                            self.connected = bool(message.get("connected"))
                            self._condition.notify_all()
                    elif kind == "response":
                        with self._condition:
                            self._responses[message.get("requestId")] = message
                            self._condition.notify_all()
                    elif kind == "error":
                        with self._condition:
                            self._buffer_error = message.get("error", "SERIAL_HUB_IO_ERROR")
                            self._condition.notify_all()
        except (OSError, ValueError):
            pass
        finally:
            self.is_open = False
            with self._condition:
                self._condition.notify_all()

    @property
    def in_waiting(self):
        with self._condition:
            return len(self._buffer)

    def write(self, data):
        if not self.is_open:
            raise OSError("SERIAL_HUB_DISCONNECTED")
        if self.role != "proxy":
            raise OSError("SERIAL_WRITE_LEASE_REQUIRED")
        if not self.connected:
            raise OSError("SERIAL_NOT_CONNECTED")
        if not getattr(self, "_writer_lease", False):
            response = self._request("acquire_writer", timeout=2.0)
            if not response.get("ok"):
                raise OSError(_friendly_error(response.get("error", "SERIAL_WRITER_BUSY")))
            self._writer_lease = True
        raw = bytes(data)
        _send_json(self._socket, self._send_lock, {
            "op": "write",
            "data": base64.b64encode(raw).decode("ascii"),
        })
        return len(raw)

    def _next_request_id(self):
        with self._condition:
            self._request_id += 1
            return str(self._request_id)

    def _request(self, operation, timeout=1.0):
        request_id = self._next_request_id()
        _send_json(self._socket, self._send_lock, {"op": operation, "requestId": request_id})
        deadline = time.monotonic() + timeout
        with self._condition:
            while request_id not in self._responses and self.is_open:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("SERIAL_HUB_REQUEST_TIMEOUT")
                self._condition.wait(remaining)
            response = self._responses.pop(request_id, None)
        if response is None:
            raise OSError("SERIAL_HUB_DISCONNECTED")
        return response

    def read(self, size=1):
        size = max(0, int(size))
        if size == 0:
            return b""
        deadline = None if self.timeout is None else time.monotonic() + float(self.timeout)
        with self._condition:
            while not self._buffer and self.is_open:
                remaining = None if deadline is None else deadline - time.monotonic()
                if remaining is not None and remaining <= 0:
                    break
                self._condition.wait(remaining)
            if self._buffer_error:
                error, self._buffer_error = self._buffer_error, None
                raise OSError(error)
            count = min(size, len(self._buffer))
            result = bytes(self._buffer[:count])
            del self._buffer[:count]
            return result

    def readline(self, size=-1):
        limit = None if size is None or size < 0 else int(size)
        if limit == 0:
            return b""
        deadline = None if self.timeout is None else time.monotonic() + float(self.timeout)
        with self._condition:
            while True:
                if self._buffer_error:
                    error, self._buffer_error = self._buffer_error, None
                    raise OSError(error)
                newline = self._buffer.find(b"\n")
                count = newline + 1 if newline >= 0 else None
                if limit is not None and (count is None or count > limit):
                    count = limit
                if count is not None and count > 0:
                    break
                if not self.is_open:
                    if self._buffer:
                        count = len(self._buffer) if limit is None else min(limit, len(self._buffer))
                        break
                    return b""
                remaining = None if deadline is None else deadline - time.monotonic()
                if remaining is not None and remaining <= 0:
                    if self._buffer:
                        count = len(self._buffer) if limit is None else min(limit, len(self._buffer))
                        break
                    return b""
                self._condition.wait(remaining)
            result = bytes(self._buffer[:count])
            del self._buffer[:count]
            return result

    def reset_input_buffer(self):
        with self._condition:
            self._buffer.clear()

    def flush(self):
        return None

    def close(self):
        if not self.is_open:
            return
        sock = self._socket
        if sock is None:
            self.is_open = False
            return
        try:
            if getattr(self, "_writer_lease", False):
                self._request("release_writer", timeout=0.2)
            _send_json(sock, self._send_lock, {"op": "close"})
        except (OSError, TimeoutError):
            pass
        self.is_open = False
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        sock.close()
        with self._condition:
            self._condition.notify_all()

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        self.close()


class _Client:
    def __init__(self, sock, role):
        self.sock = sock
        self.role = role
        self.send_lock = threading.Lock()
        self.outgoing = queue.Queue(maxsize=128)
        self.alive = True


class _PortHub:
    def __init__(self, port, baudrate, token, serial_factory=None):
        self.port = port
        self.baudrate = int(baudrate)
        self.token = token
        self.serial_factory = serial_factory or self._default_serial_factory
        self.clients = set()
        self.clients_lock = threading.Lock()
        self.serial_lock = threading.Lock()
        self.serial_handle = None
        self.writer = None
        self.uploading = False
        self.upload_owner = None
        self.stopping = threading.Event()
        self.last_activity = time.monotonic()

    @staticmethod
    def _default_serial_factory(port, baudrate):
        if _pyserial is None:
            raise RuntimeError("PYSERIAL_NOT_INSTALLED")
        handle = _pyserial.Serial(port, baudrate, timeout=0, write_timeout=0)
        handle.dtr = True
        handle.rts = True
        return handle

    def _send(self, client, message):
        try:
            client.outgoing.put_nowait(message)
            return True
        except queue.Full:
            self._drop(client)
            return False

    def _client_sender(self, client):
        while client.alive and not self.stopping.is_set():
            try:
                message = client.outgoing.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                _send_json(client.sock, client.send_lock, message)
            except OSError:
                self._drop(client)
                return

    def _broadcast(self, message):
        with self.clients_lock:
            # admin = lease 專用連線（acquire_upload_lease），只需要控制回應；
            # 不接收 data/state 廣播，避免廣播插入控制對話（見 _read_control_response）。
            clients = [client for client in self.clients if client.role != "admin"]
        for client in clients:
            self._send(client, message)

    def _drop(self, client):
        with self.clients_lock:
            self.clients.discard(client)
            if self.writer is client:
                self.writer = None
            if self.upload_owner is client:
                self.upload_owner = None
                self.uploading = False
        client.alive = False
        try:
            client.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            client.sock.close()
        except OSError:
            pass
        self.last_activity = time.monotonic()

    def _open_serial(self):
        with self.serial_lock:
            if self.uploading or self.serial_handle is not None:
                return
            try:
                handle = self.serial_factory(self.port, self.baudrate)
                self.serial_handle = handle
                self._broadcast({"type": "state", "connected": True})
            except Exception:
                self._broadcast({"type": "state", "connected": False})

    def _close_serial(self, notify=True):
        with self.serial_lock:
            handle, self.serial_handle = self.serial_handle, None
        if handle is not None:
            try:
                handle.close()
            except Exception:
                pass
        if notify:
            self._broadcast({"type": "state", "connected": False})

    def _serial_loop(self):
        last_open_attempt = 0.0
        while not self.stopping.is_set():
            if self.uploading:
                self._close_serial()
                time.sleep(0.02)
                continue
            if self.serial_handle is None:
                now = time.monotonic()
                if now - last_open_attempt >= 1.0:
                    last_open_attempt = now
                    self._open_serial()
                time.sleep(0.02)
                continue
            try:
                with self.serial_lock:
                    handle = self.serial_handle
                    if handle is None or self.uploading:
                        data = b""
                    else:
                        waiting = int(getattr(handle, "in_waiting", 0))
                        data = handle.read(min(waiting, _READ_CHUNK)) if waiting else b""
                if data:
                    self._broadcast({"type": "data", "data": base64.b64encode(data).decode("ascii")})
                else:
                    time.sleep(0.005)
            except Exception:
                self._close_serial()
                time.sleep(0.05)

    def _client_loop(self, sock):
        client = None
        try:
            hello = _read_json_line(sock, _HELLO_TIMEOUT)
            if hello.get("op") != "hello" or hello.get("version") != _PROTOCOL_VERSION:
                _send_json(sock, threading.Lock(), {"ok": False, "error": "SERIAL_HUB_PROTOCOL"})
                return
            # 只檢查 port；鮑率不一致放行（2026-10-08 決策：先啟動者為準，
            # client 端由 _connect 印警告）。原拒絕會讓 monitor(115200) 與
            # PC 程式(9600)無法同埠共存，與多視窗核心目標互斥。
            if hello.get("port") != self.port:
                _send_json(sock, threading.Lock(), {"ok": False, "error": "SERIAL_HUB_CONFIG_MISMATCH"})
                return
            if not secrets.compare_digest(str(hello.get("token", "")), self.token):
                _send_json(sock, threading.Lock(), {"ok": False, "error": "SERIAL_HUB_AUTH_FAILED"})
                return
            role = hello.get("role")
            if role not in ("proxy", "monitor", "admin"):
                _send_json(sock, threading.Lock(), {"ok": False, "error": "SERIAL_HUB_ROLE_INVALID"})
                return
            client = _Client(sock, role)
            rejection = None
            with self.clients_lock:
                if self.uploading and role != "admin":
                    rejection = "SERIAL_PORT_BUSY_UPLOAD"
                else:
                    self.clients.add(client)
            if rejection:
                _send_json(sock, client.send_lock, {"ok": False, "error": rejection})
                return
            self.last_activity = time.monotonic()
            _send_json(sock, client.send_lock, {
                "ok": True,
                "connected": self.serial_handle is not None,
                "hubBaudrate": self.baudrate,
            })
            # 握手後回復阻塞讀取：控制通道沒有 idle deadline。
            # 若保留 hello 的 _HELLO_TIMEOUT，靜默 client（monitor 從 hello 後
            # 不再發訊息）會在 timeout 後被 socket.timeout → _drop 掉線，
            # 導致 monitor 每 N 秒重連重印狀態、上傳 lease 被動失效（2026-10-08 實測 2.02s）。
            # client 死亡由 TCP EOF/連線重置偵測，無需 idle timeout。
            sock.settimeout(None)
            threading.Thread(target=self._client_sender, args=(client,), daemon=True).start()

            while client.alive and not self.stopping.is_set():
                message = _read_json_line(sock)
                operation = message.get("op")
                self.last_activity = time.monotonic()
                if operation == "close":
                    break
                if operation == "write":
                    if client.role != "proxy" or self.writer is not client:
                        self._send(client, {"type": "error", "error": "SERIAL_WRITE_LEASE_REQUIRED"})
                        continue
                    try:
                        data = base64.b64decode(message.get("data", ""), validate=True)
                        with self.serial_lock:
                            if self.uploading or self.serial_handle is None:
                                raise OSError("SERIAL_NOT_CONNECTED")
                            self.serial_handle.write(data)
                    except Exception as error:
                        self._send(client, {"type": "error", "error": str(error)})
                    continue
                if operation == "acquire_writer":
                    with self.clients_lock:
                        if client.role != "proxy":
                            error = "SERIAL_WRITE_LEASE_REQUIRED"
                        elif self.uploading:
                            error = "SERIAL_PORT_BUSY_UPLOAD"
                        elif self.writer is not None and self.writer is not client:
                            error = "SERIAL_WRITER_BUSY"
                        else:
                            error = None
                            self.writer = client
                    self._send(client, {
                        "type": "response",
                        "requestId": message.get("requestId"),
                        "ok": error is None,
                        "error": error,
                    })
                    continue
                if operation == "release_writer":
                    with self.clients_lock:
                        owns_lease = self.writer is client
                        if owns_lease:
                            self.writer = None
                    self._send(client, {
                        "type": "response",
                        "requestId": message.get("requestId"),
                        "ok": owns_lease,
                    })
                    continue
                if operation == "acquire_upload":
                    with self.clients_lock:
                        if self.uploading:
                            rejection = "SERIAL_PORT_BUSY_UPLOAD"
                        elif self.writer is not None and self.writer is not client:
                            rejection = "SERIAL_WRITER_BUSY"
                        else:
                            rejection = None
                            self.uploading = True
                            self.upload_owner = client
                    if rejection:
                        self._send(client, {"ok": False, "error": rejection})
                        continue
                    self._close_serial(notify=False)
                    self._send(client, {"ok": True})
                    self._broadcast({"type": "state", "connected": False, "reason": "upload"})
                    continue
                if operation == "release_upload":
                    with self.clients_lock:
                        owns_lease = self.upload_owner is client
                        if owns_lease:
                            self.uploading = False
                            self.upload_owner = None
                    self._send(client, {"ok": owns_lease, "error": None if owns_lease else "SERIAL_UPLOAD_LEASE_REQUIRED"})
                    continue
                self._send(client, {"ok": False, "error": "SERIAL_HUB_OPERATION_INVALID"})
        except (OSError, ValueError, RuntimeError, TypeError):
            pass
        finally:
            if client is not None:
                self._drop(client)
            else:
                try:
                    sock.close()
                except OSError:
                    pass

    def serve(self):
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen(32)
        listener.settimeout(0.25)
        _, metadata_path, _ = _state_paths(self.port)
        metadata = {"port": self.port, "baudrate": self.baudrate, "token": self.token,
                    "tcpPort": listener.getsockname()[1], "pid": os.getpid()}
        _write_metadata(metadata_path, metadata)
        serial_thread = threading.Thread(target=self._serial_loop, daemon=True)
        serial_thread.start()
        try:
            while not self.stopping.is_set():
                try:
                    sock, _address = listener.accept()
                except socket.timeout:
                    if not self.clients and not self.uploading and time.monotonic() - self.last_activity > _IDLE_EXIT_SECONDS:
                        break
                    continue
                threading.Thread(target=self._client_loop, args=(sock,), daemon=True).start()
        finally:
            self.stopping.set()
            self._close_serial()
            listener.close()
            try:
                current = _metadata_for(self.port)
                if current and current.get("pid") == os.getpid():
                    os.remove(metadata_path)
            except OSError:
                pass


def _acquire_server_lock(lock_path):
    stream = open(lock_path, "a+b")
    stream.seek(0)
    if not stream.read(1):
        stream.seek(0)
        stream.write(b"0")
        stream.flush()
    stream.seek(0)
    try:
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        stream.close()
        return None
    return stream


def _serve(port, baudrate, token):
    _, metadata_path, lock_path = _state_paths(port)
    lock = _acquire_server_lock(lock_path)
    if lock is None:
        return
    try:
        _PortHub(port, baudrate, token).serve()
    finally:
        lock.close()


def _connect_admin(port, baudrate):
    try:
        connection = _connect(port, baudrate, "admin")
        if connection:
            return connection
    except OSError:
        pass
    return _start_hub(port, baudrate, "admin")


def acquire_upload_lease(port, baudrate=115200):
    """Acquire an upload lease, starting an idle hub if this port has no hub yet."""
    global _ACTIVE_UPLOAD_LEASE
    connection = _connect_admin(str(port), int(baudrate))
    if connection is None:
        raise RuntimeError("SERIAL_HUB_START_FAILED")
    sock, send_lock, _response = connection
    _send_json(sock, send_lock, {"op": "acquire_upload"})
    response = _read_control_response(sock, 2.0)
    if not response.get("ok"):
        sock.close()
        raise RuntimeError(response.get("error", "SERIAL_PORT_BUSY"))
    _ACTIVE_UPLOAD_LEASE = (sock, send_lock)
    return _ACTIVE_UPLOAD_LEASE


def release_upload_lease():
    global _ACTIVE_UPLOAD_LEASE
    lease, _ACTIVE_UPLOAD_LEASE = _ACTIVE_UPLOAD_LEASE, None
    if lease:
        sock, send_lock = lease
        try:
            _send_json(sock, send_lock, {"op": "release_upload"})
            # 等到真正的 release 回應（ok 鍵）才回傳，確保 hub 端已釋放。
            _read_control_response(sock, 2.0)
        except (OSError, TimeoutError):
            pass
        try:
            sock.close()
        except OSError:
            pass


def release_active_upload_lease():
    """Compatibility hook called immediately before a deployer enters monitor mode."""
    release_upload_lease()


def _serve_cli(argv):
    if len(argv) != 4:
        raise SystemExit("usage: serial_hub.py --serve PORT BAUD TOKEN")
    _serve(argv[1], int(argv[2]), argv[3])


def _lease_cli(argv):
    if len(argv) != 3:
        raise SystemExit("usage: serial_hub.py --lease PORT BAUD")
    try:
        acquire_upload_lease(argv[1], int(argv[2]))
    except Exception as error:
        code = str(error).split(":", 1)[0]
        print("__COCOYA_UPLOAD_LEASE_ERROR__:" + code, flush=True)
        raise SystemExit(2)
    print("__COCOYA_UPLOAD_LEASE_READY__", flush=True)
    try:
        sys.stdin.readline()
    finally:
        release_upload_lease()


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "--serve":
    _serve_cli(sys.argv[1:])
elif __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "--lease":
    _lease_cli(sys.argv[1:])
