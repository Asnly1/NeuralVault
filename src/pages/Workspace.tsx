import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { NodeRecord, resourceSubtypeIcons } from "../types";
import { getAssetsPath } from "../api";
import { useLanguage } from "@/contexts/LanguageContext";
import { ContextPanel, EditorPanel, ChatPanel } from "../components/workspace";
import { usePanelResize, useResourceEditor, useContextResources, useSaveShortcut } from "@/hooks";

interface WorkspacePageProps {
  selectedTask: NodeRecord | null;
  selectedResource: NodeRecord | null;
  onBack: () => void;
  onNavigateToSettings?: () => void;
}

const LEFT_PANEL = { min: 150, max: 400, initial: 256 };
const RIGHT_PANEL = { min: 200, max: 500, initial: 288 };
const MAX_TITLE_LENGTH = 15;

// 截断过长的标题
const truncateTitle = (title: string | undefined | null, maxLength = MAX_TITLE_LENGTH): string => {
  if (!title) return "";
  return title.length > maxLength ? title.slice(0, maxLength) + "..." : title;
};

export function WorkspacePage({
  selectedTask,
  selectedResource: propSelectedResource,
  onBack,
  onNavigateToSettings,
}: WorkspacePageProps) {
  const { t } = useLanguage();
  const [assetsPath, setAssetsPath] = useState("");
  const [sessionAnchorResourceId, setSessionAnchorResourceId] = useState<number | null>(
    () => propSelectedResource?.node_id ?? null
  );

  // 检测模式
  const isResourceMode = !selectedTask && propSelectedResource?.node_type === "resource";
  const isTopicMode = propSelectedResource?.node_type === "topic";
  const containerNodeId = selectedTask?.node_id ?? (isTopicMode ? propSelectedResource?.node_id : undefined);

  // 面板拖拽
  const leftPanel = usePanelResize({
    min: LEFT_PANEL.min,
    max: LEFT_PANEL.max,
    storageKey: "neuralvault_workspace_left_width",
    initialWidth: LEFT_PANEL.initial,
    direction: "right",
  });

  const rightPanel = usePanelResize({
    min: RIGHT_PANEL.min,
    max: RIGHT_PANEL.max,
    storageKey: "neuralvault_workspace_right_width",
    initialWidth: RIGHT_PANEL.initial,
    direction: "left",
  });

  // 上下文资源管理
  const context = useContextResources({
    selectedTask,
    propSelectedResource,
  });

  // 编辑器状态
  const editor = useResourceEditor(context.selectedResource, context.updateResource);

  // 资源模式时更新 session anchor
  useEffect(() => {
    if (isResourceMode && propSelectedResource) {
      setSessionAnchorResourceId(propSelectedResource.node_id);
    }
  }, [isResourceMode, propSelectedResource]);

  // 加载 assets 路径
  useEffect(() => {
    getAssetsPath().then(setAssetsPath).catch(console.error);
  }, []);

  // 保存快捷键 Ctrl+S / Cmd+S
  useSaveShortcut(editor.save, { enabled: editor.isModified || editor.isEditingName });

  // 空状态
  if (!selectedTask && !propSelectedResource) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="text-6xl mb-6 text-muted-foreground">⬡</span>
        <h2 className="text-xl font-semibold mb-2">{t("workspace", "selectTaskPrompt")}</h2>
        <p className="text-muted-foreground mb-6">{t("workspace", "selectTaskDesc")}</p>
        <Button onClick={onBack}>{t("workspace", "backToDashboard")}</Button>
      </div>
    );
  }

  const currentResource = context.selectedResource;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← {t("workspace", "backToDashboard")}
        </Button>
        <Separator orientation="vertical" className="h-5" />

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          {isTopicMode ? (
            // Topic 模式
            <span className="font-medium" title={propSelectedResource?.title}>
              {truncateTitle(propSelectedResource?.title) || t("common", "untitled")}
            </span>
          ) : isResourceMode ? (
            // Resource 模式
            currentResource ? (
              <span className="font-medium" title={currentResource.title}>
                {truncateTitle(currentResource.title) || "未命名资源"}
              </span>
            ) : (
              <span className="font-medium text-muted-foreground">未选择资源</span>
            )
          ) : (
            // Task 模式
            <>
              <span className="font-medium" title={selectedTask!.title}>
                {truncateTitle(selectedTask!.title) || t("common", "untitled")}
              </span>
              {currentResource && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground" title={currentResource.title}>
                    {truncateTitle(currentResource.title) || "未命名文件"}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* 保存状态 Badge */}
        {editor.isSaving && (
          <Badge variant="outline" className="ml-auto">保存中...</Badge>
        )}
        {!editor.isSaving && editor.saveError && (
          <Badge variant="destructive" className="ml-auto">✗ {editor.saveError}</Badge>
        )}
        {!editor.isSaving && !editor.saveError && editor.saveSuccess && (
          <Badge variant="default" className="ml-auto bg-green-600">✓ 已保存</Badge>
        )}
        {!editor.isSaving && !editor.saveError && !editor.saveSuccess && editor.isModified && (
          <Badge variant="secondary" className="ml-auto">● 未保存</Badge>
        )}
      </header>

      {/* Three-column Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Context Panel */}
        <ContextPanel
          isResourceMode={isResourceMode}
          isTopicMode={isTopicMode}
          selectedTask={selectedTask}
          selectedTopic={isTopicMode ? propSelectedResource : null}
          currentResource={currentResource}
          contextResources={context.contextResources}
          availableResources={context.availableResources}
          loadingResources={context.loadingResources}
          editorContent={editor.content}
          viewMode={editor.viewMode}
          width={leftPanel.width}
          tempWidth={leftPanel.tempWidth}
          isResizing={leftPanel.isResizing}
          onMouseDown={leftPanel.onMouseDown}
          onResourceClick={context.setSelectedResource}
          onAddToContext={context.addToContext}
          onRemoveFromContext={context.removeFromContext}
          onNodeClick={(node) => {
            // 点击关联节点时设置为当前资源
            if (node.node_type === "resource") {
              context.setSelectedResource(node);
            }
          }}
        />

        {/* Center: Editor Area */}
        <EditorPanel
          currentResource={currentResource}
          isTopicMode={isTopicMode}
          selectedTopic={isTopicMode ? propSelectedResource : null}
          editorContent={editor.content}
          viewMode={editor.viewMode}
          isEditingName={editor.isEditingName}
          editedDisplayName={editor.editedDisplayName}
          isModified={editor.isModified}
          isSaving={editor.isSaving}
          assetsPath={assetsPath}
          onEditorChange={editor.setContent}
          onSave={editor.save}
          onViewModeChange={editor.setViewMode}
          onEditingNameChange={(editing) =>
            editing ? editor.startEditingName() : editor.cancelEditingName()
          }
          onDisplayNameChange={editor.setEditedDisplayName}
        />

        {/* Right: Chat Panel */}
        <ChatPanel
          width={rightPanel.width}
          tempWidth={rightPanel.tempWidth}
          isResizing={rightPanel.isResizing}
          onMouseDown={rightPanel.onMouseDown}
          onNavigateToSettings={onNavigateToSettings}
          taskId={!isResourceMode ? containerNodeId : undefined}
          resourceId={
            isResourceMode
              ? sessionAnchorResourceId ?? currentResource?.node_id
              : undefined
          }
          contextResourceIds={context.contextResourceIds}
          onContextRefresh={context.refreshContext}
        />
      </div>
    </div>
  );
}
