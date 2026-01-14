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
import { NodeRecord, resourceSubtypeIcons } from "@/types";
import { Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ContextNodeTree } from "../ContextNodeTree";
import { NodeDetailCard } from "./NodeDetailCard";

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
  viewMode: "file" | "text";
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
          style={{ maxWidth: `${currentWidth}px`, boxSizing: "border-box" }}
        >
          {/* Task Detail */}
          {!isResourceMode && !isTopicMode && selectedTask && (
            <NodeDetailCard
              node={selectedTask}
              nodeType="task"
              onUpdate={onTaskUpdate}
            />
          )}

          {/* Topic Detail */}
          {isTopicMode && selectedTopic && (
            <NodeDetailCard
              node={selectedTopic}
              nodeType="topic"
              onUpdate={onTopicUpdate}
            />
          )}

          {/* Context Resources */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {t("workspace", "contextResources")}
                </h3>
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
                        <span>
                          {resource.resource_subtype
                            ? resourceSubtypeIcons[resource.resource_subtype]
                            : "📎"}
                        </span>
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

          {/* Attached Text (when viewing file) */}
          {viewMode === "file" && editorContent?.trim() && (
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t("workspace", "attachedText")}
              </h3>
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
