import { useMemo } from "react";
import { Task, Resource, TaskStatus } from "../types";
import { TaskCard, ResourceCard, QuickCapture } from "../components";

interface DashboardPageProps {
  tasks: Task[];
  resources: Resource[];
  loading: boolean;
  error: string | null;
  onCreateTask: (title: string, description: string) => Promise<void>;
  onSeed: () => void;
  onRefresh: () => void;
  onSelectTask: (task: Task) => void;
}

const columns: { key: TaskStatus; label: string; emoji: string }[] = [
  { key: "inbox", label: "收件箱", emoji: "📥" },
  { key: "todo", label: "待办", emoji: "📋" },
  { key: "doing", label: "进行中", emoji: "⚡" },
];

export function DashboardPage({
  tasks,
  resources,
  loading,
  error,
  onCreateTask,
  onSeed,
  onRefresh,
  onSelectTask,
}: DashboardPageProps) {
  // useMemo: 只有当 tasks 这个数据发生变化时，才重新运行里面的分组逻辑；否则，请直接给我上次算好的结果
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      inbox: [],
      todo: [],
      doing: [],
      done: [],
      archived: [],
    };

    tasks.forEach((task) => {
      if (groups[task.status]) {
        groups[task.status].push(task);
      }
    });

    return groups;
  }, [tasks]);

  return (
    <div className="page-dashboard">
      {/* 顶部栏 */}
      <header className="page-header">
        <div className="header-title">
          <h1>智能看板</h1>
          <p className="header-subtitle">管理你的任务与资源</p>
        </div>
        <div className="header-actions">
          {loading ? (
            <span className="status-badge syncing">同步中...</span>
          ) : (
            <span className="status-badge synced">已同步</span>
          )}
          <button className="btn-icon" onClick={onRefresh} title="刷新">
            ↻
          </button>
          <button className="btn-secondary" onClick={onSeed}>
            生成演示数据
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {/* 快速输入区 */}
      <section className="section-capture">
        <QuickCapture onCreateTask={onCreateTask} loading={loading} />
      </section>

      {/* 任务看板 */}
      <section className="section-board">
        <div className="board-grid">
          {columns.map((col) => (
            <div key={col.key} className="board-column">
              <div className="column-header">
                <span className="column-emoji">{col.emoji}</span>
                <h3 className="column-title">{col.label}</h3>
                <span className="column-count">
                  {groupedTasks[col.key].length}
                </span>
              </div>
              <div className="column-content">
                {groupedTasks[col.key].length > 0 ? (
                  groupedTasks[col.key].map((task) => (
                    <TaskCard
                      key={task.task_id}
                      task={task}
                      onClick={() => onSelectTask(task)}
                    />
                  ))
                ) : (
                  <div className="column-empty">
                    <span className="empty-icon">○</span>
                    <span>暂无任务</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 未分类资源 */}
      <section className="section-resources">
        <div className="section-header">
          <h2>
            <span className="section-icon">📂</span>
            未分类资源
          </h2>
          <span className="resource-count">{resources.length} 项</span>
        </div>

        {resources.length > 0 ? (
          <div className="resources-grid">
            {resources.map((res) => (
              <ResourceCard key={res.resource_id} resource={res} />
            ))}
          </div>
        ) : (
          <div className="resources-empty">
            <span className="empty-icon">◇</span>
            <p>没有未分类的资源</p>
            <p className="empty-hint">使用快捷键 Alt + Space 快速捕获</p>
          </div>
        )}
      </section>
    </div>
  );
}
