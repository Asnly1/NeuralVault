import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Task, priorityConfig } from "../types";

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  const priority = priorityConfig[task.priority];

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
        isOverdue && "border-destructive/50 bg-destructive/5"
      )}
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start gap-2">
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
