"""
统一的日志配置模块
配置使用 logging 模块输出结构化日志
"""
import sys
import logging


def setup_logging(level: int = logging.INFO) -> None:
    """
    配置全局日志格式
    
    Args:
        level: 日志级别，默认 INFO
    """
    # 创建格式化器
    formatter = logging.Formatter(
        # asctime: 根据 datefmt 指定的格式输出时间
        # name: logger 的名称
        # message: 日志消息
        fmt="%(asctime)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    # 配置 stdout handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    # 决定 handler 的最低输出级别
    handler.setLevel(level)
    
    # 配置根 logger
    root_logger = logging.getLogger()
    # 决定项目日志的最低输出级别
    root_logger.setLevel(level)
    # 清空所有已有的 handler
    root_logger.handlers.clear()
    # 添加我们刚才配置的 handler
    root_logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """
    获取指定名称的 logger
    
    Args:
        name: logger 名称，建议使用模块名称或组件名称
        
    Returns:
        配置好的 logger 实例
    """
    # 这个name就对应 %name%
    return logging.getLogger(name)
