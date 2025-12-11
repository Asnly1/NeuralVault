import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Task, priorityConfig } from "../types";

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onDelete?: (taskId: number) => void;
}

export function TaskCard({ task, onClick, onDelete }: TaskCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  const priority = priorityConfig[task.priority];

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，防止触发卡片的 onClick
    if (onDelete) {
      onDelete(task.task_id);
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50 relative group",
        isOverdue && "border-destructive/50 bg-destructive/5"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 删除按钮 */}
      {isHovered && onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive z-10"
          onClick={handleDelete}
          title="删除任务"
        >
          <span className="text-base">🗑️</span>
        </Button>
      )}

      <CardHeader className="p-3 pb-2">
        <div className="flex items-start gap-2 pr-8">
          <span
            className="mt-1.5 h-2 w-2 rounded-full shrink-0"
            style={{ background: priority.color }}
          />
          <h4 className="text-sm font-medium leading-tight line-clamp-2">
            {task.title || "未命名任务"}
          </h4>
        </div>
      </CardHeader>

      {task.description && (
        <CardContent className="px-3 pb-2 pt-0">
          <p className="text-xs text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        </CardContent>
      )}

      <CardContent className="flex items-center gap-2 px-3 pb-3 pt-0">
        <Badge
          variant="secondary"
          className="text-xs px-1.5 py-0"
          style={{
            backgroundColor: `${priority.color}20`,
            color: priority.color,
          }}
        >
          {priority.label}
        </Badge>
        {task.due_date && (
          <Badge
            variant={isOverdue ? "destructive" : "outline"}
            className="text-xs px-1.5 py-0"
          >
            {isOverdue && "⚠ "}
            {task.due_date.toLocaleDateString("zh-CN")}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
