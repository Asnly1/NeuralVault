import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Task, Resource, TaskStatus } from "../types";
import { TaskCard, ResourceCard, QuickCapture } from "../components";

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

const columns: { key: TaskStatus; label: string; emoji: string }[] = [
  { key: "inbox", label: "收件箱", emoji: "📥" },
  { key: "todo", label: "待办", emoji: "📋" },
  { key: "doing", label: "进行中", emoji: "⚡" },
];

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
  // useMemo: 只有当 tasks 这个数据发生变化时，才重新运行里面的分组逻辑；否则，请直接给我上次算好的结果
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      inbox: [],
      todo: [],
      doing: [],
      done: [],
      archived: [],
    };

    tasks.forEach((task) => {
      if (groups[task.status]) {
        groups[task.status].push(task);
      }
    });

    return groups;
  }, [tasks]);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">智能看板</h1>
            <p className="text-muted-foreground">管理你的任务与资源</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={loading ? "secondary" : "outline"}>
              {loading ? "同步中..." : "已同步"}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              title="刷新"
            >
              <span className="text-lg">↻</span>
            </Button>
            <Button variant="secondary" onClick={onSeed}>
              生成演示数据
            </Button>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Quick Capture */}
        <section>
          <QuickCapture onCapture={onCapture} loading={loading} />
        </section>

        <Separator />

        {/* Task Board */}
        <section>
          <div className="grid grid-cols-3 gap-4">
            {columns.map((col) => (
              <Card key={col.key} className="flex flex-col max-h-[400px]">
                <CardHeader className="pb-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base font-medium">
                      <span>{col.emoji}</span>
                      <span>{col.label}</span>
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {groupedTasks[col.key].length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 pt-0 overflow-hidden">
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-2 pb-2">
                      {groupedTasks[col.key].length > 0 ? (
                        groupedTasks[col.key].map((task) => (
                          <TaskCard
                            key={task.task_id}
                            task={task}
                            onClick={() => onSelectTask(task)}
                          />
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                          <span className="text-2xl mb-2">○</span>
                          <span className="text-sm">暂无任务</span>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Uncategorized Resources */}
        <section>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <span>📂</span>
                  <span>未分类资源</span>
                </CardTitle>
                <Badge variant="secondary">{resources.length} 项</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {resources.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <span className="text-3xl mb-3">◇</span>
                  <p className="text-sm">没有未分类的资源</p>
                  <p className="text-xs mt-1">
                    使用快捷键 Alt + Space 快速捕获
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </ScrollArea>
  );
}
