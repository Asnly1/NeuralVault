import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  Sparkles,
  CheckCircle2,
  LayoutGrid,
  Plus
} from "lucide-react";

import { Task, Resource, TaskPriority } from "../types";
import { TaskCard } from "../components/TaskCard";
import { ResourceCard } from "../components/ResourceCard";
import { QuickCapture } from "../components/QuickCapture";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTask, deleteTask, deleteResource } from "../api";
import { useLanguage } from "@/contexts/LanguageContext";

interface DashboardPageProps {
  tasks: Task[];
  resources: Resource[];
  loading: boolean;
  error: string | null;
  onCapture: (content: string, filePath?: string) => Promise<void>;
  onSeed: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectTask: (task: Task) => void;
  onLinkResource: (resourceId: number, taskId: number) => Promise<void>;
}

export function DashboardPage({
  tasks,
  resources,
  loading,
  error,
  onCapture,
  onRefresh,
  onSelectTask,
  onLinkResource,
}: DashboardPageProps) {
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium");
  const { t } = useLanguage();

  // Smart Sort: Logic to sort tasks
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // 0. Done tasks at the bottom
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;

      // 1. Priority weight
      const pWeight = { high: 3, medium: 2, low: 1 };
      if (pWeight[a.priority] !== pWeight[b.priority]) {
        return pWeight[b.priority] - pWeight[a.priority];
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
  const unlinkedResources = resources.filter((r) => r.classification_status === "unclassified");

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      await createTask({
        title: newTaskTitle,
        priority: newTaskPriority,
      });
      setCreatingTask(false);
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      onRefresh();
    } catch (err) {
      console.error(err);
      alert("创建任务失败");
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("dashboard", "greetingMorning");
    if (hour < 18) return t("dashboard", "greeting");
    return t("dashboard", "greetingEvening");
  };

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
           <QuickCapture onCapture={onCapture} />
        </div>
      </section>

      {/* 2. Tasks Area */}
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2 text-foreground">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">{t("dashboard", "tasks")}</h2>
            <Badge variant="secondary" className="ml-2 font-normal text-xs bg-muted text-muted-foreground hover:bg-muted">
              {activeTasks.length} Pending
            </Badge>
          </div>
          
          <Dialog open={creatingTask} onOpenChange={setCreatingTask}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 rounded-full px-3 shadow-none bg-foreground text-background hover:bg-foreground/90 transition-all">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t("dashboard", "createTask")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("dashboard", "createTask")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Task Title</Label>
                  <Input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Task title..."
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={newTaskPriority}
                    onValueChange={(v: TaskPriority) => setNewTaskPriority(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreatingTask(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTask}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
             <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">Loading...</div>
        ): error ? (
           <div className="text-destructive text-sm bg-destructive/10 p-4 rounded-md">{error}</div>
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
                    await deleteTask(id);
                    onRefresh();
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* 3. Resources Area */}
      <section className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
         <div className="flex items-center gap-2 text-foreground border-b pb-3">
            <LayoutGrid className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">{t("dashboard", "resources")}</h2>
             <Badge variant="secondary" className="ml-2 font-normal text-xs bg-muted text-muted-foreground hover:bg-muted">
              {unlinkedResources.length} Inbox
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
             {unlinkedResources.map(res => (
                <ResourceCard 
                  key={res.resource_id}
                  resource={res}
                  tasks={activeTasks} // pass tasks for linking
                  onLinkToTask={async (resourceId, taskId) => {
                     await onLinkResource(resourceId, taskId);
                  }}
                  onDelete={async (id) => {
                    if (confirm("Delete this resource?")) {
                      await deleteResource(id);
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
