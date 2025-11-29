import { useState, useRef, useEffect } from "react";
import { Resource, Task, resourceTypeIcons } from "../types";

interface ResourceCardProps {
  resource: Resource;
  tasks?: Task[];
  onLinkToTask?: (resourceId: number, taskId: number) => Promise<void>;
}

export function ResourceCard({ resource, tasks = [], onLinkToTask }: ResourceCardProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [linking, setLinking] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  const handleLinkClick = () => {
    if (tasks.length > 0 && onLinkToTask) {
      setShowDropdown(!showDropdown);
    }
  };

  const handleSelectTask = async (taskId: number) => {
    if (onLinkToTask && !linking) {
      setLinking(true);
      try {
        await onLinkToTask(resource.resource_id, taskId);
        setShowDropdown(false);
      } finally {
        setLinking(false);
      }
    }
  };

  return (
    <article className="resource-card">
      <span className="resource-icon">
        {resourceTypeIcons[resource.file_type]}
      </span>
      <div className="resource-info">
        <h4 className="resource-name">
          {resource.display_name || "未命名文件"}
        </h4>
        {resource.created_at && (
          <span className="resource-date">
            {resource.created_at.toLocaleDateString("zh-CN")}
          </span>
        )}
      </div>

      {/* 关联按钮 */}
      {onLinkToTask && (
        <div className="resource-actions" ref={dropdownRef}>
          <button
            className="resource-link-btn"
            onClick={handleLinkClick}
            disabled={linking || tasks.length === 0}
            title={tasks.length === 0 ? "暂无可关联的任务" : "关联到任务"}
          >
            {linking ? "⏳" : "🔗"}
          </button>

          {/* 任务选择下拉菜单 */}
          {showDropdown && tasks.length > 0 && (
            <div className="resource-dropdown">
              <div className="dropdown-header">选择任务</div>
              <ul className="dropdown-list">
                {tasks.map((task) => (
                  <li
                    key={task.task_id}
                    className="dropdown-item"
                    onClick={() => handleSelectTask(task.task_id)}
                  >
                    <span className="dropdown-item-icon">
                      {task.status === "inbox" ? "📥" : task.status === "todo" ? "📋" : "⚡"}
                    </span>
                    <span className="dropdown-item-text">
                      {task.title || "无标题"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

