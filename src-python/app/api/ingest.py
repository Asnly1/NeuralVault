"""
接收 Rust 的"新文件/新任务"通知
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal

from app.core.db import get_db
from app.workers.queue_manager import task_queue


router = APIRouter()