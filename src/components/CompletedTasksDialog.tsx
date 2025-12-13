import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Task } from "../types";
import { TaskCard } from "./TaskCard";
import { fetchTodayCompletedTasks, softDeleteTask } from "../api";

interface CompletedTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void; // 当任务状态变更时通知父组件刷新
}

export function CompletedTasksDialog({
  open,
  onOpenChange,
  onTaskUpdated,
}: CompletedTasksDialogProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载已完成任务
  const loadCompletedTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const completedTasks = await fetchTodayCompletedTasks();
      setTasks(completedTasks);
    } catch (err) {
      console.error("加载已完成任务失败:", err);
      setError("加载失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 当对话框打开时加载数据
  useEffect(() => {
    if (open) {
      loadCompletedTasks();
    }
  }, [open]);

  // 任务更新后的处理
  const handleTaskUpdate = async () => {
    await loadCompletedTasks();
    // 通知父组件刷新主列表
    if (onTaskUpdated) {
      onTaskUpdated();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-foreground" />
            今天已完成的任务
            {!loading && tasks.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({tasks.length} 个)
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            加载中...
          </div>
        ) : error ? (
          <div className="text-destructive text-sm bg-destructive/10 p-4 rounded-md">
            {error}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Sparkles className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">今天还没有完成任何任务</p>
            <p className="text-xs mt-1 opacity-70">继续加油！</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px] pr-4">
            <div className="space-y-3">
              {tasks.map((task) => (
                <TaskCard
                  key={task.task_id}
                  task={task}
                  onUpdate={handleTaskUpdate}
                  onDelete={async (id) => {
                    if (confirm("确定要删除这个任务吗？")) {
                      await softDeleteTask(id);
                      handleTaskUpdate();
                    }
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
