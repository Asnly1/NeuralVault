#[cfg(test)]
mod tests {
    use tempfile::tempdir;
    use uuid::Uuid;

    use super::super::{
        get_task_by_id, init_pool, insert_resource, insert_task, link_resource_to_task,
        list_resources_for_task, LinkResourceParams, NewResource, NewTask,
        ResourceClassificationStatus, ResourceFileType, ResourceProcessingStage,
        ResourceSyncStatus, TaskPriority, TaskStatus, VisibilityScope,
    };

    #[tokio::test]
    async fn init_db_runs_migrations_and_enables_wal() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("neuralvault.sqlite");

        let pool = init_pool(&db_path).await.unwrap();

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
