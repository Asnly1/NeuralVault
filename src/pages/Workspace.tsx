import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Task, Resource, priorityConfig, resourceTypeIcons } from "../types";
import { fetchTaskResources, getAssetsPath } from "../api";
import { TiptapEditor } from "../components";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { convertFileSrc } from "@tauri-apps/api/core";

// 懒加载 PDF 组件，避免启动时加载
const PDFViewer = lazy(() =>
  import("../components/PDFViewer").then((module) => ({
    default: module.PDFViewer,
  }))
);

interface WorkspacePageProps {
  selectedTask: Task | null;
  onBack: () => void;
}

export function WorkspacePage({ selectedTask, onBack }: WorkspacePageProps) {
  const [chatInput, setChatInput] = useState("");
  const [linkedResources, setLinkedResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );
  const [editorContent, setEditorContent] = useState("");
  const [isModified, setIsModified] = useState(false);
  const [assetsPath, setAssetsPath] = useState<string>("");

  // Load assets path on mount
  useEffect(() => {
    getAssetsPath().then(setAssetsPath).catch(console.error);
  }, []);

  // Load task resources
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
    } else {
      setEditorContent("");
      setIsModified(false);
    }
  }, [selectedResource]);

  const handleResourceClick = useCallback((resource: Resource) => {
    setSelectedResource(resource);
  }, []);

  const handleEditorChange = useCallback((content: string) => {
    setEditorContent(content);
    setIsModified(true);
  }, []);

  const isEditable = (resource: Resource | null): boolean => {
    if (!resource) return false;
    return resource.file_type === "text";
  };

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

  // Empty state
  if (!selectedTask) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="text-6xl mb-6 text-muted-foreground">⬡</span>
        <h2 className="text-xl font-semibold mb-2">选择一个任务开始工作</h2>
        <p className="text-muted-foreground mb-6">
          从看板页面点击任务卡片进入工作台
        </p>
        <Button onClick={onBack}>返回看板</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 返回看板
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">任务</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{selectedTask.title || "未命名"}</span>
          {selectedResource && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">
                {resourceTypeIcons[selectedResource.file_type]}{" "}
                {selectedResource.display_name || "未命名文件"}
              </span>
            </>
          )}
        </div>
        {isModified && (
          <Badge variant="secondary" className="ml-auto">
            ● 未保存
          </Badge>
        )}
      </header>

      {/* Three-column Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Context Panel */}
        <aside className="w-64 border-r flex flex-col shrink-0">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Task Details */}
              <div>
                <h3 className="text-sm font-semibold mb-3">任务详情</h3>
                <Card>
                  <CardContent className="p-3 space-y-3">
                    <h4 className="font-medium">
                      {selectedTask.title || "未命名任务"}
                    </h4>
                    {selectedTask.description && (
                      <p className="text-sm text-muted-foreground">
                        {selectedTask.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{selectedTask.status}</Badge>
                      <Badge
                        style={{
                          backgroundColor: `${
                            priorityConfig[selectedTask.priority].color
                          }20`,
                          color: priorityConfig[selectedTask.priority].color,
                        }}
                      >
                        {priorityConfig[selectedTask.priority].label}
                      </Badge>
                    </div>
                    {selectedTask.due_date && (
                      <p className="text-xs text-muted-foreground">
                        截止:{" "}
                        {selectedTask.due_date.toLocaleDateString("zh-CN")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Linked Resources */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">关联资源</h3>
                  {linkedResources.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {linkedResources.length}
                    </Badge>
                  )}
                </div>
                {loadingResources ? (
                  <p className="text-sm text-muted-foreground">加载中...</p>
                ) : linkedResources.length > 0 ? (
                  <div className="space-y-1">
                    {linkedResources.map((resource) => (
                      <button
                        key={resource.resource_id}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors",
                          selectedResource?.resource_id === resource.resource_id
                            ? "bg-secondary"
                            : "hover:bg-muted"
                        )}
                        onClick={() => handleResourceClick(resource)}
                      >
                        <span>{resourceTypeIcons[resource.file_type]}</span>
                        <span className="truncate flex-1">
                          {resource.display_name || "未命名文件"}
                        </span>
                        {isEditable(resource) && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            可编辑
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无关联资源</p>
                )}
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Center: Editor Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Editor Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
            <span className="text-sm font-medium">
              {selectedResource
                ? `${resourceTypeIcons[selectedResource.file_type]} ${
                    selectedResource.display_name || "未命名"
                  }`
                : "工作区"}
            </span>
            {selectedResource && selectedResource.file_type === "text" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!isModified}
              >
                💾
              </Button>
            )}
          </div>
          {/* Editor Content */}
          <div className="flex-1 p-4 overflow-auto">{renderEditorArea()}</div>
        </main>

        {/* Right: Chat Panel */}
        <aside className="w-72 border-l flex flex-col shrink-0">
          <div className="px-4 py-3 border-b shrink-0">
            <h3 className="font-semibold">AI 助手</h3>
            <p className="text-xs text-muted-foreground">当前任务上下文</p>
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
                placeholder="输入消息... 使用 @ 引用文件"
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
