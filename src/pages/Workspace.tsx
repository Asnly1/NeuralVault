import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Task, Resource, priorityConfig, resourceTypeIcons } from "../types";
import { Trash2 } from "lucide-react";
import { fetchTaskResources, getAssetsPath, unlinkResource, updateResourceContent, updateResourceDisplayName } from "../api";
import { TiptapEditor } from "../components";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useLanguage } from "@/contexts/LanguageContext";

// 懒加载 PDF 组件，避免启动时加载
const PDFViewer = lazy(() =>
  import("../components/PDFViewer").then((module) => ({
    default: module.PDFViewer,
  }))
);

interface WorkspacePageProps {
  selectedTask: Task | null;
  selectedResource: Resource | null;
  onBack: () => void;
}

const LEFT_MIN = 150;
const LEFT_MAX = 400;
const RIGHT_MIN = 200;
const RIGHT_MAX = 500;

export function WorkspacePage({ selectedTask, selectedResource: propSelectedResource, onBack }: WorkspacePageProps) {
  const [chatInput, setChatInput] = useState("");
  const [linkedResources, setLinkedResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );
  const [editorContent, setEditorContent] = useState("");
  const [isModified, setIsModified] = useState(false);
  const [assetsPath, setAssetsPath] = useState<string>("");
  const [hoveredResourceId, setHoveredResourceId] = useState<number | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState("");

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

  // 检测模式：资源模式（直接从资源进入）或任务模式（从任务进入）
  const isResourceMode = !selectedTask && propSelectedResource;

  // Load assets path on mount
  useEffect(() => {
    getAssetsPath().then(setAssetsPath).catch(console.error);
  }, []);

  // 资源模式：直接使用propSelectedResource
  useEffect(() => {
    if (isResourceMode && propSelectedResource) {
      setSelectedResource(propSelectedResource);
      setLinkedResources([]); // 资源模式不显示关联资源列表
    }
  }, [isResourceMode, propSelectedResource]);

  // 任务模式：加载任务的关联资源
  useEffect(() => {
    if (!selectedTask) {
      if (!isResourceMode) {
        setLinkedResources([]);
        setSelectedResource(null);
      }
      return;
    }

    let ignore = false;

    const loadResources = async () => {
      setLoadingResources(true);
      try {
        const data = await fetchTaskResources(selectedTask.task_id);
        if (!ignore) {
          setLinkedResources(data.resources);
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
  }, [selectedTask, isResourceMode]);

  // Load resource content to editor
  useEffect(() => {
    if (selectedResource) {
      if (selectedResource.file_type === "text") {
        setEditorContent(selectedResource.content || "");
        setIsModified(false);
      } else {
        setEditorContent("");
        setIsModified(false);
      }
      // 初始化编辑的显示名称
      setEditedDisplayName(selectedResource.display_name || "");
      setIsEditingName(false);
    } else {
      setEditorContent("");
      setIsModified(false);
      setEditedDisplayName("");
      setIsEditingName(false);
    }
  }, [selectedResource]);

  const handleResourceClick = useCallback((resource: Resource) => {
    setSelectedResource(resource);
  }, []);

  const handleEditorChange = useCallback((content: string) => {
    setEditorContent(content);
    setIsModified(true);
    setSaveSuccess(false); // 清除保存成功提示
    setSaveError(null); // 清除错误提示
  }, []);

  // 保存资源内容和显示名称
  const handleSave = useCallback(async () => {
    if (!selectedResource || isSaving) return;
    
    // 检查是否有任何修改
    const hasContentChange = isModified;
    const hasNameChange = editedDisplayName !== (selectedResource.display_name || "");
    
    if (!hasContentChange && !hasNameChange) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // 分别调用两个独立的 API 函数
      if (hasContentChange) {
        await updateResourceContent(selectedResource.resource_id, editorContent);
      }
      if (hasNameChange) {
        await updateResourceDisplayName(selectedResource.resource_id, editedDisplayName);
      }
      
      setIsModified(false);
      setIsEditingName(false);
      setSaveSuccess(true);

      // 更新本地资源对象的 display_name
      if (hasNameChange) {
        selectedResource.display_name = editedDisplayName;
      }

      // 3秒后清除保存成功提示
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      console.error("保存失败:", err);
      setSaveError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [selectedResource, isModified, isSaving, editorContent, editedDisplayName]);

  // 处理删除资源（取消关联）
  const handleDeleteResource = useCallback(
    async (resourceId: number, e: React.MouseEvent) => {
      e.stopPropagation(); // 阻止触发 resource 点击事件

      if (!selectedTask) return;
      if (!confirm("确定要从此任务中移除该资源吗？")) {
        return;
      }

      try {
        await unlinkResource(selectedTask.task_id, resourceId);

        // 如果删除的是当前选中的资源，清空选中状态
        if (selectedResource?.resource_id === resourceId) {
          setSelectedResource(null);
        }

        // 重新加载资源列表
        const data = await fetchTaskResources(selectedTask.task_id);
        setLinkedResources(data.resources);
      } catch (err) {
        console.error("删除资源失败:", err);
      }
    },
    [selectedTask, selectedResource]
  );

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
        // Get the left edge of the main content area (after sidebar)
        // We need to find the workspace container's left position
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
        localStorage.setItem(
          "neuralvault_workspace_left_width",
          tempLeftWidth.toString()
        );
      }
      if (tempRightWidth !== null) {
        setRightPanelWidth(tempRightWidth);
        localStorage.setItem(
          "neuralvault_workspace_right_width",
          tempRightWidth.toString()
        );
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
      // 检测 Ctrl+S (Windows/Linux) 或 Command+S (macOS)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault(); // 阻止浏览器默认保存行为
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSave]);



  const renderEditorArea = () => {
    if (!selectedResource) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <span className="text-4xl mb-4">✎</span>
          <p className="text-lg font-medium">文本编辑器 / PDF 阅读器</p>
          <p className="text-sm">从左侧选择一个资源开始查看或编辑</p>
        </div>
      );
    }

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

    if (selectedResource.file_type === "pdf") {
      // 获取 PDF 路径并转换为 Tauri 可访问的 URL
      const pdfPath = selectedResource.file_path;
      if (!pdfPath || !assetsPath) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <span className="text-4xl mb-4">⚠️</span>
            <p className="text-lg font-medium">
              {!pdfPath ? "PDF 路径缺失" : "正在加载..."}
            </p>
          </div>
        );
      }

      // 将相对路径转换为完整路径
      // pdfPath 格式: "assets/xxx.pdf"
      // assetsPath 格式: "/Users/.../assets"
      // 需要提取文件名并拼接完整路径
      const fileName = pdfPath.replace("assets/", "");
      const fullPath = `${assetsPath}/${fileName}`;

      // convertFileSrc 将本地文件路径转换为 Tauri asset 协议 URL
      const pdfUrl = convertFileSrc(fullPath);

      return (
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="animate-spin text-4xl mb-4">⟳</div>
              <p className="text-lg font-medium">正在加载 PDF 阅读器...</p>
            </div>
          }
        >
          <PDFViewer
            url={pdfUrl}
            displayName={selectedResource.display_name || "PDF 文档"}
          />
        </Suspense>
      );
    }

    if (selectedResource.file_type === "image") {
      // 获取图片路径并转换为 Tauri 可访问的 URL
      const imagePath = selectedResource.file_path;
      if (!imagePath || !assetsPath) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <span className="text-4xl mb-4">⚠️</span>
            <p className="text-lg font-medium">
              {!imagePath ? "图片路径缺失" : "正在加载..."}
            </p>
          </div>
        );
      }

      // 将相对路径转换为完整路径
      // imagePath 格式: "assets/xxx.png"
      // assetsPath 格式: "/Users/.../assets"
      // 需要提取文件名并拼接完整路径
      const fileName = imagePath.replace("assets/", "");
      const fullPath = `${assetsPath}/${fileName}`;

      // convertFileSrc 将本地文件路径转换为 Tauri asset 协议 URL
      const imageUrl = convertFileSrc(fullPath);

      return (
        <div className="relative w-full h-full bg-black/5">
          <TransformWrapper
            initialScale={1}
            minScale={0.1}
            maxScale={10}
            centerOnInit={true}
            wheel={{ step: 0.1 }}
            doubleClick={{ mode: "reset" }}
          >
            {({ zoomIn, zoomOut, resetTransform, centerView }) => (
              <>
                {/* 控制按钮工具栏 */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-background/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => zoomIn()}
                    title="放大 (滚轮向上)"
                  >
                    🔍+
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => zoomOut()}
                    title="缩小 (滚轮向下)"
                  >
                    🔍−
                  </Button>
                  <Separator orientation="vertical" className="h-8" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetTransform()}
                    title="重置 (双击图片)"
                  >
                    ⟲ 重置
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => centerView()}
                    title="居中"
                  >
                    ⊕ 居中
                  </Button>
                </div>

                {/* 图片容器 */}
                <TransformComponent
                  wrapperClass="!w-full !h-full"
                  contentClass="!w-full !h-full flex items-center justify-center"
                >
                  <img
                    src={imageUrl}
                    alt={selectedResource.display_name || "图片预览"}
                    className="max-w-full max-h-full object-contain"
                    style={{ userSelect: "none" }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.onerror = null;
                      target.style.display = "none";
                      console.error("图片加载失败:", imagePath);
                    }}
                  />
                </TransformComponent>

                {/* 使用提示 */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-background/80 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
                  滚轮缩放 · 拖拽平移 · 双击重置
                </div>
              </>
            )}
          </TransformWrapper>
        </div>
      );
    }

    if (selectedResource.file_type === "url") {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <span className="text-4xl mb-4">🔗</span>
          <p className="text-lg font-medium">链接资源</p>
          <p className="text-sm">{selectedResource.content || "无内容"}</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <span className="text-4xl mb-4">📎</span>
        <p className="text-lg font-medium">
          {resourceTypeIcons[selectedResource.file_type]}{" "}
          {selectedResource.display_name}
        </p>
        <p className="text-sm">此类型文件暂不支持预览</p>
      </div>
    );
  };

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
              <span className="text-muted-foreground">资源</span>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">
                {resourceTypeIcons[propSelectedResource!.file_type]}{" "}
                {propSelectedResource!.display_name || "未命名资源"}
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">{t("dashboard", "tasks")}</span>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">{selectedTask!.title || t("common", "untitled")}</span>
              {selectedResource && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">
                    {resourceTypeIcons[selectedResource.file_type]}{" "}
                    {selectedResource.display_name || "未命名文件"}
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
        <aside
          style={{ width: `${tempLeftWidth !== null ? tempLeftWidth : leftPanelWidth}px` }}
          className={cn(
            "border-r flex flex-col shrink-0 relative",
            !isResizingLeft && "transition-all duration-300"
          )}
        >
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {isResourceMode ? (
                /* 资源模式：显示资源详情 */
                <div>
                  <h3 className="text-sm font-semibold mb-3">资源详情</h3>
                  <Card>
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{resourceTypeIcons[propSelectedResource!.file_type]}</span>
                        <h4 className="font-medium">
                          {propSelectedResource!.display_name || "未命名资源"}
                        </h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{propSelectedResource!.file_type}</Badge>
                        {propSelectedResource!.classification_status && (
                          <Badge variant="secondary">
                            {propSelectedResource!.classification_status}
                          </Badge>
                        )}
                      </div>
                      {propSelectedResource!.created_at && (
                        <p className="text-xs text-muted-foreground">
                          创建时间:{" "}
                          {propSelectedResource!.created_at.toLocaleDateString("zh-CN")}
                        </p>
                      )}
                      {propSelectedResource!.file_path && (
                        <p className="text-xs text-muted-foreground truncate" title={propSelectedResource!.file_path}>
                          路径: {propSelectedResource!.file_path}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                /* 任务模式：显示任务详情+关联资源 */
                <>
                  {/* Task Details */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">{t("workspace", "taskDetails")}</h3>
                    <Card>
                      <CardContent className="p-3 space-y-3">
                        <h4 className="font-medium">
                          {selectedTask!.title || "未命名任务"}
                        </h4>
                        {selectedTask!.description && (
                          <p className="text-sm text-muted-foreground">
                            {selectedTask!.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{selectedTask!.status}</Badge>
                          <Badge
                            style={{
                              backgroundColor: `${
                                priorityConfig[selectedTask!.priority].color
                              }20`,
                              color: priorityConfig[selectedTask!.priority].color,
                            }}
                          >
                            {priorityConfig[selectedTask!.priority].label}
                          </Badge>
                        </div>
                        {selectedTask!.due_date && (
                          <p className="text-xs text-muted-foreground">
                            截止:{" "}
                            {selectedTask!.due_date.toLocaleDateString("zh-CN")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Linked Resources */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">{t("workspace", "linkedResources")}</h3>
                      {linkedResources.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {linkedResources.length}
                        </Badge>
                      )}
                    </div>
                    {loadingResources ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : linkedResources.length > 0 ? (
                      <div className="space-y-1">
                        {linkedResources.map((resource) => (
                          <div
                            key={resource.resource_id}
                            className="relative group"
                            onMouseEnter={() =>
                              setHoveredResourceId(resource.resource_id)
                            }
                            onMouseLeave={() => setHoveredResourceId(null)}
                          >
                            <button
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors",
                                selectedResource?.resource_id ===
                                  resource.resource_id
                                  ? "bg-secondary"
                                  : "hover:bg-muted"
                              )}
                              onClick={() => handleResourceClick(resource)}
                            >
                              <span>{resourceTypeIcons[resource.file_type]}</span>
                              <span className="truncate flex-1">
                                {resource.display_name || "未命名文件"}
                              </span>
                            </button>
                            {/* 删除按钮 */}
                            {hoveredResourceId === resource.resource_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-0.5 right-0.5 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive z-10"
                                onClick={(e) =>
                                  handleDeleteResource(resource.resource_id, e)
                                }
                                title="从任务中移除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无关联资源</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
          
          {/* Resize Handle */}
          <div
            className={cn(
              "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent transition-colors",
              isResizingLeft && "bg-accent"
            )}
            onMouseDown={handleLeftMouseDown}
          >
            <div className="absolute top-0 right-0 w-4 h-full -mr-1.5" />
          </div>
        </aside>

        {/* Center: Editor Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Editor Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
            {selectedResource ? (
              isEditingName ? (
                // 编辑模式：显示输入框
                <>
                  <span className="text-sm">
                    {resourceTypeIcons[selectedResource.file_type]}
                  </span>
                  <Input
                    value={editedDisplayName}
                    onChange={(e) => setEditedDisplayName(e.target.value)}
                    onBlur={() => {
                      // 失焦时如果有修改则保存
                      if (editedDisplayName !== (selectedResource.display_name || "")) {
                        handleSave();
                      } else {
                        setIsEditingName(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur(); // 触发保存
                      } else if (e.key === "Escape") {
                        setEditedDisplayName(selectedResource.display_name || "");
                        setIsEditingName(false);
                      }
                    }}
                    className="h-7 text-sm flex-1"
                    autoFocus
                  />
                </>
              ) : (
                // 查看模式：显示名称，点击编辑
                <>
                  <span className="text-sm font-medium cursor-pointer hover:text-primary" onClick={() => setIsEditingName(true)} title="点击编辑名称">
                    {resourceTypeIcons[selectedResource.file_type]}{" "}
                    {selectedResource.display_name || "未命名"}
                  </span>
                </>
              )
            ) : (
              <span className="text-sm font-medium">工作区</span>
            )}
            {selectedResource && selectedResource.file_type === "text" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 ml-auto"
                disabled={(!isModified && editedDisplayName === (selectedResource.display_name || "")) || isSaving}
                onClick={handleSave}
                title={isSaving ? "保存中..." : "保存 (Ctrl+S)"}
              >
                {isSaving ? "⏳" : "💾"}
              </Button>
            )}
          </div>
          {/* Editor Content */}
          <div className="flex-1 p-4 overflow-auto">{renderEditorArea()}</div>
        </main>

        {/* Right: Chat Panel */}
        <aside
          style={{ width: `${tempRightWidth !== null ? tempRightWidth : rightPanelWidth}px` }}
          className={cn(
            "border-l flex flex-col shrink-0 relative",
            !isResizingRight && "transition-all duration-300"
          )}
        >
          {/* Resize Handle */}
          <div
            className={cn(
              "absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-accent transition-colors",
              isResizingRight && "bg-accent"
            )}
            onMouseDown={handleRightMouseDown}
          >
            <div className="absolute top-0 left-0 w-4 h-full -ml-1.5" />
          </div>
          
          <div className="px-4 py-3 border-b shrink-0">
            <h3 className="font-semibold">{t("workspace", "aiAssistant")}</h3>
            <p className="text-xs text-muted-foreground">{t("workspace", "context")}</p>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4">
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                  ◆
                </div>
                <div className="bg-muted rounded-lg p-3 text-sm">
                  你好！我可以帮你分析和处理这个任务相关的内容。
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="p-4 border-t shrink-0">
            <div className="flex gap-2">
              <Input
                placeholder={t("workspace", "inputPlaceholder")}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1"
              />
              <Button size="icon" disabled={!chatInput.trim()}>
                ↑
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
