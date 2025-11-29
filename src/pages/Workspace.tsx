import { useState, useEffect } from "react";
import { Task, Resource, priorityConfig, resourceTypeIcons } from "../types";
import { fetchTaskResources } from "../api";

interface WorkspacePageProps {
  selectedTask: Task | null;
  onBack: () => void;
}

export function WorkspacePage({ selectedTask, onBack }: WorkspacePageProps) {
  const [chatInput, setChatInput] = useState("");
  const [linkedResources, setLinkedResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  // 加载任务关联的资源
  useEffect(() => {
    if (!selectedTask) {
      setLinkedResources([]);
      return;
    }

    let ignore = false;

    const loadResources = async () => {
      setLoadingResources(true);
      try {
        const data = await fetchTaskResources(selectedTask.task_id);
        if (!ignore) {
          setLinkedResources(data.resources);
        }
      } catch (err) {
        console.error("加载关联资源失败:", err);
        if (!ignore) {
          setLinkedResources([]);
        }
      } finally {
        if (!ignore) {
          setLoadingResources(false);
        }
      }
    };

    loadResources();

    return () => {
      ignore = true;
    };
  }, [selectedTask]);

  if (!selectedTask) {
    return (
      <div className="page-workspace empty-state">
        <div className="empty-workspace">
          <span className="empty-icon-large">⬡</span>
          <h2>选择一个任务开始工作</h2>
          <p>从看板页面点击任务卡片进入工作台</p>
          <button className="btn-primary" onClick={onBack}>
            返回看板
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-workspace">
      {/* 工作台顶栏 */}
      <header className="workspace-header">
        <button className="btn-back" onClick={onBack}>
          ← 返回看板
        </button>
        <div className="workspace-breadcrumb">
          <span className="breadcrumb-item">任务</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">
            {selectedTask.title || "未命名"}
          </span>
        </div>
      </header>

      {/* 三栏布局 */}
      <div className="workspace-layout">
        {/* 左栏: 上下文区 */}
        <aside className="workspace-context">
          <div className="context-section">
            <h3 className="context-title">任务详情</h3>
            <div className="task-detail">
              <h4>{selectedTask.title || "未命名任务"}</h4>
              {selectedTask.description && (
                <p className="detail-desc">{selectedTask.description}</p>
              )}
              <div className="detail-meta">
                <div className="meta-item">
                  <span className="meta-label">状态</span>
                  <span className={`status-tag status-${selectedTask.status}`}>
                    {selectedTask.status}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">优先级</span>
                  <span
                    className={`priority-tag priority-${selectedTask.priority}`}
                  >
                    {priorityConfig[selectedTask.priority].label}
                  </span>
                </div>
                {selectedTask.due_date && (
                  <div className="meta-item">
                    <span className="meta-label">截止日期</span>
                    <span className="date-tag">
                      {selectedTask.due_date.toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="context-section">
            <h3 className="context-title">
              关联资源
              {linkedResources.length > 0 && (
                <span className="context-count">{linkedResources.length}</span>
              )}
            </h3>
            {loadingResources ? (
              <div className="context-loading">加载中...</div>
            ) : linkedResources.length > 0 ? (
              <ul className="context-resources">
                {linkedResources.map((resource) => (
                  <li key={resource.resource_id} className="context-resource-item">
                    <span className="context-resource-icon">
                      {resourceTypeIcons[resource.file_type]}
                    </span>
                    <span className="context-resource-name">
                      {resource.display_name || "未命名文件"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="context-empty">
                <span>暂无关联资源</span>
              </div>
            )}
          </div>
        </aside>

        {/* 中栏: 执行区 */}
        <main className="workspace-main">
          <div className="editor-placeholder">
            <div className="editor-toolbar">
              <span className="toolbar-title">工作区</span>
              <div className="toolbar-actions">
                <button className="btn-tool">📄</button>
                <button className="btn-tool">📕</button>
              </div>
            </div>
            <div className="editor-content">
              <div className="editor-empty">
                <span className="editor-icon">✎</span>
                <p>文本编辑器 / PDF 阅读器</p>
                <p className="editor-hint">选择或拖放文件到此处</p>
              </div>
            </div>
          </div>
        </main>

        {/* 右栏: ChatBox */}
        <aside className="workspace-chat">
          <div className="chat-header">
            <h3>AI 助手</h3>
            <span className="chat-scope">当前任务上下文</span>
          </div>

          <div className="chat-messages">
            <div className="chat-welcome">
              <span className="chat-bot-icon">◆</span>
              <p>你好！我可以帮你分析和处理这个任务相关的内容。</p>
            </div>
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="输入消息... 使用 @ 引用文件"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button className="chat-send" disabled={!chatInput.trim()}>
              ↑
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
