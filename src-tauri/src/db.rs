use std::{path::Path, str::FromStr, time::Duration};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::types::Json;
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    FromRow, Pool, Sqlite, SqlitePool, Type,
};

pub type DbPool = Pool<Sqlite>;

pub static MIGRATOR: Migrator = sqlx::migrate!();
// sqlx::migrate!() 是一个宏（Macro）。它会在编译时查找你项目根目录下的 migrations 文件夹（你需要自己创建这个文件夹，并在里面放 .sql 文件）。
// 它会把这些 SQL 文件的内容“打包”进你最后编译出来的二进制可执行文件中。
#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
// Type: 告诉 sqlx 枚举对应数据库里的什么类型。在 sqlx 中没有声明类型，默认为String
// Clone + Copy: 把数据直接进行按位复制，而不是移动所有权
// Clone: 表示这个类型可以被显式地复制（通过调用 .clone() 方法）
// Copy: 表示这个类型可以被隐式地复制（通过 = 赋值）
// Rust 规定： 如果一个类型想要支持隐式复制 (Copy)，它必须先支持显式复制 (Clone)。Copy 依赖于 Clone。
// 逻辑是：既然系统能自动帮你复制（Copy），那你手动复制（Clone）肯定也是没问题的。
#[sqlx(rename_all = "lowercase")]
//  这告诉 sqlx 把枚举变体映射为小写字符串存入数据库
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Todo,
    Done,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "PascalCase")]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    High,
    Medium,
    Low,
}

#[derive(Debug, FromRow, PartialEq, Serialize)]
// Debug: 允许你用 {:?} 格式化打印这个结构体
// FromRow: 告诉 sqlx 如何把数据库查询结果的一行自动“映射”成 Rust 结构体
// PartialEq 和 Eq: 允许比较两个TaskRecord 是否相等（使用 == 操作符）
// PartialEq：只满足对称性（a == b => b == a）和传递性（a == b && b == c => a == c）
// Eq：在 PartialEq 的基础上，还必须满足自反性（a == a）
// Nan != Nan, 所以f32和f64不能实现Eq
// Json<Value>包含浮点数，所以不能用Eq
pub struct TaskRecord {
    pub task_id: i64,
    pub uuid: String,
    pub parent_task_id: Option<i64>,
    pub root_task_id: Option<i64>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub suggested_subtasks: Option<Json<Value>>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub created_at: Option<String>,
    pub user_updated_at: Option<String>,
    pub system_updated_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub user_id: i64,
}

pub struct NewTask<'a> {
    pub uuid: &'a str,
    pub parent_task_id: Option<i64>,
    pub root_task_id: Option<i64>,
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub suggested_subtasks: Option<&'a Value>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<&'a str>,
    pub user_id: i64,
}

// HUD 来源元数据，存 JSON
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
// Serialize: 它会自动把你的 SourceMeta { url: Some("..."), ... } 变成类似 {"url": "...", "window_title": "..."} 的字符串
// Deserialize: 它会自动解析输入的 JSON 字符串，并尝试构建出一个合法的 SourceMeta 结构体实例。
pub struct SourceMeta {
    pub url: Option<String>,
    pub window_title: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceSyncStatus {
    Pending,
    Synced,
    Dirty,
    Error,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceProcessingStage {
    Todo,
    Chunking,
    Embedding,
    Done,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceFileType {
    Text,
    Image,
    Pdf,
    Url,
    Epub,
    Other,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceClassificationStatus {
    Unclassified,
    Suggested,
    Linked,
    Ignored,
}

#[derive(Debug, FromRow, PartialEq, Eq, Serialize)]
pub struct ResourceRecord {
    pub resource_id: i64,
    pub uuid: String,
    pub source_meta: Option<Json<SourceMeta>>,
    pub file_hash: String,
    pub file_type: ResourceFileType,
    pub content: Option<String>,
    pub display_name: Option<String>,
    pub file_path: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub indexed_hash: Option<String>,
    pub processing_hash: Option<String>,
    pub sync_status: ResourceSyncStatus,
    pub last_indexed_at: Option<String>,
    pub last_error: Option<String>,
    pub processing_stage: ResourceProcessingStage,
    pub classification_status: ResourceClassificationStatus,
    pub created_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub user_id: i64,
}

pub struct NewResource<'a> {
    pub uuid: &'a str,
    pub source_meta: Option<&'a SourceMeta>,
    pub file_hash: &'a str,
    pub file_type: ResourceFileType,
    pub content: Option<&'a str>,
    pub display_name: Option<&'a str>,
    pub file_path: Option<&'a str>,
    pub file_size_bytes: Option<i64>,
    pub indexed_hash: Option<&'a str>,
    pub processing_hash: Option<&'a str>,
    pub sync_status: ResourceSyncStatus,
    pub last_indexed_at: Option<&'a str>,
    pub last_error: Option<&'a str>,
    pub processing_stage: ResourceProcessingStage,
    pub classification_status: ResourceClassificationStatus,
    pub user_id: i64,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum VisibilityScope {
    This,
    Subtree,
    Global,
}
pub struct LinkResourceParams<'a> {
    pub task_id: i64,
    pub resource_id: i64,
    pub visibility_scope: VisibilityScope,
    pub local_alias: Option<&'a str>,
}

pub async fn init_pool(db_path: impl AsRef<Path>) -> Result<SqlitePool, sqlx::Error> {
    // 任何一种实现了 AsRef<Path> 接口的数据类型
    // 如果类型 A 实现了 AsRef<B>，意思就是“ A 可以很容易、很低成本地被借用看作是 B ”
    let db_url = format!("sqlite://{}", db_path.as_ref().to_string_lossy());
    // as_ref() 把传入的参数借用为Path
    // to_string_lossy() 尝试把路径转为字符串，如果遇到无法识别的乱码字符，它会用 Unicode 替换，而不会让程序崩溃

    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;
    // 末尾的 ? 表示：如果连接失败，直接把错误抛出并结束函数

    MIGRATOR.run(&pool).await?;
    // 检查数据库里的 _sqlx_migrations 表，看看哪些 SQL 脚本还没跑过，然后依次执行它们

    // Seed default user for MVP (user_id = 1) to satisfy FK defaults.
    sqlx::query("INSERT OR IGNORE INTO users (user_id, user_name) VALUES (1, 'default')")
        .execute(&pool)
        .await?;
    Ok(pool)
}

// <'_>: 让编译器自动推导生命周期
pub async fn insert_task(pool: &SqlitePool, params: NewTask<'_>) -> Result<i64, sqlx::Error> {
    // 显式写入状态/优先级，便于调试；不要依赖 DB 默认值
    // 返回的是 Row（数据库行）或者 SqliteQueryResult（执行结果，如插入成功了几行）
    let result = sqlx::query(
        "INSERT INTO tasks (uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, priority, due_date, user_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(params.uuid)
    .bind(params.parent_task_id)
    .bind(params.root_task_id)
    .bind(params.title)
    .bind(params.description)
    .bind(params.suggested_subtasks.map(Json))
    .bind(params.status)
    .bind(params.priority)
    .bind(params.due_date)
    .bind(params.user_id)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
    //获取并返回数据库刚刚为这条新数据自动生成的唯一数字 ID（主键）
}

pub async fn get_task_by_id(pool: &SqlitePool, task_id: i64) -> Result<TaskRecord, sqlx::Error> {
    // _ : 让编译器根据传入的 &SqlitePool 推测出连接 SQLite
    // TaskRecord: 把结果映射回 TaskRecord
    sqlx::query_as::<_, TaskRecord>(
        "SELECT task_id, uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, priority, due_date, created_at, user_updated_at, system_updated_at, is_deleted, deleted_at, user_id \
         FROM tasks WHERE task_id = ?",
    )
    .bind(task_id)
    .fetch_one(pool)
    .await
}

pub async fn list_active_tasks(pool: &SqlitePool) -> Result<Vec<TaskRecord>, sqlx::Error> {
    sqlx::query_as::<_, TaskRecord>(
        "SELECT task_id, uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, priority, due_date, created_at, user_updated_at, system_updated_at, is_deleted, deleted_at, user_id \
         FROM tasks \
         WHERE status = 'todo' AND is_deleted = 0 \
         ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
}

pub async fn insert_resource(
    pool: &SqlitePool,
    params: NewResource<'_>,
) -> Result<i64, sqlx::Error> {
    // 显式写入同步/处理/分类状态，便于调试；不要依赖 DB 默认值
    let result = sqlx::query(
        "INSERT INTO resources (uuid, source_meta, file_hash, file_type, content, display_name, file_path, file_size_bytes, indexed_hash, processing_hash, sync_status, last_indexed_at, last_error, processing_stage, classification_status, user_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(params.uuid)
    .bind(params.source_meta.map(Json))
    .bind(params.file_hash)
    .bind(params.file_type)
    .bind(params.content)
    .bind(params.display_name)
    .bind(params.file_path)
    .bind(params.file_size_bytes)
    .bind(params.indexed_hash)
    .bind(params.processing_hash)
    .bind(params.sync_status)
    .bind(params.last_indexed_at)
    .bind(params.last_error)
    .bind(params.processing_stage)
    .bind(params.classification_status)
    .bind(params.user_id)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn get_resource_by_id(
    pool: &SqlitePool,
    resource_id: i64,
) -> Result<ResourceRecord, sqlx::Error> {
    sqlx::query_as::<_, ResourceRecord>(
        "SELECT resource_id, uuid, source_meta, file_hash, file_type, content, display_name, \
                file_path, file_size_bytes, indexed_hash, processing_hash, sync_status, last_indexed_at, last_error, processing_stage, classification_status, created_at, is_deleted, deleted_at, user_id \
         FROM resources WHERE resource_id = ?",
    )
    .bind(resource_id)
    .fetch_one(pool)
    .await
}

pub async fn list_unclassified_resources(
    pool: &SqlitePool,
) -> Result<Vec<ResourceRecord>, sqlx::Error> {
    sqlx::query_as::<_, ResourceRecord>(
        "SELECT resource_id, uuid, source_meta, file_hash, file_type, content, display_name, \
                file_path, file_size_bytes, indexed_hash, processing_hash, sync_status, last_indexed_at, last_error, processing_stage, classification_status, created_at, is_deleted, deleted_at, user_id \
         FROM resources \
         WHERE classification_status = 'unclassified' AND is_deleted = 0 \
         ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
}

pub async fn link_resource_to_task(
    pool: &SqlitePool,
    params: LinkResourceParams<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO task_resource_link (task_id, resource_id, visibility_scope, local_alias) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(params.task_id)
    .bind(params.resource_id)
    .bind(params.visibility_scope)
    .bind(params.local_alias)
    .execute(pool)
    .await?;

    // 更新资源分类状态为 linked
    sqlx::query("UPDATE resources SET classification_status = 'linked' WHERE resource_id = ?")
        .bind(params.resource_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// 取消资源与任务的关联，并将资源状态改回 unclassified
pub async fn unlink_resource_from_task(
    pool: &SqlitePool,
    task_id: i64,
    resource_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "DELETE FROM task_resource_link WHERE task_id = ? AND resource_id = ?",
    )
    .bind(task_id)
    .bind(resource_id)
    .execute(pool)
    .await?;

    // 检查资源是否还有其他关联，如果没有则恢复为 unclassified
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM task_resource_link WHERE resource_id = ?",
    )
    .bind(resource_id)
    .fetch_one(pool)
    .await?;

    if count == 0 {
        sqlx::query("UPDATE resources SET classification_status = 'unclassified' WHERE resource_id = ?")
            .bind(resource_id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn list_resources_for_task(
    pool: &SqlitePool,
    task_id: i64,
) -> Result<Vec<ResourceRecord>, sqlx::Error> {
    sqlx::query_as::<_, ResourceRecord>(
        "SELECT r.resource_id, r.uuid, r.source_meta, r.file_hash, r.file_type, r.content, \
                r.display_name, r.file_path, r.file_size_bytes, r.indexed_hash, r.processing_hash, \
                r.sync_status, r.last_indexed_at, r.last_error, r.processing_stage, r.classification_status, r.created_at, r.is_deleted, r.deleted_at, r.user_id \
         FROM resources r \
         INNER JOIN task_resource_link l ON l.resource_id = r.resource_id \
         WHERE l.task_id = ?",
    )
    .bind(task_id)
    .fetch_all(pool)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use uuid::Uuid;

    #[tokio::test]
    async fn init_db_runs_migrations_and_enables_wal() {
        // unwrap: 直接把数据从 Ok 盒子里拿出来，如果不成功（是 Err），就直接让程序崩溃
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("neuralvault.sqlite");

        let pool = init_pool(&db_path).await.unwrap();

        // query_scalar: 查询结果只有一列，直接把那一列的值拿出来给我
        let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode;")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(journal_mode.to_lowercase(), "wal");
    }

    #[tokio::test]
    async fn insert_and_query_task_and_resource() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("neuralvault.sqlite");
        let pool = init_pool(&db_path).await.unwrap();

        let task_uuid = Uuid::new_v4().to_string();
        let task_id = insert_task(
            &pool,
            NewTask {
                uuid: &task_uuid,
                title: Some("Demo Task"),
                description: Some("desc"),
                parent_task_id: None,
                root_task_id: None,
                suggested_subtasks: None,
                due_date: None,
                status: TaskStatus::Todo,
                priority: TaskPriority::Medium,
                user_id: 1,
            },
        )
        .await
        .unwrap();
        assert!(task_id > 0);
        let task = get_task_by_id(&pool, task_id).await.unwrap();
        assert_eq!(task.uuid, task_uuid);
        assert_eq!(task.title.as_deref(), Some("Demo Task"));
        assert_eq!(task.status, TaskStatus::Todo);
        assert_eq!(task.user_id, 1);
        assert!(!task.is_deleted);

        let resource_uuid = Uuid::new_v4().to_string();
        let resource_id = insert_resource(
            &pool,
            NewResource {
                uuid: &resource_uuid,
                source_meta: None,
                file_hash: "hash-demo",
                file_type: ResourceFileType::Text,
                content: None,
                display_name: Some("demo.txt"),
                file_path: None,
                file_size_bytes: None,
                indexed_hash: None,
                processing_hash: None,
                sync_status: ResourceSyncStatus::Pending,
                last_indexed_at: None,
                last_error: None,
                processing_stage: ResourceProcessingStage::Todo,
                classification_status: ResourceClassificationStatus::Unclassified,
                user_id: 1,
            },
        )
        .await
        .unwrap();
        assert!(resource_id > 0);
        let resource = get_resource_by_id(&pool, resource_id).await.unwrap();
        assert_eq!(resource.uuid, resource_uuid);
        assert_eq!(resource.file_hash, "hash-demo");
        assert_eq!(resource.file_type, ResourceFileType::Text);
        assert_eq!(
            resource.classification_status,
            ResourceClassificationStatus::Unclassified
        );
        assert_eq!(resource.sync_status, ResourceSyncStatus::Pending);
        assert_eq!(resource.processing_stage, ResourceProcessingStage::Todo);
        assert_eq!(resource.user_id, 1);
        assert!(!resource.is_deleted);

        link_resource_to_task(
            &pool,
            LinkResourceParams {
                task_id,
                resource_id,
                visibility_scope: VisibilityScope::Subtree,
                local_alias: None,
            },
        )
        .await
        .unwrap();

        let linked = list_resources_for_task(&pool, task_id).await.unwrap();
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].resource_id, resource_id);
    }
}
