//! 通用验证函数
//!
//! 提供集中的验证逻辑，避免在命令层重复验证代码

use crate::db::{EdgeRelationType, ReviewStatus};
use crate::error::{AppError, AppResult};

/// 验证标题非空
///
/// 返回 trim 后的字符串引用
pub fn validate_title(title: &str) -> AppResult<&str> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("标题不能为空".to_string()));
    }
    Ok(trimmed)
}

/// 验证字符串非空（通用）
#[allow(dead_code)]
pub fn validate_not_empty<'a>(value: &'a str, field_name: &str) -> AppResult<&'a str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(format!("{} 不能为空", field_name)));
    }
    Ok(trimmed)
}

/// 解析关系类型
#[allow(dead_code)]
pub fn parse_relation_type(raw: &str) -> AppResult<EdgeRelationType> {
    match raw {
        "contains" => Ok(EdgeRelationType::Contains),
        "related_to" => Ok(EdgeRelationType::RelatedTo),
        _ => Err(AppError::Validation(format!("未知的关系类型: {}", raw))),
    }
}

/// 解析审核状态
pub fn parse_review_status(raw: &str) -> AppResult<ReviewStatus> {
    match raw {
        "unreviewed" => Ok(ReviewStatus::Unreviewed),
        "reviewed" | "approved" => Ok(ReviewStatus::Reviewed),
        "rejected" => Ok(ReviewStatus::Rejected),
        _ => Err(AppError::Validation(format!("未知的审核状态: {}", raw))),
    }
}

/// 解析审核状态（带默认值）
pub fn parse_review_status_or_default(raw: Option<&str>) -> ReviewStatus {
    match raw {
        Some("approved") | Some("reviewed") => ReviewStatus::Reviewed,
        Some("rejected") => ReviewStatus::Rejected,
        _ => ReviewStatus::Unreviewed,
    }
}

/// 验证 node_id 有效
#[allow(dead_code)]
pub fn validate_node_id(node_id: i64) -> AppResult<i64> {
    if node_id <= 0 {
        return Err(AppError::Validation("无效的节点 ID".into()));
    }
    Ok(node_id)
}

/// 验证限制值范围
#[allow(dead_code)]
pub fn validate_limit(limit: Option<i32>, default: i32, max: i32) -> i32 {
    limit.unwrap_or(default).max(1).min(max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_title() {
        assert!(validate_title("  ").is_err());
        assert!(validate_title("").is_err());
        assert_eq!(validate_title("  hello  ").unwrap(), "hello");
        assert_eq!(validate_title("hello").unwrap(), "hello");
    }

    #[test]
    fn test_parse_relation_type() {
        assert_eq!(
            parse_relation_type("contains").unwrap(),
            EdgeRelationType::Contains
        );
        assert_eq!(
            parse_relation_type("related_to").unwrap(),
            EdgeRelationType::RelatedTo
        );
        assert!(parse_relation_type("unknown").is_err());
    }

    #[test]
    fn test_parse_review_status() {
        assert_eq!(
            parse_review_status("reviewed").unwrap(),
            ReviewStatus::Reviewed
        );
        assert_eq!(
            parse_review_status("approved").unwrap(),
            ReviewStatus::Reviewed
        );
        assert_eq!(
            parse_review_status("rejected").unwrap(),
            ReviewStatus::Rejected
        );
        assert_eq!(
            parse_review_status("unreviewed").unwrap(),
            ReviewStatus::Unreviewed
        );
        assert!(parse_review_status("unknown").is_err());
    }

    #[test]
    fn test_validate_limit() {
        assert_eq!(validate_limit(None, 20, 100), 20);
        assert_eq!(validate_limit(Some(50), 20, 100), 50);
        assert_eq!(validate_limit(Some(0), 20, 100), 1);
        assert_eq!(validate_limit(Some(200), 20, 100), 100);
    }
}
