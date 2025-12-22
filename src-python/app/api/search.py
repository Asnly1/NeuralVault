"""
混合检索接口
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any

from app.core.db import get_db


router = APIRouter()