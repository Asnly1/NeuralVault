"""
不是对话的 AI 任务处理 (标签，任务拆解等)
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.db import get_db


router = APIRouter()
