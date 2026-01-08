import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal,
  CheckCircle2,
  Circle,
  Trash2,
  Loader2
} from "lucide-react";
import { Resource, Task, IngestProgress, ProcessingStage, resourceTypeIcons } from "../types";

interface ResourceCardProps {
  resource: Resource;
  tasks?: Task[];
  onLinkToTask?: (resourceId: number, taskId: number) => Promise<void>;
  onDelete?: (resourceId: number) => Promise<void>;
  onClick?: (resource: Resource) => void;
  progress?: IngestProgress;
}

// Processing stage display config
const stageConfig: Record<ProcessingStage, { label: string; color: string }> = {
  todo: { label: "待处理", color: "text-muted-foreground" },
  chunking: { label: "分块中", color: "text-blue-500" },
  embedding: { label: "向量化", color: "text-purple-500" },
  done: { label: "已完成", color: "text-green-500" },
};

export function ResourceCard({
  resource,
  tasks = [],
  onLinkToTask,
  onDelete,
  onClick,
  progress,
}: ResourceCardProps) {
  const [linking, setLinking] = useState(false);

  const handleSelectTask = async (taskId: number) => {
    if (onLinkToTask && !linking) {
      setLinking(true);
      try {
        await onLinkToTask(resource.resource_id, taskId);
      } finally {
        setLinking(false);
      }
    }
  };

  // Check if currently processing (not todo and not done)
  const isProcessing = progress && (progress.status === "chunking" || progress.status === "embedding");
  const stageInfo = progress ? stageConfig[progress.status] : null;

  return (
    <Card 
      className={`group transition-all border-border hover:bg-accent/50 overflow-hidden relative ${onClick ? 'cursor-pointer' : ''}`}
      onClick={() => onClick?.(resource)}
    >
      <CardContent className="flex items-center gap-3 p-3">
        {/* File Icon */}
        <div className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity text-base">
          {resource.file_type ? resourceTypeIcons[resource.file_type] : "📎"}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <h4 className="text-sm font-medium truncate text-foreground/90 group-hover:text-foreground transition-colors">
            {resource.display_name || "Untitled"}
          </h4>
          <div className="flex items-center gap-2">
            {resource.created_at && (
              <span className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors">
                {resource.created_at.toLocaleDateString("zh-CN")}
              </span>
            )}
            {/* Progress indicator */}
            {stageInfo && progress?.status !== "done" && (
              <span className={`flex items-center gap-1 text-[10px] ${stageInfo.color}`}>
                {isProcessing && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                {stageInfo.label}
                {progress?.percentage !== undefined && progress.percentage > 0 && (
                  <span className="text-[9px] opacity-75">
                    {progress.percentage}%
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Actions Group */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Link Task */}
          {onLinkToTask && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={linking || tasks.length === 0}
                  onClick={(e) => e.stopPropagation()}
                >
                  {linking ? (
                    <span className="animate-spin text-xs">⟳</span>
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Link to task</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {tasks.length > 0 ? tasks.map((task) => (
                  <DropdownMenuItem
                    key={task.task_id}
                    onClick={() => handleSelectTask(task.task_id)}
                    className="cursor-pointer gap-2"
                  >
                    {task.status === "todo" ? <Circle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3 text-green-500" />}
                    <span className="truncate text-sm">{task.title || "Untitled"}</span>
                  </DropdownMenuItem>
                )) : (
                   <div className="p-2 text-xs text-muted-foreground text-center">No active tasks</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

           {/* Delete Action */}
           {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(resource.resource_id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

