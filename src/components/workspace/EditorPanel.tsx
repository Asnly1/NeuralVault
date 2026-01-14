import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { NodeRecord, resourceSubtypeIcons } from "@/types";
import { TiptapEditor } from "@/components";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useLanguage } from "@/contexts/LanguageContext";

// 懒加载 PDF 组件
const PDFViewer = lazy(() =>
  import("../PDFViewer").then((module) => ({
    default: module.PDFViewer,
  }))
);

interface EditorPanelProps {
  currentResource: NodeRecord | null;
  isTopicMode?: boolean;
  selectedTopic?: NodeRecord | null;
  editorContent: string;
  viewMode: 'file' | 'text';
  isEditingName: boolean;
  editedDisplayName: string;
  isModified: boolean;
  isSaving: boolean;
  assetsPath: string;
  onEditorChange: (content: string) => void;
  onSave: () => void;
  onViewModeChange: (mode: 'file' | 'text') => void;
  onEditingNameChange: (editing: boolean) => void;
  onDisplayNameChange: (name: string) => void;
}

export function EditorPanel({
  currentResource,
  isTopicMode = false,
  selectedTopic,
  editorContent,
  viewMode,
  isEditingName,
  editedDisplayName,
  isModified,
  isSaving,
  assetsPath,
  onEditorChange,
  onSave,
  onViewModeChange,
  onEditingNameChange,
  onDisplayNameChange,
}: EditorPanelProps) {
  // 判断是否是文件类型资源（可以切换查看模式）
  const isFileResource = currentResource && currentResource.resource_subtype !== 'text' && currentResource.file_path;
  const { t } = useLanguage();

  const renderEditorArea = () => {
    // Topic 模式：显示主题摘要（当没有选中资源时）
    if (isTopicMode && !currentResource && selectedTopic) {
      return (
        <div className="flex flex-col h-full">
          <div className="flex-1 p-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t("workspace", "topicSummary")}
              </h3>
              {selectedTopic.summary ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-foreground whitespace-pre-wrap">{selectedTopic.summary}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {t("workspace", "noSummary")}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (!currentResource) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <span className="text-4xl mb-4">✎</span>
          <p className="text-lg font-medium">{t("workspace", "editorPlaceholder")}</p>
          <p className="text-sm">{t("workspace", "editorPlaceholderDesc")}</p>
        </div>
      );
    }

    // 如果是"编辑文本"模式，显示 TiptapEditor（用于非 text 类型资源的文本编辑，即使内容为空也可以添加）
    if (viewMode === 'text' && currentResource.resource_subtype !== 'text') {
      return (
        <TiptapEditor
          content={editorContent}
          onChange={onEditorChange}
          editable={true}
          placeholder="添加笔记或备注..."
        />
      );
    }

    if (currentResource.resource_subtype === "text") {
      return (
        <TiptapEditor
          content={editorContent}
          onChange={onEditorChange}
          editable={true}
          placeholder="开始输入内容..."
        />
      );
    }

    if (currentResource.resource_subtype === "pdf") {
      const pdfPath = currentResource.file_path;
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

      const fileName = pdfPath.replace("assets/", "");
      const fullPath = `${assetsPath}/${fileName}`;
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
            displayName={currentResource.title || "PDF 文档"}
          />
        </Suspense>
      );
    }

    if (currentResource.resource_subtype === "image") {
      const imagePath = currentResource.file_path;
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

      const fileName = imagePath.replace("assets/", "");
      const fullPath = `${assetsPath}/${fileName}`;
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
                    alt={currentResource.title || "图片预览"}
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

    if (currentResource.resource_subtype === "url") {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <span className="text-4xl mb-4">🔗</span>
          <p className="text-lg font-medium">链接资源</p>
          <p className="text-sm">{currentResource.file_content || "无内容"}</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <span className="text-4xl mb-4">📎</span>
        <p className="text-lg font-medium">
          {currentResource.resource_subtype ? resourceSubtypeIcons[currentResource.resource_subtype] : "📎"}{" "}
          {currentResource.title}
        </p>
        <p className="text-sm">此类型文件暂不支持预览</p>
      </div>
    );
  };

  return (
    <main className="flex-1 flex flex-col min-w-0">
      {/* Editor Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        {currentResource ? (
          isEditingName ? (
            // 编辑模式：显示输入框
            <>
              <span className="text-sm">
                {currentResource.resource_subtype ? resourceSubtypeIcons[currentResource.resource_subtype] : "📎"}
              </span>
              <Input
                value={editedDisplayName}
                onChange={(e) => onDisplayNameChange(e.target.value)}
                onBlur={() => {
                  if (editedDisplayName !== (currentResource.title || "")) {
                    onSave();
                  } else {
                    onEditingNameChange(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    onDisplayNameChange(currentResource.title || "");
                    onEditingNameChange(false);
                  }
                }}
                className="h-7 text-sm flex-1"
                autoFocus
              />
            </>
          ) : (
            // 查看模式：显示名称，点击编辑
            <>
              <span
                className="text-sm font-medium cursor-pointer hover:text-primary"
                onClick={() => onEditingNameChange(true)}
                title="点击编辑名称"
              >
                {currentResource.resource_subtype ? resourceSubtypeIcons[currentResource.resource_subtype] : "📎"}{" "}
                {currentResource.title || "未命名"}
              </span>
              {/* 文本/文件切换按钮 - 对所有文件类型资源都显示 */}
              {isFileResource && (
                <div className="flex gap-1 ml-2 bg-muted rounded-md p-0.5">
                  <Button
                    variant={viewMode === 'text' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => onViewModeChange('text')}
                  >
                    {t("workspace", "editText")}
                  </Button>
                  <Button
                    variant={viewMode === 'file' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => onViewModeChange('file')}
                  >
                    {t("workspace", "viewFile")}
                  </Button>
                </div>
              )}
            </>
          )
        ) : isTopicMode && selectedTopic ? (
          // Topic 模式：显示主题标题
          <span className="text-sm font-medium">
            {selectedTopic.title || "未命名主题"}
          </span>
        ) : (
          <span className="text-sm font-medium">{t("workspace", "workspaceArea")}</span>
        )}
        {currentResource && (currentResource.resource_subtype === "text" || viewMode === 'text') && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-auto"
            disabled={(!isModified && editedDisplayName === (currentResource.title || "")) || isSaving}
            onClick={onSave}
            title={isSaving ? "保存中..." : "保存 (Ctrl+S)"}
          >
            {isSaving ? "⏳" : "💾"}
          </Button>
        )}
      </div>
      {/* Editor Content */}
      <div className={cn(
        "flex-1 overflow-auto",
        (viewMode === 'text' || (currentResource?.resource_subtype !== "pdf" && currentResource?.resource_subtype !== "image")) && "p-4"
      )}>
        {renderEditorArea()}
      </div>
    </main>
  );
}
