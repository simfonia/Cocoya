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


def main():
    parser = argparse.ArgumentParser(description="Cocoya MCU Deployer")
    parser.add_argument("port", help="Serial port (e.g., COM3 or /dev/ttyUSB0)")
    parser.add_argument("code_file", nargs="?", help="Python code file to deploy")
    parser.add_argument("--no-monitor", action="store_true", help="Disable serial monitor after upload")
    parser.add_argument("--monitor-only", action="store_true", help="Only start serial monitor")
    parser.add_argument("--serial-only", action="store_true", help="Use serial only mode")
    parser.add_argument("--setup-stable", action="store_true", help="Setup stable mode")
    parser.add_argument("--erase-filesystem", action="store_true", help="Erase all files (deep repair)")
    parser.add_argument("--board-type", default="micropython",
                        choices=["micropython", "pybricks", "auto"],
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

    # 執行對應操作
    if args.monitor_only:
        deployer.monitor(args.port, lang=args.lang, is_tauri=args.tauri)
    elif args.erase_filesystem:
        deployer.erase_filesystem(args.port, lang=args.lang)
    elif args.setup_stable:
        deployer.setup_stable_mode(args.port, lang=args.lang)
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


if __name__ == "__main__":
    main()
