use super::{
    DbPool, NewTopic, NewTopicResourceLink, ResourceRecord, TaskRecord, 
    TopicRecord, TopicResourceLinkRecord, TopicReviewStatus,
};

// ==========================================
// Topic CRUD
// ==========================================

pub async fn insert_topic(pool: &DbPool, params: NewTopic<'_>) -> Result<i64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO topics (title, summary, is_system_default, user_id) VALUES (?, ?, ?, ?)",
    )
    .bind(params.title)
    .bind(params.summary)
    .bind(params.is_system_default)
    .bind(params.user_id)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn get_topic_by_id(pool: &DbPool, topic_id: i64) -> Result<TopicRecord, sqlx::Error> {
    sqlx::query_as::<_, TopicRecord>(
        "SELECT topic_id, title, summary, is_system_default, created_at, updated_at, user_id \
         FROM topics WHERE topic_id = ?",
    )
    .bind(topic_id)
    .fetch_one(pool)
    .await
}

pub async fn get_topic_by_title(pool: &DbPool, title: &str) -> Result<Option<TopicRecord>, sqlx::Error> {
    sqlx::query_as::<_, TopicRecord>(
        "SELECT topic_id, title, summary, is_system_default, created_at, updated_at, user_id \
         FROM topics WHERE title = ?",
    )
    .bind(title)
    .fetch_optional(pool)
    .await
}

pub async fn list_topics(pool: &DbPool) -> Result<Vec<TopicRecord>, sqlx::Error> {
    sqlx::query_as::<_, TopicRecord>(
        "SELECT topic_id, title, summary, is_system_default, created_at, updated_at, user_id \
         FROM topics \
         ORDER BY is_system_default DESC, updated_at DESC",
    )
    .fetch_all(pool)
    .await
}

pub async fn update_topic_title(
    pool: &DbPool,
    topic_id: i64,
    title: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE topics SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE topic_id = ?",
    )
    .bind(title)
    .bind(topic_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_topic_summary(
    pool: &DbPool,
    topic_id: i64,
    summary: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE topics SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE topic_id = ?",
    )
    .bind(summary)
    .bind(topic_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn hard_delete_topic(pool: &DbPool, topic_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM topics WHERE topic_id = ?")
        .bind(topic_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ==========================================
// Topic-Resource Link CRUD
// ==========================================

pub async fn link_resource_to_topic(
    pool: &DbPool,
    params: NewTopicResourceLink,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO topic_resource_link (topic_id, resource_id, confidence_score, is_auto_generated, review_status) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(params.topic_id)
    .bind(params.resource_id)
    .bind(params.confidence_score)
    .bind(params.is_auto_generated)
    .bind(params.review_status)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn unlink_resource_from_topic(
    pool: &DbPool,
    topic_id: i64,
    resource_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM topic_resource_link WHERE topic_id = ? AND resource_id = ?")
        .bind(topic_id)
        .bind(resource_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_topic_resource_link(
    pool: &DbPool,
    topic_id: i64,
    resource_id: i64,
) -> Result<Option<TopicResourceLinkRecord>, sqlx::Error> {
    sqlx::query_as::<_, TopicResourceLinkRecord>(
        "SELECT topic_id, resource_id, confidence_score, is_auto_generated, review_status, created_at, updated_at \
         FROM topic_resource_link WHERE topic_id = ? AND resource_id = ?",
    )
    .bind(topic_id)
    .bind(resource_id)
    .fetch_optional(pool)
    .await
}

pub async fn update_topic_resource_review_status(
    pool: &DbPool,
    topic_id: i64,
    resource_id: i64,
    review_status: TopicReviewStatus,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE topic_resource_link SET review_status = ?, updated_at = CURRENT_TIMESTAMP \
         WHERE topic_id = ? AND resource_id = ?",
    )
    .bind(review_status)
    .bind(topic_id)
    .bind(resource_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_resources_for_topic(
    pool: &DbPool,
    topic_id: i64,
) -> Result<Vec<ResourceRecord>, sqlx::Error> {
    sqlx::query_as::<_, ResourceRecord>(
        "SELECT r.resource_id, r.uuid, r.source_meta, r.summary, r.file_hash, r.file_type, r.content, \
                r.display_name, r.file_path, r.file_size_bytes, r.indexed_hash, r.processing_hash, \
                r.sync_status, r.last_indexed_at, r.last_error, r.processing_stage, r.created_at, \
                r.updated_at, r.is_deleted, r.deleted_at, r.user_id \
         FROM resources r \
         INNER JOIN topic_resource_link l ON l.resource_id = r.resource_id \
         WHERE l.topic_id = ? AND r.is_deleted = 0 \
         ORDER BY l.confidence_score DESC, l.created_at DESC",
    )
    .bind(topic_id)
    .fetch_all(pool)
    .await
}

pub async fn list_topics_for_resource(
    pool: &DbPool,
    resource_id: i64,
) -> Result<Vec<TopicRecord>, sqlx::Error> {
    sqlx::query_as::<_, TopicRecord>(
        "SELECT t.topic_id, t.title, t.summary, t.is_system_default, t.created_at, t.updated_at, t.user_id \
         FROM topics t \
         INNER JOIN topic_resource_link l ON l.topic_id = t.topic_id \
         WHERE l.resource_id = ? \
         ORDER BY l.review_status ASC, l.confidence_score DESC",
    )
    .bind(resource_id)
    .fetch_all(pool)
    .await
}

// ==========================================
// Task-Topic Link CRUD
// ==========================================

pub async fn link_task_to_topic(
    pool: &DbPool,
    task_id: i64,
    topic_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO task_topic_link (task_id, topic_id) VALUES (?, ?)",
    )
    .bind(task_id)
    .bind(topic_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn unlink_task_from_topic(
    pool: &DbPool,
    task_id: i64,
    topic_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM task_topic_link WHERE task_id = ? AND topic_id = ?")
        .bind(task_id)
        .bind(topic_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_topics_for_task(
    pool: &DbPool,
    task_id: i64,
) -> Result<Vec<TopicRecord>, sqlx::Error> {
    sqlx::query_as::<_, TopicRecord>(
        "SELECT t.topic_id, t.title, t.summary, t.is_system_default, t.created_at, t.updated_at, t.user_id \
         FROM topics t \
         INNER JOIN task_topic_link l ON l.topic_id = t.topic_id \
         WHERE l.task_id = ? \
         ORDER BY t.updated_at DESC",
    )
    .bind(task_id)
    .fetch_all(pool)
    .await
}

pub async fn list_tasks_for_topic(
    pool: &DbPool,
    topic_id: i64,
) -> Result<Vec<TaskRecord>, sqlx::Error> {
    sqlx::query_as::<_, TaskRecord>(
        "SELECT t.task_id, t.uuid, t.title, t.description, t.summary, t.status, t.done_date, \
                t.priority, t.due_date, t.created_at, t.updated_at, t.is_deleted, t.deleted_at, t.user_id \
         FROM tasks t \
         INNER JOIN task_topic_link l ON l.task_id = t.task_id \
         WHERE l.topic_id = ? AND t.is_deleted = 0 \
         ORDER BY t.due_date ASC, t.priority DESC",
    )
    .bind(topic_id)
    .fetch_all(pool)
    .await
}
