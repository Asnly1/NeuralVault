import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Task, TaskStatus, TaskPriority, priorityConfig } from "../types";
import {
  createTask,
  updateTaskTitle,
  updateTaskDescription,
  updateTaskPriority,
  updateTaskDueDate,
  markTaskAsDone,
  markTaskAsTodo,
} from "../api";

interface TaskEditCardProps {
  task?: Task; // 可选，传入则为编辑模式
  open: boolean; // 控制 Dialog 显示
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void; // 保存成功后的回调
}

interface FormData {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: Date | undefined; // 改为 Date 对象
}

export function TaskEditCard({
  task,
  open,
  onOpenChange,
  onSuccess,
}: TaskEditCardProps) {
  const isEditMode = !!task;

  // 初始化表单数据
  const getInitialFormData = (): FormData => {
    if (task) {
      return {
        title: task.title || "",
        description: task.description || "",
        status: task.status,
        priority: task.priority,
        due_date: task.due_date || undefined,
      };
    }
    return {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      due_date: undefined,
    };
  };

  const [formData, setFormData] = useState<FormData>(getInitialFormData());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当 task 或 open 变化时重置表单
  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData());
      setError(null);
    }
  }, [open, task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 验证标题
    if (!formData.title.trim()) {
      setError("标题不能为空");
      return;
    }

    setLoading(true);

    try {
      if (isEditMode) {
        // 编辑模式：对比并更新变化的字段
        const updates: Promise<void>[] = [];

        // 标题
        if (formData.title !== (task.title || "")) {
          updates.push(updateTaskTitle(task.task_id, formData.title));
        }

        // 描述
        if (formData.description !== (task.description || "")) {
          updates.push(
            updateTaskDescription(task.task_id, formData.description || null)
          );
        }

        // 优先级
        if (formData.priority !== task.priority) {
          updates.push(updateTaskPriority(task.task_id, formData.priority));
        }

        // 截止日期
        const originalDueDate = task.due_date
          ? task.due_date.toISOString().split("T")[0]
          : "";
        const newDueDate = formData.due_date
          ? formData.due_date.toISOString().split("T")[0]
          : "";
        if (newDueDate !== originalDueDate) {
          const dueDateValue = formData.due_date
            ? `${format(formData.due_date, "yyyy-MM-dd")} 00:00:00`
            : null;
          updates.push(updateTaskDueDate(task.task_id, dueDateValue));
        }

        // 状态
        if (formData.status !== task.status) {
          if (formData.status === "done") {
            updates.push(markTaskAsDone(task.task_id));
          } else {
            updates.push(markTaskAsTodo(task.task_id));
          }
        }

        // 执行所有更新
        await Promise.all(updates);
      } else {
        // 创建模式
        const dueDateValue = formData.due_date
          ? `${format(formData.due_date, "yyyy-MM-dd")} 00:00:00`
          : undefined;

        await createTask({
          title: formData.title,
          description: formData.description || undefined,
          status: formData.status,
          priority: formData.priority,
          due_date: dueDateValue,
        });
      }

      // 成功后回调
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error("保存任务失败:", err);
      setError("保存失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "编辑任务" : "创建任务"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* 标题 */}
          <div className="space-y-2">
            <Label htmlFor="title">
              标题 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="输入任务标题..."
              autoFocus
              disabled={loading}
            />
          </div>

          {/* 描述 */}
          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="输入任务描述..."
              rows={3}
              disabled={loading}
            />
          </div>

          {/* 状态和优先级 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 状态 */}
            <div className="space-y-2">
              <Label htmlFor="status">状态</Label>
              <Select
                value={formData.status}
                onValueChange={(value: TaskStatus) =>
                  setFormData({ ...formData, status: value })
                }
                disabled={loading}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">Todo</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 优先级 */}
            <div className="space-y-2">
              <Label htmlFor="priority">优先级</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: TaskPriority) =>
                  setFormData({ ...formData, priority: value })
                }
                disabled={loading}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["high", "medium", "low"] as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      <span
                        className="font-medium capitalize"
                        style={{
                          color: `hsl(${priorityConfig[p].color})`,
                        }}
                      >
                        {p}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 截止日期 */}
          <div className="space-y-2">
            <Label htmlFor="due_date">截止日期</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="due_date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.due_date && "text-muted-foreground"
                  )}
                  disabled={loading}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.due_date ? (
                    format(formData.due_date, "PPP")
                  ) : (
                    <span>选择日期</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.due_date}
                  onSelect={(date) =>
                    setFormData({ ...formData, due_date: date })
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
