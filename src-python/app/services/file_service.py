"""
文件解析 (PDF/Epub) -> Text
使用 PyMuPDF (fitz) 解析 PDF
"""
import asyncio
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

from app.core.config import get_app_data_dir
from app.core.logging import get_logger
from app.models.sql_models import FileType

logger = get_logger("FileService")

# 文件存在性检查的重试配置
MAX_RETRIES = 3
RETRY_DELAYS = [0.5, 1.0, 2.0]  # 秒，指数退避


class FileService:
    """文件解析服务"""
    
    def _resolve_file_path(self, file_path: str) -> Path:
        """
        将相对路径转换为绝对路径
        
        如果是相对路径（如 "assets/xxx.pdf"），则拼接应用数据目录
        如果已经是绝对路径，则直接返回
        """
        path = Path(file_path)
        
        if path.is_absolute():
            return path
        
        # 相对路径：拼接应用数据目录
        app_data_dir = get_app_data_dir()
        return app_data_dir / file_path
    
    async def _wait_for_file(self, path: Path, original_path: str) -> None:
        """
        等待文件存在（处理 Rust 写入延迟的竞态条件）
        
        Args:
            path: 解析后的绝对路径
            original_path: 原始路径（用于错误消息）
        
        Raises:
            FileNotFoundError: 如果重试后文件仍不存在
        """
        for attempt, delay in enumerate(RETRY_DELAYS):
            if path.exists():
                if attempt > 0:
                    logger.info(f"File found after {attempt} retries: {original_path}")
                return
            
            logger.debug(f"File not found, retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES}): {original_path}")
            await asyncio.sleep(delay)
        
        # 最后一次检查
        if path.exists():
            logger.info(f"File found after final retry: {original_path}")
            return
        
        raise FileNotFoundError(f"File not found: {original_path}")
    
    async def parse_file(self, file_path: str, file_type: FileType) -> str:
        """
        解析文件并返回文本内容
        
        Args:
            file_path: 文件路径（相对或绝对）
            file_type: 文件类型
            
        Returns:
            提取的文本内容
        """
        # 解析路径：相对路径 -> 绝对路径
        path = self._resolve_file_path(file_path)
        
        # 等待文件存在（处理 Rust 写入延迟）
        await self._wait_for_file(path, file_path)
        
        match file_type:
            case FileType.pdf:
                return await self._parse_pdf(path)
            case FileType.text:
                return await self._parse_text(path)
            case FileType.epub:
                # TODO: 未来扩展
                raise NotImplementedError("EPUB parsing not yet implemented")
            case FileType.image:
                # TODO: OCR 支持
                raise NotImplementedError("Image OCR not yet implemented")
            case FileType.url:
                # URL 内容应该已经在 content 字段中
                raise ValueError("URL content should be in resource.content field")
            case _:
                # 尝试作为文本读取
                return await self._parse_text(path)
    
    async def _parse_pdf(self, path: Path) -> str:
        """解析 PDF 文件（在线程池中运行，避免阻塞事件循环）"""
        import asyncio
        return await asyncio.to_thread(self._parse_pdf_sync, path)
    
    def _parse_pdf_sync(self, path: Path) -> str:
        """同步解析 PDF 文件"""
        text_parts: list[str] = []
        
        with fitz.open(str(path)) as doc:
            for page_num, page in enumerate(doc):
                page_text = page.get_text()
                if page_text.strip():
                    text_parts.append(f"[Page {page_num + 1}]\n{page_text}")
        
        return "\n\n".join(text_parts)
    
    async def _parse_text(self, path: Path) -> str:
        """解析文本文件"""
        # 尝试多种编码
        encodings = ["utf-8", "gbk", "gb2312", "latin-1"]
        
        for encoding in encodings:
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        
        # 如果都失败，使用 errors='replace'
        return path.read_text(encoding="utf-8", errors="replace")
    
    def get_page_count(self, file_path: str) -> Optional[int]:
        """获取 PDF 页数"""
        try:
            with fitz.open(file_path) as doc:
                return len(doc)
        except Exception:
            return None


# 全局单例
file_service = FileService()