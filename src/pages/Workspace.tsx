import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Task, Resource, resourceTypeIcons } from "../types";
import { fetchAllResources, fetchTaskResources, getAssetsPath, updateResourceContent, updateResourceDisplayName } from "../api";
import { useLanguage } from "@/contexts/LanguageContext";
import { ContextPanel, EditorPanel, ChatPanel } from "../components/workspace";

interface WorkspacePageProps {
  selectedTask: Task | null;
  selectedResource: Resource | null;
  onBack: () => void;
  onNavigateToSettings?: () => void;
}

const LEFT_MIN = 150;
const LEFT_MAX = 400;
const RIGHT_MIN = 200;
const RIGHT_MAX = 500;

export function WorkspacePage({ selectedTask, selectedResource: propSelectedResource, onBack, onNavigateToSettings }: WorkspacePageProps) {
  const [contextResources, setContextResources] = useState<Resource[]>([]);
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    () => propSelectedResource ?? null
  );
  const [sessionAnchorResourceId, setSessionAnchorResourceId] = useState<number | null>(
    () => propSelectedResource?.resource_id ?? null
  );
  const [editorContent, setEditorContent] = useState("");
  const [isModified, setIsModified] = useState(false);
  const [assetsPath, setAssetsPath] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState("");
  const [viewMode, setViewMode] = useState<'file' | 'text'>('file');

  // Panel resize state
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = localStorage.getItem("neuralvault_workspace_left_width");
    return saved ? parseInt(saved, 10) : 256;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = localStorage.getItem("neuralvault_workspace_right_width");
    return saved ? parseInt(saved, 10) : 288;
  });
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [tempLeftWidth, setTempLeftWidth] = useState<number | null>(null);
  const [tempRightWidth, setTempRightWidth] = useState<number | null>(null);

  const { t } = useLanguage();
  const contextResourceIds = useMemo(
    () => contextResources.map((resource) => resource.resource_id),
    [contextResources]
  );
  const availableContextResources = useMemo(
    () =>
      allResources.filter(
        (resource) => !contextResourceIds.includes(resource.resource_id)
      ),
    [allResources, contextResourceIds]
  );

  // 检测模式：资源模式（直接从资源进入）或任务模式（从任务进入）
  const isResourceMode = !selectedTask && !!propSelectedResource;

  // 当前实际显示的资源
  const currentResource = selectedResource;


  // Load assets path on mount
  useEffect(() => {
    getAssetsPath().then(setAssetsPath).catch(console.error);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchAllResources()
      .then((data) => {
        if (!ignore) setAllResources(data);
      })
      .catch((err) => {
        console.error("加载资源列表失败:", err);
        if (!ignore) setAllResources([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // 资源模式：直接使用propSelectedResource
  useEffect(() => {
    if (isResourceMode && propSelectedResource) {
      setSelectedResource(propSelectedResource);
      setContextResources([propSelectedResource]);
      setSessionAnchorResourceId(propSelectedResource.resource_id);
    }
  }, [isResourceMode, propSelectedResource]);

  // 任务模式：加载任务的关联资源
  useEffect(() => {
    if (!selectedTask) {
      if (!isResourceMode) {
        setContextResources([]);
        setSelectedResource(null);
        setSessionAnchorResourceId(null);
      }
      return;
    }

    let ignore = false;

    const loadResources = async () => {
      setLoadingResources(true);
      try {
        const data = await fetchTaskResources(selectedTask.task_id);
        if (!ignore) {
          setContextResources(data.resources);
          if (
            selectedResource &&
            !data.resources.find((r) => r.resource_id === selectedResource.resource_id)
          ) {
            setSelectedResource(null);
          }
        }
      } catch (err) {
        console.error("加载关联资源失败:", err);
        if (!ignore) {
          setContextResources([]);
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
  }, [selectedTask, isResourceMode]);

  // 统一加载资源内容到编辑器
  useEffect(() => {
    const resourceToLoad = currentResource;

    if (resourceToLoad) {
      setEditorContent(resourceToLoad.content || "");
      setIsModified(false);
      setEditedDisplayName(resourceToLoad.display_name || "");
      setIsEditingName(false);

      if (resourceToLoad.file_type === "text") {
        setViewMode('text');
      } else {
        setViewMode('file');
      }
    } else {
      setEditorContent("");
      setIsModified(false);
      setEditedDisplayName("");
      setIsEditingName(false);
      setViewMode('file');
    }
  }, [currentResource]);

  const handleResourceClick = useCallback((resource: Resource) => {
    setSelectedResource(resource);
  }, []);

  const handleAddToContext = useCallback((resource: Resource) => {
    setContextResources((prev) => {
      if (prev.some((item) => item.resource_id === resource.resource_id)) {
        return prev;
      }
      return [...prev, resource];
    });
  }, []);

  const handleEditorChange = useCallback((content: string) => {
    setEditorContent(content);
    setIsModified(true);
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  // 保存资源内容和显示名称
  const handleSave = useCallback(async () => {
    const resourceToSave = currentResource;
    if (!resourceToSave || isSaving) return;

    const hasContentChange = isModified;
    const hasNameChange = editedDisplayName !== (resourceToSave.display_name || "");

    if (!hasContentChange && !hasNameChange) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (hasContentChange) {
        await updateResourceContent(resourceToSave.resource_id, editorContent);
      }
      if (hasNameChange) {
        await updateResourceDisplayName(resourceToSave.resource_id, editedDisplayName);
      }

      setIsModified(false);
      setIsEditingName(false);
      setSaveSuccess(true);

      if (hasNameChange) {
        const updatedResource = { ...resourceToSave, display_name: editedDisplayName };
        setSelectedResource(updatedResource);
        setContextResources((prev) =>
          prev.map((resource) =>
            resource.resource_id === updatedResource.resource_id ? updatedResource : resource
          )
        );
        setAllResources((prev) =>
          prev.map((resource) =>
            resource.resource_id === updatedResource.resource_id ? updatedResource : resource
          )
        );
      }

      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      console.error("保存失败:", err);
      setSaveError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [currentResource, isModified, isSaving, editorContent, editedDisplayName]);

  const handleRemoveFromContext = useCallback((resourceId: number) => {
    setContextResources((prev) => {
      const next = prev.filter((resource) => resource.resource_id !== resourceId);
      if (selectedResource?.resource_id === resourceId) {
        setSelectedResource(next[0] ?? null);
      }
      return next;
    });
  }, [selectedResource]);

  // Handle left panel resize
  const handleLeftMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingLeft(true);
    setTempLeftWidth(leftPanelWidth);
  };

  // Handle right panel resize
  const handleRightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRight(true);
    setTempRightWidth(rightPanelWidth);
  };

  // Handle resize drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const workspaceContainer = document.querySelector('main.flex-1');
        if (workspaceContainer) {
          const containerRect = workspaceContainer.getBoundingClientRect();
          const newWidth = e.clientX - containerRect.left;
          if (newWidth >= LEFT_MIN && newWidth <= LEFT_MAX) {
            setTempLeftWidth(newWidth);
          }
        }
      }
      if (isResizingRight) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= RIGHT_MIN && newWidth <= RIGHT_MAX) {
          setTempRightWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      if (tempLeftWidth !== null) {
        setLeftPanelWidth(tempLeftWidth);
        localStorage.setItem("neuralvault_workspace_left_width", tempLeftWidth.toString());
      }
      if (tempRightWidth !== null) {
        setRightPanelWidth(tempRightWidth);
        localStorage.setItem("neuralvault_workspace_right_width", tempRightWidth.toString());
      }
      setIsResizingLeft(false);
      setIsResizingRight(false);
      setTempLeftWidth(null);
      setTempRightWidth(null);
    };

    if (isResizingLeft || isResizingRight) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingLeft, isResizingRight, tempLeftWidth, tempRightWidth]);

  // 监听 Ctrl+S / Command+S 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSave]);

  // Empty state: 既没有任务也没有资源
  if (!selectedTask && !propSelectedResource) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="text-6xl mb-6 text-muted-foreground">⬡</span>
        <h2 className="text-xl font-semibold mb-2">{t("workspace", "selectTaskPrompt")}</h2>
        <p className="text-muted-foreground mb-6">
          {t("workspace", "selectTaskDesc")}
        </p>
        <Button onClick={onBack}>{t("workspace", "backToDashboard")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← {t("workspace", "backToDashboard")}
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2 text-sm">
          {isResourceMode ? (
            <>
              <span className="text-muted-foreground">{t("workspace", "resourceBreadcrumb")}</span>
              <span className="text-muted-foreground">/</span>
              {currentResource ? (
                <span className="font-medium">
                  {resourceTypeIcons[currentResource.file_type]}{" "}
                  {currentResource.display_name || "未命名资源"}
                </span>
              ) : (
                <span className="font-medium text-muted-foreground">未选择资源</span>
              )}
            </>
          ) : (
            <>
              <span className="text-muted-foreground">{t("dashboard", "tasks")}</span>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">{selectedTask!.title || t("common", "untitled")}</span>
              {currentResource && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">
                    {resourceTypeIcons[currentResource.file_type]}{" "}
                    {currentResource.display_name || "未命名文件"}
                  </span>
                </>
              )}
            </>
          )}
        </div>
        {isModified && (
          <Badge variant="secondary" className="ml-auto">
            ● 未保存
          </Badge>
        )}
        {isSaving && (
          <Badge variant="outline" className="ml-auto">
            保存中...
          </Badge>
        )}
        {saveSuccess && (
          <Badge variant="default" className="ml-auto bg-green-600">
            ✓ 已保存
          </Badge>
        )}
        {saveError && (
          <Badge variant="destructive" className="ml-auto">
            ✗ {saveError}
          </Badge>
        )}
      </header>

      {/* Three-column Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Context Panel */}
        <ContextPanel
          isResourceMode={isResourceMode}
          selectedTask={selectedTask}
          currentResource={currentResource}
          contextResources={contextResources}
          availableResources={availableContextResources}
          loadingResources={loadingResources}
          editorContent={editorContent}
          viewMode={viewMode}
          width={leftPanelWidth}
          tempWidth={tempLeftWidth}
          isResizing={isResizingLeft}
          onMouseDown={handleLeftMouseDown}
          onResourceClick={handleResourceClick}
          onAddToContext={handleAddToContext}
          onRemoveFromContext={handleRemoveFromContext}
        />

        {/* Center: Editor Area */}
        <EditorPanel
          currentResource={currentResource}
          editorContent={editorContent}
          viewMode={viewMode}
          isEditingName={isEditingName}
          editedDisplayName={editedDisplayName}
          isModified={isModified}
          isSaving={isSaving}
          assetsPath={assetsPath}
          onEditorChange={handleEditorChange}
          onSave={handleSave}
          onViewModeChange={setViewMode}
          onEditingNameChange={setIsEditingName}
          onDisplayNameChange={setEditedDisplayName}
        />

        {/* Right: Chat Panel */}
        <ChatPanel
          width={rightPanelWidth}
          tempWidth={tempRightWidth}
          isResizing={isResizingRight}
          onMouseDown={handleRightMouseDown}
          onNavigateToSettings={onNavigateToSettings}
          taskId={!isResourceMode ? selectedTask?.task_id : undefined}
          resourceId={isResourceMode ? (sessionAnchorResourceId ?? currentResource?.resource_id) : undefined}
          contextResourceIds={contextResourceIds}
        />
      </div>
    </div>
  );
}
