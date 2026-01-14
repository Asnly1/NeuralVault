import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NodeRecord, priorityConfig, resourceSubtypeIcons } from "@/types";
import { Plus, Check, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ContextNodeTree } from "./ContextNodeTree";
import { updateTaskTitle, updateTaskSummary, updateTopicTitle, updateTopicSummary } from "@/api";

interface ContextPanelProps {
  isResourceMode: boolean;
  isTopicMode: boolean;
  selectedTask: NodeRecord | null;
  selectedTopic: NodeRecord | null;
  currentResource: NodeRecord | null;
  contextResources: NodeRecord[];
  availableResources: NodeRecord[];
  loadingResources: boolean;
  editorContent: string;
  viewMode: 'file' | 'text';
  width: number;
  tempWidth: number | null;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onResourceClick: (resource: NodeRecord) => void;
  onAddToContext: (resource: NodeRecord) => Promise<void>;
  onRemoveFromContext: (resourceId: number) => Promise<void>;
  onNodeClick?: (node: NodeRecord) => void;
  onTaskUpdate?: (task: NodeRecord) => void;
  onTopicUpdate?: (topic: NodeRecord) => void;
}

export function ContextPanel({
  isResourceMode,
  isTopicMode,
  selectedTask,
  selectedTopic,
  currentResource,
  contextResources,
  availableResources,
  loadingResources,
  editorContent,
  viewMode,
  width,
  tempWidth,
  isResizing,
  onMouseDown,
  onResourceClick,
  onAddToContext,
  onRemoveFromContext: _onRemoveFromContext,
  onNodeClick,
  onTaskUpdate,
  onTopicUpdate,
}: ContextPanelProps) {
  const { t } = useLanguage();
  const currentWidth = tempWidth !== null ? tempWidth : width;

  // Task 编辑状态
  const [isEditingTaskTitle, setIsEditingTaskTitle] = useState(false);
  const [isEditingTaskSummary, setIsEditingTaskSummary] = useState(false);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskSummary, setEditTaskSummary] = useState("");

  // Topic 编辑状态
  const [isEditingTopicTitle, setIsEditingTopicTitle] = useState(false);
  const [isEditingTopicSummary, setIsEditingTopicSummary] = useState(false);
  const [editTopicTitle, setEditTopicTitle] = useState("");
  const [editTopicSummary, setEditTopicSummary] = useState("");

  // Task 编辑处理
  const handleTaskTitleEdit = () => {
    setEditTaskTitle(selectedTask?.title || "");
    setIsEditingTaskTitle(true);
  };

  const handleTaskTitleSave = async () => {
    if (!selectedTask) return;
    try {
      await updateTaskTitle(selectedTask.node_id, editTaskTitle);
      onTaskUpdate?.({ ...selectedTask, title: editTaskTitle });
      setIsEditingTaskTitle(false);
    } catch (err) {
      console.error("Failed to update task title:", err);
    }
  };

  const handleTaskSummaryEdit = () => {
    setEditTaskSummary(selectedTask?.summary || "");
    setIsEditingTaskSummary(true);
  };

  const handleTaskSummarySave = async () => {
    if (!selectedTask) return;
    try {
      await updateTaskSummary(selectedTask.node_id, editTaskSummary || null);
      onTaskUpdate?.({ ...selectedTask, summary: editTaskSummary || null });
      setIsEditingTaskSummary(false);
    } catch (err) {
      console.error("Failed to update task summary:", err);
    }
  };

  // Topic 编辑处理
  const handleTopicTitleEdit = () => {
    setEditTopicTitle(selectedTopic?.title || "");
    setIsEditingTopicTitle(true);
  };

  const handleTopicTitleSave = async () => {
    if (!selectedTopic) return;
    try {
      await updateTopicTitle(selectedTopic.node_id, editTopicTitle);
      onTopicUpdate?.({ ...selectedTopic, title: editTopicTitle });
      setIsEditingTopicTitle(false);
    } catch (err) {
      console.error("Failed to update topic title:", err);
    }
  };

  const handleTopicSummaryEdit = () => {
    setEditTopicSummary(selectedTopic?.summary || "");
    setIsEditingTopicSummary(true);
  };

  const handleTopicSummarySave = async () => {
    if (!selectedTopic) return;
    try {
      await updateTopicSummary(selectedTopic.node_id, editTopicSummary || null);
      onTopicUpdate?.({ ...selectedTopic, summary: editTopicSummary || null });
      setIsEditingTopicSummary(false);
    } catch (err) {
      console.error("Failed to update topic summary:", err);
    }
  };

  return (
    <aside
      style={{ width: `${currentWidth}px` }}
      className={cn(
        "border-r flex flex-col shrink-0 relative overflow-hidden",
        !isResizing && "transition-all duration-300"
      )}
    >
      <ScrollArea className="flex-1">
        <div
          className="p-4 space-y-6"
          style={{ maxWidth: `${currentWidth}px`, boxSizing: 'border-box' }}
        >
          {/* Task 详情 */}
          {!isResourceMode && !isTopicMode && selectedTask && (
            <Card>
              <CardContent className="p-3 space-y-3">
                {/* Title - 双击编辑 */}
                {isEditingTaskTitle ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editTaskTitle}
                      onChange={(e) => setEditTaskTitle(e.target.value)}
                      className="h-8 text-sm font-medium"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleTaskTitleSave}>
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingTaskTitle(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <h4
                    className="font-medium cursor-pointer hover:text-primary transition-colors"
                    onDoubleClick={handleTaskTitleEdit}
                    title="双击编辑"
                  >
                    {selectedTask.title || "未命名任务"}
                  </h4>
                )}
                {/* Summary - 双击编辑 */}
                {isEditingTaskSummary ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editTaskSummary}
                      onChange={(e) => setEditTaskSummary(e.target.value)}
                      className="text-sm resize-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleTaskSummarySave}>保存</Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingTaskSummary(false)}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onDoubleClick={handleTaskSummaryEdit}
                    title="双击编辑"
                  >
                    {selectedTask.summary || <span className="italic">无摘要</span>}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedTask.task_status}</Badge>
                  {selectedTask.priority && (
                    <Badge
                      style={{
                        backgroundColor: `${priorityConfig[selectedTask.priority].color}20`,
                        color: priorityConfig[selectedTask.priority].color,
                      }}
                    >
                      {priorityConfig[selectedTask.priority].label}
                    </Badge>
                  )}
                </div>
                {selectedTask.due_date && (
                  <p className="text-xs text-muted-foreground">
                    截止: {selectedTask.due_date.toLocaleDateString("zh-CN")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Topic 详情 */}
          {isTopicMode && selectedTopic && (
            <Card>
              <CardContent className="p-3 space-y-3">
                {/* Title - 双击编辑 */}
                {isEditingTopicTitle ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editTopicTitle}
                      onChange={(e) => setEditTopicTitle(e.target.value)}
                      className="h-8 text-sm font-medium"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleTopicTitleSave}>
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingTopicTitle(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <h4
                    className="font-medium cursor-pointer hover:text-primary transition-colors"
                    onDoubleClick={handleTopicTitleEdit}
                    title="双击编辑"
                  >
                    {selectedTopic.title || "未命名主题"}
                  </h4>
                )}
                {/* Summary - 双击编辑 */}
                {isEditingTopicSummary ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editTopicSummary}
                      onChange={(e) => setEditTopicSummary(e.target.value)}
                      className="text-sm resize-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleTopicSummarySave}>保存</Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingTopicSummary(false)}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onDoubleClick={handleTopicSummaryEdit}
                    title="双击编辑"
                  >
                    {selectedTopic.summary || <span className="italic">无摘要</span>}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{t("workspace", "contextResources")}</h3>
                {contextResources.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {contextResources.length}
                  </Badge>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t("workspace", "addToContext")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {t("workspace", "addToContext")}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableResources.length > 0 ? (
                    availableResources.map((resource) => (
                      <DropdownMenuItem
                        key={resource.node_id}
                        onClick={() => void onAddToContext(resource)}
                        className="cursor-pointer gap-2"
                      >
                        <span>{resource.resource_subtype ? resourceSubtypeIcons[resource.resource_subtype] : "📎"}</span>
                        <span className="truncate">
                          {resource.title || "未命名文件"}
                        </span>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      {t("workspace", "noAvailableResources")}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {loadingResources ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : contextResources.length > 0 ? (
              <ContextNodeTree
                nodes={contextResources}
                currentResourceId={currentResource?.node_id}
                onNodeClick={(node) => {
                  if (node.node_type === "resource") {
                    onResourceClick(node);
                  } else {
                    onNodeClick?.(node);
                  }
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("workspace", "noContextResources")}
              </p>
            )}
          </div>

          {viewMode === 'file' && editorContent?.trim() && (
            <div>
              <h3 className="text-sm font-semibold mb-3">{t("workspace", "attachedText")}</h3>
              <Card>
                <CardContent className="p-3 max-h-48 overflow-y-auto">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {editorContent}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Resize Handle */}
      <div
        className={cn(
          "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent transition-colors",
          isResizing && "bg-accent"
        )}
        onMouseDown={onMouseDown}
      >
        <div className="absolute top-0 right-0 w-4 h-full -mr-1.5" />
      </div>
    </aside>
  );
}
