import { Task, priorityConfig } from "../types";

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <article
      className={`task-card ${isOverdue ? "overdue" : ""}`}
      onClick={onClick}
    >
      <div className="task-card-header">
        <span
          className="priority-dot"
          style={{ background: priorityConfig[task.priority].color }}
          title={`优先级: ${priorityConfig[task.priority].label}`}
        />
        <h4 className="task-title">{task.title || "未命名任务"}</h4>
      </div>

      {task.description && <p className="task-desc">{task.description}</p>}

      <div className="task-meta">
        <span className={`priority-badge priority-${task.priority}`}>
          {priorityConfig[task.priority].label}
        </span>
        {task.due_date && (
          <span className={`due-badge ${isOverdue ? "overdue" : ""}`}>
            {isOverdue ? "⚠ " : ""}
            {task.due_date.toLocaleDateString("zh-CN")}
          </span>
        )}
      </div>
    </article>
  );
}

