"""
数据库模式验证脚本

确保 Python SQLModel 与 Rust/SQLite 数据库模式保持一致。
检查项目：
1. 表是否存在
2. 列是否存在、类型是否匹配、nullable 是否一致
3. CHECK 约束（Enum 值）是否一致
4. 索引是否存在
5. 外键是否正确
"""
import re
import sys
from pathlib import Path
from typing import List, Set, Dict, Any, Optional
from dataclasses import dataclass, field

# 添加父目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine.reflection import Inspector
from sqlmodel import SQLModel

from app.core.config import settings

# 导入所有模型以注册到 SQLModel.metadata
from app.models.sql_models import (
    User, Task, Resource, TaskResourceLink,
    ContextChunk, ChatSession, ChatMessage,
    # Enums
    TaskStatus, TaskPriority, FileType, SyncStatus,
    ProcessingStage, ClassificationStatus, VisibilityScope,
    SessionType, MessageRole
)


@dataclass
class ValidationResult:
    """验证结果"""
    table_name: str
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0


# ============================================================
# Enum 与 CHECK 约束映射
# ============================================================
# 定义每个表中哪些列应该有 CHECK 约束，以及对应的 Python Enum
ENUM_COLUMN_MAP = {
    "tasks": {
        "status": TaskStatus,
        "priority": TaskPriority,
    },
    "resources": {
        "file_type": FileType,
        "sync_status": SyncStatus,
        "processing_stage": ProcessingStage,
        "classification_status": ClassificationStatus,
    },
    "task_resource_link": {
        "visibility_scope": VisibilityScope,
    },
    "chat_sessions": {
        "session_type": SessionType,
    },
    "chat_messages": {
        "role": MessageRole,
    },
}


def parse_check_constraint(constraint_sql: str) -> Optional[Set[str]]:
    """
    解析 CHECK 约束中的允许值
    例如: "status IN ('todo','done')" -> {'todo', 'done'}
    """
    if not constraint_sql:
        return None
    
    # 匹配 IN (...) 模式
    match = re.search(r"IN\s*\((.*?)\)", constraint_sql, re.IGNORECASE)
    if match:
        values_str = match.group(1)
        # 提取引号内的值
        values = re.findall(r"'([^']*)'", values_str)
        return set(values)
    return None


def get_enum_values(enum_class) -> Set[str]:
    """获取 Enum 类的所有值"""
    return {e.value for e in enum_class}


def compare_columns(
    table_name: str,
    db_columns: List[Dict],
    model_columns: Dict
) -> ValidationResult:
    """对比特定表的列差异"""
    result = ValidationResult(table_name=table_name)
    
    # 提取数据库中的列信息
    db_col_map = {col['name']: col for col in db_columns}
    db_col_names = set(db_col_map.keys())
    
    # 提取 Python Model 中的列信息
    model_col_names = set(model_columns.keys())
    
    # 1. 检查缺失的列 (Python 有，数据库没有) -> 严重错误
    missing_in_db = model_col_names - db_col_names
    if missing_in_db:
        result.errors.append(f"❌ [CRITICAL] 数据库缺少列: {missing_in_db}")

    # 2. 检查多余的列 (数据库有，Python 没有) -> 警告
    extra_in_db = db_col_names - model_col_names
    if extra_in_db:
        result.warnings.append(f"⚠️  [WARN] 数据库多余列 (Python 未定义): {extra_in_db}")

    # 3. 检查 nullable 一致性
    for col_name in model_col_names & db_col_names:
        db_col = db_col_map[col_name]
        model_col = model_columns[col_name]
        
        model_nullable = model_col.nullable
        db_nullable = db_col['nullable']
        
        # 跳过主键字段（SQLite 的 INTEGER PRIMARY KEY 总是允许 NULL 作为插入值）
        if db_col.get('primary_key'):
            continue
        
        # 跳过有默认值的字段（SQLite DEFAULT 意味着可以不传值）
        if db_col.get('default') is not None:
            continue
        
        if model_nullable != db_nullable:
            if not model_nullable and db_nullable:
                # Python 要求非空，但数据库允许空 -> 真正的风险
                result.errors.append(
                    f"❌ [RISK] 列 '{col_name}': Python 要求 NOT NULL, 但数据库允许 NULL"
                )
            elif model_nullable and not db_nullable:
                result.errors.append(
                    f"❌ [RISK] 列 '{col_name}': Python 允许 NULL, 但数据库要求 NOT NULL"
                )

    return result


def validate_check_constraints(
    table_name: str,
    inspector: Inspector,
    result: ValidationResult
):
    """验证 CHECK 约束与 Python Enum 一致"""
    if table_name not in ENUM_COLUMN_MAP:
        return
    
    # 获取表的 CHECK 约束
    try:
        check_constraints = inspector.get_check_constraints(table_name)
    except Exception:
        # SQLite 可能不支持直接获取 CHECK 约束
        result.warnings.append("⚠️  无法获取 CHECK 约束信息（需要手动验证）")
        return
    
    # 构建列名到约束的映射
    constraint_map = {}
    for constraint in check_constraints:
        sql = constraint.get('sqltext', '')
        # 尝试从 SQL 中提取列名
        for col_name in ENUM_COLUMN_MAP[table_name].keys():
            if col_name in sql:
                constraint_map[col_name] = sql
    
    # 验证每个 Enum 列
    for col_name, enum_class in ENUM_COLUMN_MAP[table_name].items():
        python_values = get_enum_values(enum_class)
        
        if col_name in constraint_map:
            db_values = parse_check_constraint(constraint_map[col_name])
            if db_values:
                # 检查 Python Enum 值是否都在数据库 CHECK 中
                missing_in_db = python_values - db_values
                if missing_in_db:
                    result.errors.append(
                        f"❌ [ENUM] 列 '{col_name}': Python Enum 值 {missing_in_db} 不在数据库 CHECK 约束中"
                    )
                
                # 检查数据库 CHECK 值是否都在 Python Enum 中
                extra_in_db = db_values - python_values
                if extra_in_db:
                    result.warnings.append(
                        f"⚠️  [ENUM] 列 '{col_name}': 数据库 CHECK 包含 Python 未定义的值: {extra_in_db}"
                    )


def validate_indexes(
    table_name: str,
    inspector: Inspector,
    model_columns: Dict,
    result: ValidationResult
):
    """验证索引是否存在"""
    # 获取数据库中的索引
    db_indexes = inspector.get_indexes(table_name)
    db_indexed_columns = set()
    for idx in db_indexes:
        for col in idx.get('column_names', []):
            if col:
                db_indexed_columns.add(col)
    
    # 获取主键（也算索引）
    pk_constraint = inspector.get_pk_constraint(table_name)
    for col in pk_constraint.get('constrained_columns', []):
        db_indexed_columns.add(col)
    
    # 检查 Python 中标记为 index=True 的列
    for col_name, col in model_columns.items():
        if hasattr(col, 'index') and col.index:
            if col_name not in db_indexed_columns:
                result.warnings.append(
                    f"⚠️  [INDEX] 列 '{col_name}': Python 标记 index=True, 但数据库无对应索引"
                )


def validate_foreign_keys(
    table_name: str,
    inspector: Inspector,
    model_columns: Dict,
    result: ValidationResult
):
    """验证外键关系"""
    # 获取数据库中的外键
    db_fks = inspector.get_foreign_keys(table_name)
    db_fk_map = {}
    for fk in db_fks:
        for col in fk.get('constrained_columns', []):
            db_fk_map[col] = {
                'referred_table': fk.get('referred_table'),
                'referred_columns': fk.get('referred_columns', [])
            }
    
    # 检查 Python 模型中定义的外键
    for col_name, col in model_columns.items():
        # SQLModel 的外键信息存储方式
        fk_references = list(col.foreign_keys) if hasattr(col, 'foreign_keys') else []
        
        for fk_ref in fk_references:
            # fk_ref.target_fullname 格式: "table.column"
            target = str(fk_ref.target_fullname) if hasattr(fk_ref, 'target_fullname') else str(fk_ref)
            
            if col_name not in db_fk_map:
                result.errors.append(
                    f"❌ [FK] 列 '{col_name}': Python 定义外键 -> {target}, 但数据库无对应外键"
                )
            else:
                # 验证引用的表和列是否一致
                db_fk = db_fk_map[col_name]
                expected_table = target.split('.')[0] if '.' in target else target
                if db_fk['referred_table'] != expected_table:
                    result.errors.append(
                        f"❌ [FK] 列 '{col_name}': 外键目标不一致 - Python: {target}, DB: {db_fk['referred_table']}"
                    )


def validate_schema_sync(conn) -> List[ValidationResult]:
    """同步执行的验证逻辑"""
    print("🔍 开始模式检查...")
    print("=" * 60)
    
    inspector: Inspector = inspect(conn)
    
    # 获取数据库中真实的表
    db_tables = set(inspector.get_table_names())
    # 排除 SQLite 内部表和 sqlx 迁移表
    db_tables = {t for t in db_tables if not t.startswith('_') and t != 'sqlx_migrations'}
    
    # 获取 Python 中定义的表
    model_tables = set(SQLModel.metadata.tables.keys())
    
    results = []
    
    # 1. 检查缺失的表
    missing_tables = model_tables - db_tables
    if missing_tables:
        result = ValidationResult(table_name="[全局]")
        result.errors.append(f"❌ [CRITICAL] 数据库缺少表: {missing_tables}")
        results.append(result)
    
    # 检查多余的表（数据库有但 Python 没定义）
    extra_tables = db_tables - model_tables
    if extra_tables:
        result = ValidationResult(table_name="[全局]")
        result.warnings.append(f"⚠️  [WARN] 数据库多余表 (Python 未定义): {extra_tables}")
        results.append(result)
    
    # 2. 逐表检查
    for table_name in model_tables:
        if table_name not in db_tables:
            result = ValidationResult(table_name=table_name)
            result.errors.append(f"❌ 表不存在于数据库中")
            results.append(result)
            continue
        
        print(f"\n📋 检查表: [{table_name}]")
        
        # 获取 DB 列信息
        db_columns = inspector.get_columns(table_name)
        
        # 获取 Python Model 列信息
        model_columns = SQLModel.metadata.tables[table_name].columns
        
        # 列对比
        result = compare_columns(table_name, db_columns, model_columns)
        
        # CHECK 约束验证
        validate_check_constraints(table_name, inspector, result)
        
        # 索引验证
        validate_indexes(table_name, inspector, model_columns, result)
        
        # 外键验证
        validate_foreign_keys(table_name, inspector, model_columns, result)
        
        # 只有有错误或警告时才添加
        if result.errors or result.warnings:
            results.append(result)
        else:
            print(f"   ✅ 通过")
    
    return results


def print_results(results: List[ValidationResult]) -> bool:
    """打印结果并返回是否全部通过"""
    print("\n" + "=" * 60)
    print("📊 验证结果汇总")
    print("=" * 60)
    
    has_errors = False
    total_errors = 0
    total_warnings = 0
    
    for result in results:
        if result.errors:
            has_errors = True
            print(f"\n🔴 [{result.table_name}]")
            for err in result.errors:
                print(f"   {err}")
                total_errors += 1
        
        for warn in result.warnings:
            print(f"   {warn}")
            total_warnings += 1
    
    print("\n" + "-" * 60)
    print(f"统计: {total_errors} 错误, {total_warnings} 警告")
    
    if has_errors:
        print("\n🚫 验证失败！请修复上述错误以确保 Python 和 Rust 数据库模式一致。")
        return False
    elif total_warnings > 0:
        print("\n⚠️  验证通过（有警告）: Python 模型与数据库基本一致，但存在一些不一致之处。")
        return True
    else:
        print("\n✅ 验证通过: Python 模型与数据库模式完全一致！")
        return True


def get_database_path() -> Path:
    """获取数据库文件路径"""
    # 优先使用环境变量
    if settings.database_url:
        # 从 URL 中提取路径
        url = settings.database_url
        # 处理各种格式: sqlite:///path, sqlite+aiosqlite:///path, /path
        if ":///" in url:
            path_str = url.split("///")[-1]
        elif "://" in url:
            path_str = url.split("://")[-1]
        else:
            path_str = url
        return Path(path_str)
    
    # 默认路径（开发环境）
    import platform
    if platform.system() == "Darwin":  # macOS
        return Path.home() / "Library" / "Application Support" / "com.hovsco.neuralvault" / "neuralvault.sqlite3"
    elif platform.system() == "Windows":
        import os
        return Path(os.environ.get("APPDATA", "")) / "com.hovsco.neuralvault" / "neuralvault.sqlite3"
    else:  # Linux
        return Path.home() / ".local" / "share" / "com.hovsco.neuralvault" / "neuralvault.sqlite3"


def validate_database() -> bool:
    """主验证函数"""
    print("=" * 60)
    print("🛡️  数据库模式验证 (Python SQLModel vs Rust/SQLite)")
    print("=" * 60)
    
    # 获取数据库路径
    db_path = get_database_path()
    print(f"📁 目标数据库: {db_path}")
    
    # 检查数据库文件是否存在
    if not db_path.exists():
        print(f"❌ 数据库文件不存在: {db_path}")
        print("   请先运行 Tauri 应用以创建数据库。")
        return False
    
    try:
        # 使用同步引擎直接连接 SQLite 文件
        # 注意：使用标准的 sqlite:/// 格式
        engine = create_engine(f"sqlite:///{db_path}")
        
        with engine.connect() as conn:
            results = validate_schema_sync(conn)
        
        engine.dispose()
        return print_results(results)
            
    except Exception as e:
        print(f"❌ 验证过程中发生错误: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = validate_database()
    sys.exit(0 if success else 1)