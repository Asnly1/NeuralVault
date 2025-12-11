import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
      console.error("创建任务失败:", err);
    } finally {
      setCreating(false);
    }
  };

  // 处理删除任务
  const handleDeleteTask = async (taskId: number) => {
    if (!confirm("确定要删除这个任务吗？")) {
      return;
    }

    try {
      await deleteTask(taskId);
      onRefresh();
    } catch (err) {
      console.error("删除任务失败:", err);
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
    <ScrollArea className="h-full">
      <div className="max-w-[1400px] mx-auto p-8 space-y-8">
        {/* 顶部标题栏 */}
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">智能看板</h1>
            <p className="text-sm text-muted-foreground">
              今日待办 · 快速捕获 · 智能分类
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={loading ? "secondary" : "outline"}
              className="h-7 px-3"
            >
              {loading ? "同步中..." : "已同步"}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              title="刷新"
              className="h-9 w-9"
            >
              <span className="text-lg">↻</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onSeed}>
              生成演示数据
            </Button>
          </div>
        </header>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-destructive text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* 第一部分：智能待办列表 */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">📋 今日待办</h2>
              <Badge variant="secondary" className="text-xs">
                {sortedTasks.length} 项任务
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={sortMode === "smart" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortMode("smart")}
                className="h-8 text-xs"
              >
                智能排序
              </Button>
              <Button
                variant={sortMode === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortMode("manual")}
                className="h-8 text-xs"
              >
                手动排序
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="创建任务"
                  >
                    +
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>创建新任务</DialogTitle>
                    <DialogDescription>
                      填写任务信息，创建后将出现在待办列表中
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="title">
                        标题 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="title"
                        placeholder="输入任务标题"
                        value={formData.title}
                        onChange={(e) =>
                          setFormData({ ...formData, title: e.target.value })
                        }
                        autoFocus
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">描述（可选）</Label>
                      <Textarea
                        id="description"
                        placeholder="详细描述任务内容"
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
                        <Label htmlFor="priority">优先级</Label>
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
                            <SelectItem value="high">高</SelectItem>
                            <SelectItem value="medium">中</SelectItem>
                            <SelectItem value="low">低</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="due_date">截止日期（可选）</Label>
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
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={creating}
                    >
                      取消
                    </Button>
                    <Button
                      onClick={handleCreateTask}
                      disabled={!formData.title.trim() || creating}
                    >
                      {creating ? "创建中..." : "创建任务"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {sortedTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-5xl mb-4 opacity-50">✓</div>
                <h3 className="text-lg font-medium mb-2">暂无待办任务</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  太棒了！你已经完成了所有任务。使用下方的快速捕获输入新的想法或任务。
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        <Separator />

        {/* 第二部分：快速捕获 */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">⚡ 快速捕获</h2>
            <p className="text-sm text-muted-foreground">
              输入文字、粘贴图片或上传文件
            </p>
          </div>
          <QuickCapture onCapture={onCapture} loading={loading} />
        </section>

        <Separator />

        {/* 第三部分：待分类资源 */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">📂 待分类资源</h2>
              <Badge variant="outline" className="text-xs">
                {resources.length} 个文件
              </Badge>
            </div>
            {resources.length > 0 && (
              <p className="text-sm text-muted-foreground">
                💡 AI 提示：将相关资源关联到任务以便更好地组织
              </p>
            )}
          </div>

          {resources.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-5xl mb-4 opacity-50">◇</div>
                <h3 className="text-lg font-medium mb-2">暂无待分类资源</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-3">
                  通过快速捕获添加文件、图片或文本，AI
                  将帮助你自动分类和建立关联。
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <kbd className="px-2 py-1 rounded bg-muted font-mono">
                    Alt
                  </kbd>
                  <span>+</span>
                  <kbd className="px-2 py-1 rounded bg-muted font-mono">
                    Space
                  </kbd>
                  <span>快捷键唤起悬浮输入窗</span>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* 页脚提示 */}
        <footer className="pt-8 pb-4 text-center">
          <p className="text-xs text-muted-foreground">
            点击任务卡片进入工作台 · 使用快速捕获添加新内容 · 拖拽资源关联到任务
          </p>
        </footer>
      </div>
    </ScrollArea>
  );
}
