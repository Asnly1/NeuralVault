
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Calendar, AlertCircle } from "lucide-react";
import { Task, priorityConfig } from "../types";

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onDelete?: (taskId: number) => void;
}

export function TaskCard({ task, onClick, onDelete }: TaskCardProps) {

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
        "cursor-pointer transition-all border-border shadow-sm hover:shadow-none hover:bg-muted/40 relative group",
        isOverdue && "border-destructive/30 bg-destructive/5"
      )}
      onClick={onClick}
    >
      {/* Delete Button */}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive z-10"
          onClick={handleDelete}
          title="Delete task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}

      <CardHeader className="p-3 pb-1">
        <div className="flex items-start gap-2 pr-6">
          <div className="mt-1">
             <div className="w-3.5 h-3.5 rounded-sm border border-foreground/20" />
          </div>
          <h4 className={`text-sm font-medium leading-snug ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
            {task.title || "Untitled"}
          </h4>
        </div>
      </CardHeader>

      {(task.description || task.due_date) && (
        <CardContent className="px-3 pb-3 pt-1 flex flex-col gap-2">
          {task.description && (
             <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
               {task.description}
             </p>
          )}
          
          <div className="flex items-center gap-2 pl-6 mt-1">
            <Badge
              variant="secondary"
              className="text-[10px] h-5 px-1.5 font-normal bg-opacity-10 text-muted-foreground border border-transparent"
              style={{
                backgroundColor: `${priority.color}10`,
                color: priority.color,
              }}
            >
              {priority.label}
            </Badge>
            {task.due_date && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] h-5 px-1.5 font-normal border-transparent bg-transparent text-muted-foreground gap-1 p-0",
                  isOverdue && "text-destructive font-medium"
                )}
              >
                {isOverdue ? <AlertCircle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                {task.due_date.toLocaleDateString("zh-CN")}
              </Badge>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
