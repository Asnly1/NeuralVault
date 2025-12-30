import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Task, Resource, priorityConfig, resourceTypeIcons } from "@/types";
import { Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ContextPanelProps {
  isResourceMode: boolean;
  selectedTask: Task | null;
  propSelectedResource: Resource | null;
  selectedResource: Resource | null;
  linkedResources: Resource[];
  loadingResources: boolean;
  hoveredResourceId: number | null;
  setHoveredResourceId: (id: number | null) => void;
  editorContent: string;
  viewMode: 'file' | 'text';
  width: number;
  tempWidth: number | null;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onResourceClick: (resource: Resource) => void;
  onDeleteResource: (resourceId: number, e: React.MouseEvent) => void;
}

export function ContextPanel({
  isResourceMode,
  selectedTask,
  propSelectedResource,
  selectedResource,
  linkedResources,
  loadingResources,
  hoveredResourceId,
  setHoveredResourceId,
  editorContent,
  viewMode,
  width,
  tempWidth,
  isResizing,
  onMouseDown,
  onResourceClick,
  onDeleteResource,
}: ContextPanelProps) {
  const { t } = useLanguage();
  const currentWidth = tempWidth !== null ? tempWidth : width;

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
          {isResourceMode ? (
            /* 资源模式：显示资源详情 */
            <div>
              <h3 className="text-sm font-semibold mb-3">资源详情</h3>
              <Card>
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl shrink-0">{resourceTypeIcons[propSelectedResource!.file_type]}</span>
                    <h4 className="font-medium truncate">
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
                    <p className="text-xs text-muted-foreground break-all" title={propSelectedResource!.file_path}>
                      路径: {propSelectedResource!.file_path}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* 查看文件模式下显示附带文本 */}
              {viewMode === 'file' && editorContent?.trim() && (
                <div className="mt-4">
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
                          backgroundColor: `${priorityConfig[selectedTask!.priority].color}20`,
                          color: priorityConfig[selectedTask!.priority].color,
                        }}
                      >
                        {priorityConfig[selectedTask!.priority].label}
                      </Badge>
                    </div>
                    {selectedTask!.due_date && (
                      <p className="text-xs text-muted-foreground">
                        截止: {selectedTask!.due_date.toLocaleDateString("zh-CN")}
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
                        onMouseEnter={() => setHoveredResourceId(resource.resource_id)}
                        onMouseLeave={() => setHoveredResourceId(null)}
                      >
                        <button
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors",
                            selectedResource?.resource_id === resource.resource_id
                              ? "bg-secondary"
                              : "hover:bg-muted"
                          )}
                          onClick={() => onResourceClick(resource)}
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
                            onClick={(e) => onDeleteResource(resource.resource_id, e)}
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

              {/* 任务模式：查看文件模式下显示附带文本 */}
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
            </>
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
