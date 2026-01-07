//! 统一错误类型定义
//!
//! 使用 `thiserror` 简化错误类型定义，
//! 提供 `AppError` 枚举和 `AppResult` 类型别名。

use serde::Serialize;
use thiserror::Error;

/// 应用级统一错误类型
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Custom(String),

    // [error("...")] (实现 Display trait)
    // 语法: #[error("Database error: {0}")]
    // 含义: 自动为这个错误类型实现 std::fmt::Display trait。
    // {0} 的作用: 这是一个占位符，代表元组变体中的第 0 个字段（即 sqlx::Error）。
    // 效果: 当你调用 .to_string() 或 println!("{}", e) 时，Rust 会先调用底层 sqlx::Error 的 Display 实现，然后把它填入 {0}，
    // 最终输出类似 "Database error: connection refused" 的字符串。

    // 因为有了 #[from]，这里的一个问号 (?) 自动完成了两件事：
    // 1. 捕获 sqlx::Error
    // 2. 调用 AppError::from(sqlx_error) 把它包装成 AppError::Database(sqlx_error)
    // 3. 提前返回 Err
    // let user = sqlx::query_as!(User, "SELECT * FROM users").fetch_one(&pool).await?;

    // 如果没有 #[from]，就不能直接用 ?，必须写成：
    // let user = sqlx::query_as!(...)
    // .fetch_one(&pool)
    // .await
    // .map_err(|e| AppError::Database(e))?;
}

// ========== From 实现：String 和 &str ==========

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Custom(s)
    }
}

// 没有这个：
// 假设你有一个 String 类型的错误消息
// let msg = "用户权限不足".to_string();

// 你必须这样包裹它
// return Err(AppError::Custom(msg));

// 有了这个：
// 编译器知道返回值是 AppResult，会自动推断 into() 目标是 AppError
// return Err(msg.into());

// String: 数据拥有者
// &str: 数据借用者(只读)
impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Custom(s.to_string())
    }
}

// ========== Serialize 实现：Tauri 需要序列化错误 ==========

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;

        // 1. 开始构建一个“结构体”（即 JSON 对象）
        // "AppError" 是名字（通常用于 XML 等，JSON 中忽略），2 是预计字段数量
        let mut state = serializer.serialize_struct("AppError", 2)?;
        // 2. 根据枚举变体，手动写入 "type" 字段
        // 这里把 Rust 的类型系统映射成了简单的字符串标签
        match self {
            AppError::Database(_) => state.serialize_field("type", "database")?,
            AppError::Io(_) => state.serialize_field("type", "io")?,
            AppError::Custom(_) => state.serialize_field("type", "custom")?,
        }
        // 3. 写入 "message" 字段
        // self.to_string() 会调用 thiserror 定义的 #[error(...)] 格式化逻辑
        state.serialize_field("message", &self.to_string())?;
        // 4. 结束序列化，封闭 JSON 对象（相当于补上右大括号 }）
        state.end()
    }
    // 例子
    // {
    //     "type": "database",
    //     "message": "Database error: connection refused"
    // }
}

/// 应用级 Result 类型别名
pub type AppResult<T> = Result<T, AppError>;
