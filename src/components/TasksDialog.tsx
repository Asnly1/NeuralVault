import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Sparkles, Calendar } from "lucide-react";
import { Task } from "../types";
import { TaskCard } from "./TaskCard";
import { fetchTasksByDate, softDeleteTask } from "../api";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface TasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
  // 可选的日期参数，用于查询指定日期的任务（默认为今天）
  date?: Date | null;
  // 是否只显示已完成的任务（默认 false）
  showOnlyCompleted?: boolean;
}

export function TasksDialog({
  open,
  onOpenChange,
  onTaskUpdated,
  date,
  showOnlyCompleted = false,
}: TasksDialogProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载任务
  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      // 确定要查询的日期
      const queryDate = date || new Date();
      const dateStr = format(queryDate, "yyyy-MM-dd");
      
      // 统一使用 fetchTasksByDate
      const dateTasks = await fetchTasksByDate(dateStr);
      
      // 根据 showOnlyCompleted 参数过滤已完成的任务
      if (showOnlyCompleted) {
        setTasks(dateTasks.filter(task => task.status === "done"));
      } else {
        setTasks(dateTasks);
      }
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
  }, [open, date]);

  // 任务更新后的处理
  const handleTaskUpdate = async () => {
    await loadTasks();
    // 通知父组件刷新主列表
    if (onTaskUpdated) {
      onTaskUpdated();
    }
  };

  // 标题和图标
  const title = showOnlyCompleted
    ? "今天已完成的任务"
    : date
    ? format(date, "yyyy年MM月dd日 EEEE", { locale: zhCN })
    : format(new Date(), "yyyy年MM月dd日 EEEE", { locale: zhCN });
  
  const icon = showOnlyCompleted ? (
    <CheckCircle2 className="h-5 w-5 text-foreground" />
  ) : (
    <Calendar className="h-5 w-5 text-foreground" />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
            {!loading && tasks.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({tasks.length} 个任务)
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
            <p className="text-sm font-medium">
              {showOnlyCompleted ? "今天还没有完成任何任务" : "这一天没有任务"}
            </p>
            {showOnlyCompleted && <p className="text-xs mt-1 opacity-70">继续加油！</p>}
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
