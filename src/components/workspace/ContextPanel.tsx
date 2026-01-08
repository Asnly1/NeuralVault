import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NodeRecord, priorityConfig, resourceSubtypeIcons } from "@/types";
import { Minus, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ContextPanelProps {
  isResourceMode: boolean;
  selectedTask: NodeRecord | null;
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
  onAddToContext: (resource: NodeRecord) => void;
  onRemoveFromContext: (resourceId: number) => void;
}

export function ContextPanel({
  isResourceMode,
  selectedTask,
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
  onRemoveFromContext,
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
          {!isResourceMode && selectedTask && (
            <div>
              <h3 className="text-sm font-semibold mb-3">{t("workspace", "taskDetails")}</h3>
              <Card>
                <CardContent className="p-3 space-y-3">
                  <h4 className="font-medium">
                    {selectedTask.title || "未命名任务"}
                  </h4>
                  {selectedTask.summary && (
                    <p className="text-sm text-muted-foreground">
                      {selectedTask.summary}
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
            </div>
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
                        onClick={() => onAddToContext(resource)}
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
              <div className="space-y-1">
                {contextResources.map((resource) => {
                  const isCurrent =
                    currentResource?.node_id === resource.node_id;
                  return (
                    <div
                      key={resource.node_id}
                      className="flex items-center gap-2"
                    >
                      <button
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors",
                          isCurrent ? "bg-secondary" : "hover:bg-muted"
                        )}
                        onClick={() => onResourceClick(resource)}
                      >
                        {isCurrent && (
                          <span>{resource.resource_subtype ? resourceSubtypeIcons[resource.resource_subtype] : "📎"}</span>
                        )}
                        <span className="truncate flex-1">
                          {resource.title || "未命名文件"}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFromContext(resource.node_id);
                        }}
                        title={t("workspace", "removeFromContext")}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
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
