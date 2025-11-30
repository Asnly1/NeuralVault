import { useState, useEffect, useCallback } from "react";
import { Task, Resource, priorityConfig, resourceTypeIcons } from "../types";
import { fetchTaskResources } from "../api";
import { TiptapEditor } from "../components";

interface WorkspacePageProps {
  selectedTask: Task | null;
  onBack: () => void;
}

export function WorkspacePage({ selectedTask, onBack }: WorkspacePageProps) {
  const [chatInput, setChatInput] = useState("");
  const [linkedResources, setLinkedResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  // 当前选中的资源
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );

  // 编辑器内容
  const [editorContent, setEditorContent] = useState("");

  // 内容是否被修改
  const [isModified, setIsModified] = useState(false);

  // 加载任务关联的资源
  useEffect(() => {
    if (!selectedTask) {
      setLinkedResources([]);
      setSelectedResource(null);
      return;
    }

    let ignore = false;

    const loadResources = async () => {
      setLoadingResources(true);
      try {
        const data = await fetchTaskResources(selectedTask.task_id);
        if (!ignore) {
          setLinkedResources(data.resources);
          // 如果之前选中的资源不在新列表中，清除选中
          if (
            selectedResource &&
            !data.resources.find(
              (r) => r.resource_id === selectedResource.resource_id
            )
          ) {
            setSelectedResource(null);
          }
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

  // 当选中资源变化时，加载内容到编辑器
  useEffect(() => {
    if (selectedResource) {
      // 对于 text 类型，使用 content 字段
      if (selectedResource.file_type === "text") {
        setEditorContent(selectedResource.content || "");
        setIsModified(false);
      } else {
        // 其他类型暂时显示提示
        setEditorContent("");
        setIsModified(false);
      }
    } else {
      setEditorContent("");
      setIsModified(false);
    }
  }, [selectedResource]);

  // 处理资源点击
  const handleResourceClick = useCallback((resource: Resource) => {
    // 如果当前有未保存的修改，可以在这里添加确认对话框
    setSelectedResource(resource);
  }, []);

  // 处理编辑器内容变化
  const handleEditorChange = useCallback((content: string) => {
    setEditorContent(content);
    setIsModified(true);
  }, []);

  // 判断资源是否支持编辑
  const isEditable = (resource: Resource | null): boolean => {
    if (!resource) return false;
    return resource.file_type === "text";
  };

  // 渲染编辑器区域
  const renderEditorArea = () => {
    if (!selectedResource) {
      return (
        <div className="editor-empty">
          <span className="editor-icon">✎</span>
          <p>文本编辑器 / PDF 阅读器</p>
          <p className="editor-hint">从左侧选择一个资源开始查看或编辑</p>
        </div>
      );
    }

    // 检查资源类型
    if (selectedResource.file_type === "text") {
      return (
        <TiptapEditor
          content={editorContent}
          onChange={handleEditorChange}
          editable={true}
          placeholder="开始输入内容..."
        />
      );
    }

    // PDF 类型 - 后续实现
    if (selectedResource.file_type === "pdf") {
      return (
        <div className="editor-empty">
          <span className="editor-icon">📕</span>
          <p>PDF 阅读器</p>
          <p className="editor-hint">PDF 预览功能开发中...</p>
        </div>
      );
    }

    // 图片类型 - 后续实现
    if (selectedResource.file_type === "image") {
      return (
        <div className="editor-empty">
          <span className="editor-icon">🖼️</span>
          <p>图片预览</p>
          <p className="editor-hint">图片预览功能开发中...</p>
        </div>
      );
    }

    // URL 类型
    if (selectedResource.file_type === "url") {
      return (
        <div className="editor-empty">
          <span className="editor-icon">🔗</span>
          <p>链接资源</p>
          <p className="editor-hint">{selectedResource.content || "无内容"}</p>
        </div>
      );
    }

    // 其他类型
    return (
      <div className="editor-empty">
        <span className="editor-icon">📎</span>
        <p>
          {resourceTypeIcons[selectedResource.file_type]}{" "}
          {selectedResource.display_name}
        </p>
        <p className="editor-hint">此类型文件暂不支持预览</p>
      </div>
    );
  };

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
          {selectedResource && (
            <>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-resource">
                {resourceTypeIcons[selectedResource.file_type]}{" "}
                {selectedResource.display_name || "未命名文件"}
              </span>
            </>
          )}
        </div>
        {isModified && <span className="modified-indicator">● 未保存</span>}
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
                  <li
                    key={resource.resource_id}
                    className={`context-resource-item ${
                      selectedResource?.resource_id === resource.resource_id
                        ? "active"
                        : ""
                    }`}
                    onClick={() => handleResourceClick(resource)}
                  >
                    <span className="context-resource-icon">
                      {resourceTypeIcons[resource.file_type]}
                    </span>
                    <span className="context-resource-name">
                      {resource.display_name || "未命名文件"}
                    </span>
                    {isEditable(resource) && (
                      <span className="context-resource-badge">可编辑</span>
                    )}
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
              <span className="toolbar-title">
                {selectedResource
                  ? `${resourceTypeIcons[selectedResource.file_type]} ${
                      selectedResource.display_name || "未命名"
                    }`
                  : "工作区"}
              </span>
              <div className="toolbar-actions">
                {selectedResource && selectedResource.file_type === "text" && (
                  <>
                    <button
                      className="btn-tool"
                      title="保存"
                      disabled={!isModified}
                    >
                      💾
                    </button>
                  </>
                )}
              </div>
            </div>
            <div
              className={`editor-content ${
                selectedResource && selectedResource.file_type === "text"
                  ? "has-editor"
                  : ""
              }`}
            >
              {renderEditorArea()}
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
