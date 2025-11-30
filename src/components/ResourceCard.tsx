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
import { Resource, Task, resourceTypeIcons } from "../types";

interface ResourceCardProps {
  resource: Resource;
  tasks?: Task[];
  onLinkToTask?: (resourceId: number, taskId: number) => Promise<void>;
}

export function ResourceCard({
  resource,
  tasks = [],
  onLinkToTask,
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

  return (
    <Card className="transition-all hover:shadow-md hover:border-primary/50">
      <CardContent className="flex items-center gap-3 p-3">
        {/* File Icon */}
        <span className="text-xl shrink-0">
          {resourceTypeIcons[resource.file_type]}
        </span>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium truncate">
            {resource.display_name || "未命名文件"}
          </h4>
          {resource.created_at && (
            <span className="text-xs text-muted-foreground">
              {resource.created_at.toLocaleDateString("zh-CN")}
            </span>
          )}
        </div>

        {/* Link Button with Dropdown */}
        {onLinkToTask && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={linking || tasks.length === 0}
                title={tasks.length === 0 ? "暂无可关联的任务" : "关联到任务"}
              >
                {linking ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <span>🔗</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>选择任务</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {tasks.map((task) => (
                <DropdownMenuItem
                  key={task.task_id}
                  onClick={() => handleSelectTask(task.task_id)}
                  className="cursor-pointer"
                >
                  <span className="mr-2">
                    {task.status === "inbox"
                      ? "📥"
                      : task.status === "todo"
                      ? "📋"
                      : "⚡"}
                  </span>
                  <span className="truncate">{task.title || "无标题"}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}
