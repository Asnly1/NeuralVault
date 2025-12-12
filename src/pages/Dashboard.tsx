import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Plus, 
  RotateCcw, 
  Sparkles, 
  CheckCircle2, 
  LayoutGrid, 
  Zap, 
  Archive 
} from "lucide-react";
import { Task, Resource, TaskPriority } from "../types";
import { TaskCard, ResourceCard, QuickCapture } from "../components";
import { createTask, deleteTask } from "../api";

interface DashboardPageProps {
  tasks: Task[];
  resources: Resource[];
  loading: boolean;
  error: string | null;
  onCapture: (content: string, filePath?: string) => Promise<void>;
  onSeed: () => void;
  onRefresh: () => void;
  onSelectTask: (task: Task) => void;
  onLinkResource: (resourceId: number, taskId: number) => Promise<void>;
}

type SortMode = "manual" | "smart";

export function DashboardPage({
  tasks,
  resources,
  loading,
  error,
  onCapture,
  onSeed,
  onRefresh,
  onSelectTask,
  onLinkResource,
}: DashboardPageProps) {
  const [sortMode, setSortMode] = useState<SortMode>("smart");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // 创建任务表单状态
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
    due_date: "",
  });

  // 处理创建任务
  const handleCreateTask = async () => {
    if (!formData.title.trim()) {
      return;
    }

    setCreating(true);
    try {
      await createTask({
        title: formData.title,
        description: formData.description || undefined,
        priority: formData.priority,
        due_date: formData.due_date || undefined,
      });

      // 重置表单
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        due_date: "",
      });

      // 关闭对话框
      setDialogOpen(false);
      
      // 刷新数据
      onRefresh();
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setCreating(false);
    }
  };

  // 处理删除任务
  const handleDeleteTask = async (taskId: number) => {
    if (!confirm("Are you sure you want to delete this task?")) {
      return;
    }

    try {
      await deleteTask(taskId);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  // 过滤出活跃任务（todo）
  const activeTasks = useMemo(() => {
    return tasks.filter((task) => task.status === "todo");
  }, [tasks]);

  // 排序任务
  const sortedTasks = useMemo(() => {
    if (sortMode === "manual") {
      // 手动排序模式：按创建时间降序
      return [...activeTasks].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
    } else {
      // 智能排序模式：优先级 + 截止日期
      return [...activeTasks].sort((a, b) => {
        // 优先级权重：high=3, medium=2, low=1
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aWeight = priorityWeight[a.priority] || 0;
        const bWeight = priorityWeight[b.priority] || 0;

        // 如果优先级不同，按优先级排序
        if (aWeight !== bWeight) {
          return bWeight - aWeight;
        }

        // 如果优先级相同，有截止日期的排在前面
        if (a.due_date && !b.due_date) return -1;
        if (!a.due_date && b.due_date) return 1;

        // 都有截止日期，按截止日期排序
        if (a.due_date && b.due_date) {
          return (
            new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          );
        }

        // 都没有截止日期，按创建时间排序
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
    }
  }, [activeTasks, sortMode]);

  return (
    <ScrollArea className="h-full bg-background">
      <div className="max-w-[1200px] mx-auto p-8 lg:p-12 space-y-12">
        {/* 顶部标题栏 */}
        <header className="flex items-end justify-between border-b border-border pb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-base text-muted-foreground">
              Overview of your tasks and captured resources.
            </p>
          </div>
          <div className="flex items-center gap-2">
             <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className={`h-8 w-8 p-0 text-muted-foreground ${loading ? 'animate-spin' : ''}`}
              title="Refresh"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onSeed} className="text-muted-foreground h-8">
              <Sparkles className="h-4 w-4 mr-2" />
              Seed Data
            </Button>
          </div>
        </header>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-destructive text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* 第一部分：智能待办列表 */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-orange-100 dark:bg-orange-900/20 rounded-md">
                 <CheckCircle2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Active Tasks</h2>
              <Badge variant="secondary" className="font-normal text-muted-foreground bg-muted/50 ml-2">
                {sortedTasks.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-muted/30 p-1 rounded-lg flex gap-1">
                <Button
                    variant={sortMode === "smart" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setSortMode("smart")}
                    className="h-7 text-xs px-3 shadow-none"
                >
                    Smart Sort
                </Button>
                <Button
                    variant={sortMode === "manual" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setSortMode("manual")}
                    className="h-7 text-xs px-3 shadow-none"
                >
                    Manual
                </Button>
              </div>
              
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 w-8 p-0 ml-2 rounded-full"
                    title="Create Task"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>New Task</DialogTitle>
                    <DialogDescription>
                      Add a new item to your todo list.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="title">
                        Title <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="title"
                        placeholder="Task title"
                        value={formData.title}
                        onChange={(e) =>
                          setFormData({ ...formData, title: e.target.value })
                        }
                        autoFocus
                        className="font-medium"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Add details..."
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="priority">Priority</Label>
                        <Select
                          value={formData.priority}
                          onValueChange={(value: TaskPriority) =>
                            setFormData({ ...formData, priority: value })
                          }
                        >
                          <SelectTrigger id="priority">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="due_date">Due Date</Label>
                        <Input
                          id="due_date"
                          type="date"
                          value={formData.due_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              due_date: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      onClick={() => setDialogOpen(false)}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateTask}
                      disabled={!formData.title.trim() || creating}
                    >
                      {creating ? "Creating..." : "Create Task"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {sortedTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedTasks.map((task) => (
                <TaskCard
                  key={task.task_id}
                  task={task}
                  onClick={() => onSelectTask(task)}
                  onDelete={handleDeleteTask}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg bg-muted/20">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-base font-medium mb-1">All caught up</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  You have no active tasks. Enjoy your day!
                </p>
            </div>
          )}
        </section>

        <Separator />

        {/* 第二部分：快速捕获 */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
             <div className="p-1.5 bg-blue-100 dark:bg-blue-900/20 rounded-md">
                 <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            <h2 className="text-xl font-semibold">Quick Capture</h2>
          </div>
          <QuickCapture onCapture={onCapture} loading={loading} />
          <p className="text-xs text-muted-foreground pl-1">
             Capture thoughts, files, or images instantly.
          </p>
        </section>

        <Separator />

        {/* 第三部分：待分类资源 */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="p-1.5 bg-purple-100 dark:bg-purple-900/20 rounded-md">
                 <Archive className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold">Inbox Resources</h2>
              <Badge variant="secondary" className="font-normal text-muted-foreground bg-muted/50 ml-2">
                {resources.length}
              </Badge>
            </div>
             {resources.length > 0 && (
                <span className="text-xs text-muted-foreground hidden sm:block">
                  Drag or use menu to link to tasks
                </span>
             )}
          </div>

          {resources.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {resources.map((res) => (
                <ResourceCard
                  key={res.resource_id}
                  resource={res}
                  tasks={tasks}
                  onLinkToTask={onLinkResource}
                />
              ))}
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg bg-muted/20">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <LayoutGrid className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-base font-medium mb-1">Inbox is empty</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Captured files and texts will appear here for you to organize.
                </p>
            </div>
          )}
        </section>

        <footer className="pt-12 pb-6 text-center text-xs text-muted-foreground opacity-60">
           {/* 页脚提示 */}
           NeuralVault V1.0 • Notion Style Edition
        </footer>
      </div>
    </ScrollArea>
  );
}
