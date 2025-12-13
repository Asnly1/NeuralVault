import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles } from "lucide-react";
import { Task } from "../types";
import { TaskCard } from "./TaskCard";
import { softDeleteTask } from "../api";

interface TasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
  // 函数负责获取和过滤任务，由调用方决定如何获取数据
  fetchTasks: () => Promise<Task[]>;
  // 对话框标题
  title: string;
}

export function TasksDialog({
  open,
  onOpenChange,
  onTaskUpdated,
  fetchTasks,
  title,
}: TasksDialogProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载任务
  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedTasks = await fetchTasks();
      setTasks(fetchedTasks);
    } catch (err) {
      console.error("加载任务失败:", err);
      setError("加载失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 当对话框打开时加载数据
  useEffect(() => {
    if (open) {
      loadTasks();
    }
  }, [open]);

  // 任务更新后的处理
  const handleTaskUpdate = async () => {
    await loadTasks();
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
            {title}
            {!loading && tasks.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({tasks.length} 个任务)
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {title}的任务列表
          </DialogDescription>
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
            <p className="text-sm font-medium">暂无任务</p>
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
