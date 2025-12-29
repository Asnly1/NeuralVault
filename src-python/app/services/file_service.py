"""
文件解析 (PDF/Epub) -> Text
使用 PyMuPDF (fitz) 解析 PDF
"""
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

from app.models.sql_models import FileType


class FileService:
    """文件解析服务"""
    
    async def parse_file(self, file_path: str, file_type: FileType) -> str:
        """
        解析文件并返回文本内容
        
        Args:
            file_path: 文件路径
            file_type: 文件类型
            
        Returns:
            提取的文本内容
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        match file_type:
            case FileType.PDF:
                return await self._parse_pdf(path)
            case FileType.TEXT:
                return await self._parse_text(path)
            case FileType.EPUB:
                # TODO: 未来扩展
                raise NotImplementedError("EPUB parsing not yet implemented")
            case FileType.IMAGE:
                # TODO: OCR 支持
                raise NotImplementedError("Image OCR not yet implemented")
            case FileType.URL:
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