"""
Cocoya Deploy Module
統一的 MCU 部署工廠，支援 MicroPython 與 Pybricks 等韌體。

使用方式：
    from deploy import get_deployer
    deployer = get_deployer("micropython")
    deployer.deploy(port, code_file, lang="zh-hant")
"""

from .base import BaseDeployer, get_msg, MESSAGES
from .micropython import MicroPythonDeployer
from .pybricks import PybricksDeployer

# 註冊表：board_type -> Deployer 類別
_DEPLOYERS = {
    "micropython": MicroPythonDeployer,
    "pybricks": PybricksDeployer,
}


def get_deployer(board_type: str) -> BaseDeployer:
    """
    取得對應的 Deployer 實例。
    
    Args:
        board_type: 韌體類型 ("micropython" 或 "pybricks")
    
    Returns:
        BaseDeployer 子類別實例
    
    Raises:
        ValueError: 不支援的 board_type
    """
    cls = _DEPLOYERS.get(board_type)
    if cls is None:
        raise ValueError(f"不支援的 board_type: {board_type}。可用: {list(_DEPLOYERS.keys())}")
    return cls()


def register_deployer(board_type: str, cls):
    """註冊自訂 Deployer（擴充用）"""
    _DEPLOYERS[board_type] = cls


__all__ = [
    "get_deployer",
    "register_deployer",
    "BaseDeployer",
    "MicroPythonDeployer",
    "PybricksDeployer",
    "get_msg",
    "MESSAGES",
]