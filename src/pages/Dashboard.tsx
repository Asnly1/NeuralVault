import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

import { Sparkles, CheckCircle2, Plus } from "lucide-react";

import { NodeRecord, IngestProgress, InputMode } from "../types";
import { TaskCard } from "../components/TaskCard";
import { ResourceCard } from "../components/ResourceCard";
import { QuickCapture } from "../components/QuickCapture";
import { TaskEditCard } from "../components/TaskEditCard";
import { TasksDialog } from "../components/TasksDialog";
import { TemporaryChatPanel } from "../components/TemporaryChatPanel";
import { softDeleteTask, softDeleteResource, fetchAllTasks } from "../api";
import { useLanguage } from "@/contexts/LanguageContext";
import { isSameDay } from "date-fns";
import { sortTasksForDashboard } from "@/lib/taskSort";

interface DashboardPageProps {
  tasks: NodeRecord[];
  resources: NodeRecord[];
  loading: boolean;
  error: string | null;
  onCapture: (content: string, filePath?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectTask: (task: NodeRecord) => void;
  onSelectResource: (resource: NodeRecord) => void;
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

  // 使用统一的排序函数
  const sortedTasks = useMemo(() => sortTasksForDashboard(tasks), [tasks]);

  const activeTasks = sortedTasks.filter((t) => t.task_status === "todo");
  const unlinkedResources = resources.filter(
    (r) => r.review_status === "unreviewed"
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
    <div className="h-full flex flex-col max-w-[900px] mx-auto w-full px-8 lg:px-16 py-10 lg:py-14 space-y-12 overflow-auto">
      {/* 1. Header & Quick Capture */}
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">
            {getGreeting()}, User
          </h1>
          <p className="text-muted-foreground/80 text-sm">
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
      <section className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              {t("dashboard", "tasks")}
            </h2>
            <span className="text-xs text-muted-foreground/50">
              {activeTasks.length} pending
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 查看今日已完成任务按钮 */}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setCompletedDialogOpen(true)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              {t("dashboard", "completedToday")}
            </Button>

            {/* 创建任务按钮 */}
            <Button
              size="sm"
              className="h-7 rounded px-2.5 text-xs shadow-none bg-foreground text-background hover:bg-foreground/90 transition-all"
              onClick={() => setCreateTaskOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("dashboard", "createTask")}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-16 text-muted-foreground/60 text-sm">
            Loading...
          </div>
        ) : error ? (
          <div className="text-destructive text-sm bg-destructive/10 p-3 rounded">
            {error}
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-muted-foreground/60 border border-dashed border-border/50 rounded-md bg-muted/10">
            <Sparkles className="h-6 w-6 mb-2 opacity-30" />
            <p className="text-sm">{t("dashboard", "noTasks")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeTasks.map((task) => (
              <TaskCard
                key={task.node_id}
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
              t.task_status === "done" &&
              t.done_date &&
              isSameDay(new Date(t.done_date), new Date())
          );
        }}
      />

      {/* 3. Resources Area */}
      <section className="space-y-4 pb-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
        <div className="flex items-center gap-3 pb-2">
          <h2 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
            {t("dashboard", "resources")}
          </h2>
          <span className="text-xs text-muted-foreground/50">
            {unlinkedResources.length} inbox
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {unlinkedResources.map((res) => (
            <ResourceCard
              key={res.node_id}
              resource={res}
              tasks={activeTasks} // pass tasks for linking
              onClick={onSelectResource}
              progress={progressMap?.get(res.node_id)}
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
