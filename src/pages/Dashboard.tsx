import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Sparkles, CheckCircle2, LayoutGrid, Plus } from "lucide-react";

import { Task, Resource, IngestProgress, InputMode } from "../types";
import { TaskCard } from "../components/TaskCard";
import { ResourceCard } from "../components/ResourceCard";
import { QuickCapture } from "../components/QuickCapture";
import { TaskEditCard } from "../components/TaskEditCard";
import { TasksDialog } from "../components/TasksDialog";
import { TemporaryChatPanel } from "../components/TemporaryChatPanel";
import { softDeleteTask, softDeleteResource, fetchAllTasks } from "../api";
import { useLanguage } from "@/contexts/LanguageContext";
import { isSameDay } from "date-fns";

interface DashboardPageProps {
  tasks: Task[];
  resources: Resource[];
  loading: boolean;
  error: string | null;
  onCapture: (content: string, filePath?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectTask: (task: Task) => void;
  onSelectResource: (resource: Resource) => void;
  onLinkResource: (resourceId: number, taskId: number) => Promise<void>;
  progressMap?: Map<number, IngestProgress>;
  onNavigateToSettings?: () => void;
}

export function DashboardPage({
  tasks,
  resources,
  loading,
  error,
  onCapture,
  onRefresh,
  onSelectTask,
  onSelectResource,
  onLinkResource,
  progressMap,
  onNavigateToSettings,
}: DashboardPageProps) {
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [completedDialogOpen, setCompletedDialogOpen] = useState(false);
  // Capture/Chat 模式状态
  const [captureMode, setCaptureMode] = useState<InputMode>("capture");
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [initialChatMessage, setInitialChatMessage] = useState("");
  const { t } = useLanguage();

  // Chat 模式提交处理
  const handleChatSubmit = (content: string) => {
    setInitialChatMessage(content);
    setShowChatPanel(true);
  };

  // Smart Sort: Logic to sort tasks
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // 0. Done tasks at the bottom
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;

      // 1. Priority weight (处理 null 值，默认为 medium)
      const pWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const aPriority = a.priority ?? "medium";
      const bPriority = b.priority ?? "medium";
      if (pWeight[aPriority] !== pWeight[bPriority]) {
        return pWeight[bPriority] - pWeight[aPriority];
      }

      // 2. Due Date (Earlier first)
      if (a.due_date && b.due_date) {
        return a.due_date.getTime() - b.due_date.getTime();
      }
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;

      return 0;
    });
  }, [tasks]);

  const activeTasks = sortedTasks.filter((t) => t.status !== "done");
  const unlinkedResources = resources.filter(
    (r) => r.classification_status === "unclassified"
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("dashboard", "greetingMorning");
    if (hour < 18) return t("dashboard", "greeting");
    return t("dashboard", "greetingEvening");
  };

  // Chat 面板显示时，渲染临时聊天面板
  if (showChatPanel) {
    return (
      <TemporaryChatPanel
        initialMessage={initialChatMessage}
        onClose={() => {
          setShowChatPanel(false);
          setInitialChatMessage("");
        }}
        onNavigateToSettings={onNavigateToSettings}
      />
    );
  }

  return (
    <div className="h-full flex flex-col max-w-[1200px] mx-auto w-full p-8 lg:p-12 space-y-10 overflow-auto">
      {/* 1. Header & Quick Capture */}
      <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {getGreeting()}, User
          </h1>
          <p className="text-muted-foreground text-base">
            {t("dashboard", "quickCapture")}
          </p>
        </header>

        <div className="max-w-2xl">
          <QuickCapture
            onCapture={onCapture}
            mode={captureMode}
            onModeChange={setCaptureMode}
            onChatSubmit={handleChatSubmit}
          />
        </div>
      </section>

      {/* 2. Tasks Area */}
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2 text-foreground">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">{t("dashboard", "tasks")}</h2>
            <Badge
              variant="secondary"
              className="ml-2 font-normal text-xs bg-muted text-muted-foreground hover:bg-muted"
            >
              {activeTasks.length} Pending
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* 查看今日已完成任务按钮 */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-3 shadow-none"
              onClick={() => setCompletedDialogOpen(true)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              {t("dashboard", "completedToday")}
            </Button>

            {/* 创建任务按钮 */}
            <Button
              size="sm"
              className="h-8 rounded-full px-3 shadow-none bg-foreground text-background hover:bg-foreground/90 transition-all"
              onClick={() => setCreateTaskOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("dashboard", "createTask")}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            Loading...
          </div>
        ) : error ? (
          <div className="text-destructive text-sm bg-destructive/10 p-4 rounded-md">
            {error}
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
            <Sparkles className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm font-medium">{t("dashboard", "noTasks")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTasks.map((task) => (
              <TaskCard
                key={task.task_id}
                task={task}
                onClick={() => onSelectTask(task)}
                onDelete={async (id) => {
                  if (confirm("Delete this task?")) {
                    await softDeleteTask(id);
                    onRefresh();
                  }
                }}
                onUpdate={onRefresh}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create/Edit Task Dialog */}
      <TaskEditCard
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        onSuccess={onRefresh}
      />

      {/* Completed Tasks Dialog */}
      <TasksDialog
        open={completedDialogOpen}
        onOpenChange={setCompletedDialogOpen}
        onTaskUpdated={onRefresh}
        title={t("dashboard", "completedTodayTasks")}
        fetchTasks={async () => {
          // 调用API获取所有任务（包括done状态）
          const allTasks = await fetchAllTasks();
          // 过滤今日完成的任务
          return allTasks.filter(
            (t) =>
              t.status === "done" &&
              t.done_date &&
              isSameDay(new Date(t.done_date), new Date())
          );
        }}
      />

      {/* 3. Resources Area */}
      <section className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
        <div className="flex items-center gap-2 text-foreground border-b pb-3">
          <LayoutGrid className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">{t("dashboard", "resources")}</h2>
          <Badge
            variant="secondary"
            className="ml-2 font-normal text-xs bg-muted text-muted-foreground hover:bg-muted"
          >
            {unlinkedResources.length} Inbox
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {unlinkedResources.map((res) => (
            <ResourceCard
              key={res.resource_id}
              resource={res}
              tasks={activeTasks} // pass tasks for linking
              onClick={onSelectResource}
              progress={progressMap?.get(res.resource_id)}
              onLinkToTask={async (resourceId, taskId) => {
                await onLinkResource(resourceId, taskId);
              }}
              onDelete={async (id) => {
                if (confirm("Delete this resource?")) {
                  await softDeleteResource(id);
                  onRefresh();
                }
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
