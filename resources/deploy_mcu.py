"""
Cocoya MCU 部署工具 (CLI 入口)
向後相容的薄層包裝，委派給 deploy 套件的工廠模式。

使用方法:
    python deploy_mcu.py <port> <code_file> [--no-monitor] [--monitor-only] [--erase-filesystem]"""

import sys
import argparse

# 確保 resources 目錄在 path 中（向後相容）
if __name__ == "__main__":
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from deploy import get_deployer
from deploy.base import detect_board

# === 輸出編碼修復：Windows 管線下預設 cp950，強制 UTF-8 避免 Tauri 終端機亂碼（對齊 PC 訓練模板） ===
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')


def main():
    parser = argparse.ArgumentParser(description="Cocoya MCU Deployer")
    parser.add_argument("port", help="Serial port (e.g., COM3 or /dev/ttyUSB0)")
    parser.add_argument("code_file", nargs="?", help="Python code file to deploy")
    parser.add_argument("--no-monitor", action="store_true", help="Disable serial monitor after upload")
    parser.add_argument("--monitor-only", action="store_true", help="Only start serial monitor")
    parser.add_argument("--serial-only", action="store_true", help="Use serial only mode")
    parser.add_argument("--erase-filesystem", action="store_true", help="Erase all files (deep repair)")
    parser.add_argument("--board-type", default="micropython",
                        choices=["micropython", "pybricks", "spike-official", "auto"],
                        help="Firmware type (default: micropython, or auto-detect)")
    parser.add_argument("--tauri", action="store_true", help="Running in Tauri mode")
    parser.add_argument("--lang", default="en", help="Language code (zh-hant or en)")
    args = parser.parse_args()

    # 自動偵測
    board_type = args.board_type
    if board_type == "auto":
        print("[Auto-detecting board type...]")
        board_type = detect_board(args.port)
        print(f"[Detected: {board_type}]")
        if board_type == "unknown":
            board_type = "micropython"
            print("[Fallback to micropython mode]")

    # 取得部署器
    deployer = get_deployer(board_type)

    lease_module = None
    if args.tauri and not args.monitor_only and os.environ.get("COCOYA_SERIAL_HUB_EXTERNAL_UPLOAD_LEASE") != "1":
        from deploy import serial_hub as lease_module
        try:
            lease_module.acquire_upload_lease(args.port, 115200)
        except Exception as exc:
            error_code = str(exc).split(":", 1)[0]
            if args.lang == "zh-hant":
                hint = "序列埠目前由其他程式寫入或占用，請關閉占用的視窗或序列埠程式後再試。"
            else:
                hint = "The serial port is in use. Close the window or serial application using it, then try again."
            print(f"{error_code}: {hint}", file=sys.stderr, flush=True)
            raise SystemExit(2)

    try:
        # 執行對應操作。上傳後若進入 monitor，BaseDeployer.monitor 會先關閉
        # 直接持有的 serial handle，再釋放 Hub lease 並改用 Hub monitor subscriber。
        if args.monitor_only:
            deployer.monitor(args.port, lang=args.lang, is_tauri=args.tauri)
        elif args.erase_filesystem:
            deployer.erase_filesystem(args.port, lang=args.lang)
        else:
            if not args.code_file:
                parser.error("code_file is required for deployment")
            deployer.deploy(
                args.port,
                args.code_file,
                lang=args.lang,
                use_mon=not args.no_monitor,
                is_tauri=args.tauri
            )
    finally:
        if lease_module:
            lease_module.release_upload_lease()


if __name__ == "__main__":
    main()
