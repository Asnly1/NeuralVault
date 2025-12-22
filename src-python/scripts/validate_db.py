import asyncio
import sys
from pathlib import Path
from typing import List, Set, Dict

# 添加父目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect
from sqlalchemy.engine.reflection import Inspector
from sqlmodel import SQLModel

from app.core.config import settings
from app.core.db import DatabaseManager
# 必须导入所有模型，以便 SQLModel.metadata 能够注册它们
from app.models.sql_models import Resource, Task, User, ContextChunk, TaskResourceLink, ChatSession, ChatMessage

def compare_columns(db_columns: List[Dict], model_columns: Dict) -> List[str]:
    """对比特定表的列差异"""
    errors = []
    
    # 提取数据库中的列信息
    db_col_map = {col['name']: col for col in db_columns}
    db_col_names = set(db_col_map.keys())
    
    # 提取 Python Model 中的列信息
    model_col_names = set(model_columns.keys())
    
    # 1. 检查缺失的列 (Python 有，数据库没有) -> 严重错误，会导致崩溃
    missing_in_db = model_col_names - db_col_names
    if missing_in_db:
        errors.append(f"❌ [CRITICAL] Missing columns in DB: {missing_in_db}")

    # 2. 检查多余的列 (数据库有，Python 没有) -> 通常只是浪费空间，但最好知晓
    extra_in_db = db_col_names - model_col_names
    if extra_in_db:
        print(f"   ⚠️  [WARN] Extra columns in DB (not in Python): {extra_in_db}")

    # 3. 检查属性一致性 (Nullable, Primary Key)
    for col_name in model_col_names & db_col_names:
        db_col = db_col_map[col_name]
        model_col = model_columns[col_name]
        
        # 检查 Nullable
        # SQLModel/SQLAlchemy 的 nullable 属性
        model_nullable = model_col.nullable
        db_nullable = db_col['nullable']
        
        # 注意：SQLModel 某些情况下默认 nullable=True 除非显式 Field(nullable=False)
        # 这里做一个宽容的对比，或者严格对比
        if model_nullable != db_nullable:
            # 只有当 DB 是 nullable 但 Python 要求 not null 时才是严重风险
            if not model_nullable and db_nullable:
                 errors.append(f"❌ [RISK] Column '{col_name}': Python expects NOT NULL, but DB allows NULL")
            elif model_nullable and not db_nullable:
                 # Python 允许空，数据库不允许 -> 插入时可能报错
                 # 但如果是主键，通常数据库会自动生成，所以排除主键
                 if not db_col['primary_key']:
                    errors.append(f"❌ [RISK] Column '{col_name}': Python allows NULL, but DB is NOT NULL")

    return errors

def validate_schema_sync(conn):
    """同步执行的验证逻辑（在 run_sync 中调用）"""
    print("🔍 Starting Schema Inspection...")
    inspector: Inspector = inspect(conn)
    
    # 获取数据库中真实的表
    db_tables = set(inspector.get_table_names())
    # 获取 Python 中定义的表
    model_tables = set(SQLModel.metadata.tables.keys())
    
    all_errors = []
    
    # 1. 检查表是否存在
    missing_tables = model_tables - db_tables
    if missing_tables:
        all_errors.append(f"❌ [CRITICAL] Missing Tables in DB: {missing_tables}")
    
    # 2. 逐表检查列
    for table_name in model_tables:
        if table_name not in db_tables:
            all_errors.extend([f"Table '{table_name}': Table not found in Rust DB"])
            continue
            
        print(f"Checking table: [{table_name}]...")
        
        # 获取 DB 列信息
        # 格式: [{'name': 'id', 'type': INTEGER(), 'nullable': False, 'default': None, 'primary_key': 1}, ...]
        db_columns = inspector.get_columns(table_name)
        
        # 获取 Python Model 列信息
        # SQLModel.metadata.tables[table_name].columns 是一个 ColumnCollection
        model_columns = SQLModel.metadata.tables[table_name].columns
        
        table_errors = compare_columns(db_columns, model_columns)
        if table_errors:
            all_errors.extend([f"Table '{table_name}': {err}" for err in table_errors])
            
    return all_errors

async def validate_database():
    print("=" * 60)
    print("🛡️  Strict Database Schema Validation (Python vs Rust/SQLite)")
    print("=" * 60)
    
    # 确保设置了数据库路径
    if not settings.database_url:
        # 开发环境默认路径逻辑
        db_path = Path.home() / "Library" / "Application Support" / "com.neuralvault.app" / "neuralvault.db"
        settings.database_url = f"sqlite:///{db_path}"
        print(f"Target Database: {db_path}")

    try:
        db_manager = await DatabaseManager.get_instance()
        
        # 使用 run_sync 执行同步的 inspector 代码
        async with db_manager.engine.connect() as conn:
            errors = await conn.run_sync(validate_schema_sync)
            
        print("-" * 60)
        if errors:
            print("🚫 Validation FAILED with the following errors:")
            for err in errors:
                print(err)
            return False
        else:
            print("✅ Validation PASSED: Python models match Database schema.")
            return True
            
    except Exception as e:
        print(f"❌ Fatal Error during validation: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(validate_database())
    sys.exit(0 if success else 1)