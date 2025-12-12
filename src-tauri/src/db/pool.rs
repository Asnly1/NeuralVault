use std::{path::Path, str::FromStr, time::Duration};

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};

use super::{DbPool, MIGRATOR};

pub async fn init_pool(db_path: impl AsRef<Path>) -> Result<DbPool, sqlx::Error> {
    // 任何一种实现了 AsRef<Path> 接口的数据类型
    // 如果类型 A 实现了 AsRef<B>，意思就是" A 可以很容易、很低成本地被借用看作是 B "
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
