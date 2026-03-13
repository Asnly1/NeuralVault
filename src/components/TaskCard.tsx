import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Calendar, AlertCircle, MoreVertical, Ban, RotateCcw } from "lucide-react";
import { NodeRecord, priorityConfig } from "../types";
import { TaskEditCard } from "./TaskEditCard";
import { markTaskAsDone, markTaskAsTodo, markTaskAsCancelled } from "../api";

interface TaskCardProps {
  task: NodeRecord;
  onClick?: () => void;
  onDelete?: (nodeId: number) => void;
  onUpdate?: () => void;
}

export function TaskCard({ task, onClick, onDelete, onUpdate }: TaskCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  const priority = priorityConfig[task.priority ?? "medium"];
  const isInactive = task.task_status !== "todo";
  const isCancelled = task.task_status === "cancelled";

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，防止触发卡片的 onClick
    if (onDelete) {
      onDelete(task.node_id);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡
    setEditOpen(true);
  };

  const handleStatusToggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡
    try {
      if (task.task_status === "todo") {
        await markTaskAsDone(task.node_id);
      } else {
        await markTaskAsTodo(task.node_id);
      }
      // 刷新数据
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error("切换任务状态失败:", err);
    }
  };

  const handleCancelToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (task.task_status === "cancelled") {
        await markTaskAsTodo(task.node_id);
      } else {
        await markTaskAsCancelled(task.node_id);
      }
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error("切换任务取消状态失败:", err);
    }
  };

  return (
    <>
      <Card
        className={cn(
          "cursor-pointer transition-all duration-100 border-transparent hover:bg-muted/40 relative group min-h-[100px] flex flex-col rounded-md",
          isOverdue && "border-destructive/30 bg-destructive/5"
        )}
        onClick={onClick}
      >
        {/* Notion-style left indicator */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-transparent group-hover:bg-foreground/10 rounded-l transition-colors duration-100" />
        {/* Action Buttons */}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {/* Edit Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleEditClick}
            title="Edit task"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>

          {/* Delete Button */}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              title="Delete task"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Cancel/Restore Button */}
          {task.task_status !== "done" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={handleCancelToggle}
              title={isCancelled ? "恢复为待办" : "取消任务"}
            >
              {isCancelled ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>

        <CardHeader className="p-3 pb-1 flex-shrink-0">
          <div className="flex items-start gap-2 pr-14">
            <button
              onClick={handleStatusToggle}
              className="mt-1 flex-shrink-0 transition-colors hover:border-foreground/40"
              title={task.task_status === "todo" ? "标记为完成" : "标记为待办"}
            >
              {isInactive ? (
                <div className="w-3.5 h-3.5 rounded-sm bg-foreground flex items-center justify-center">
                  <svg
                    className="w-2.5 h-2.5 text-background"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M2 6L5 9L10 3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              ) : (
                <div className="w-3.5 h-3.5 rounded-sm border border-foreground/20" />
              )}
            </button>
            <h4
              className={`text-sm font-medium leading-snug ${
                isInactive ? "line-through text-muted-foreground" : ""
              }`}
            >
              {task.title || "Untitled"}
            </h4>
          </div>
        </CardHeader>

        {(task.summary || task.due_date || task.priority) && (
          <CardContent className="px-3 pb-3 pt-1 flex flex-col gap-2 flex-grow">
            {task.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
                {task.summary}
              </p>
            )}

            <div className="flex items-center gap-2 pl-6 mt-auto">
              {/* 优先级文字标签 */}
              <span
                className="text-xs font-medium"
                style={{
                  color: `hsl(${priority.color})`,
                }}
              >
                {task.priority === "high"
                  ? "High"
                  : task.priority === "medium"
                  ? "Medium"
                  : "Low"}
              </span>
              {task.due_date && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] h-5 px-1.5 font-normal border-transparent bg-transparent text-muted-foreground gap-1 p-0",
                    isOverdue && "text-destructive font-medium"
                  )}
                >
                  {isOverdue ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : (
                    <Calendar className="h-3 w-3" />
                  )}
                  {task.due_date.toLocaleDateString("zh-CN")}
                </Badge>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Edit Dialog */}
      <TaskEditCard
        task={task}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => {
          if (onUpdate) {
            onUpdate();
          }
        }}
      />
    </>
  );
}
