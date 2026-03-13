import { useState, useMemo } from "react";
import { isSameDay, startOfDay, format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { NodeRecord, priorityConfig } from "../types";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { TasksDialog } from "@/components/TasksDialog";
import { markTaskAsDone, markTaskAsTodo, fetchTasksByDate } from "@/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { sortTasksForCalendar } from "@/lib/taskSort";

interface CalendarPageProps {
  tasks: NodeRecord[];
  onRefresh: () => void;
}

export function CalendarPage({ tasks, onRefresh }: CalendarPageProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const { t } = useLanguage();

  // Group tasks by due date for efficient lookup
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, NodeRecord[]>();
    
    tasks.forEach((task) => {
      if (task.due_date) {
        const dateKey = format(startOfDay(task.due_date), "yyyy-MM-dd");
        if (!grouped.has(dateKey)) {
          grouped.set(dateKey, []);
        }
        grouped.get(dateKey)!.push(task);
      }
    });
    
    return grouped;
  }, [tasks]);

  // Get tasks for a specific date
  const getTasksForDate = (date: Date): NodeRecord[] => {
    const dateKey = format(startOfDay(date), "yyyy-MM-dd");
    return tasksByDate.get(dateKey) || [];
  };

  // Get calendar days for current month
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { locale: zhCN });
    const calendarEnd = endOfWeek(monthEnd, { locale: zhCN });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Navigate to previous month
  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  // Navigate to next month
  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  // Toggle task status
  const handleToggleTask = async (task: NodeRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (task.task_status === "todo") {
        await markTaskAsDone(task.node_id);
      } else {
        await markTaskAsTodo(task.node_id);
      }
      onRefresh();
    } catch (error) {
      console.error("Failed to toggle task:", error);
    }
  };

  // Open dialog with all tasks for a date
  const handleShowAllTasks = (date: Date, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate(date);
    setDialogOpen(true);
  };

  // Check if date is in current month
  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  // Check if date is today
  const isToday = (date: Date) => {
    return isSameDay(date, new Date());
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">
            {format(currentMonth, "yyyy年MM月", { locale: zhCN })}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={previousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="h-full grid grid-cols-7 gap-2">
          {/* Weekday headers */}
          {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => (
            <div key={day} className="text-center font-medium text-sm text-muted-foreground pb-2">
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {calendarDays.map((day, index) => {
            const dayTasks = getTasksForDate(day);
            const sortedTasks = sortTasksForCalendar(dayTasks);
            const hasMoreTasks = sortedTasks.length > 2;
            const displayTasks = sortedTasks.slice(0, 2);
            const isCurrentMonthDay = isCurrentMonth(day);
            const isTodayDay = isToday(day);

            return (
              <div
                key={index}
                className={`
                  border rounded-lg p-1.5 min-h-[120px] flex flex-col
                  ${!isCurrentMonthDay ? "bg-muted/30" : "bg-card"}
                  ${isTodayDay ? "border-primary border-2" : ""}
                `}
              >
                {/* Date number */}
                <div className={`
                  text-sm font-medium mb-1
                  ${!isCurrentMonthDay ? "text-muted-foreground" : ""}
                  ${isTodayDay ? "text-primary font-bold" : ""}
                `}>
                  {format(day, "d")}
                </div>

                {/* Task list */}
                <div className="flex-1 space-y-1 overflow-hidden">
                  {displayTasks.map((task) => (
                    <div
                      key={task.node_id}
                      onClick={(e) => handleToggleTask(task, e)}
                      className="text-xs p-1 rounded cursor-pointer hover:bg-accent/50 transition-colors truncate"
                      style={{
                        backgroundColor: task.priority ? `${priorityConfig[task.priority].color}15` : undefined,
                        borderLeft: task.priority ? `2px solid ${priorityConfig[task.priority].color}` : undefined,
                      }}
                    >
                      <div className={`flex items-center gap-1 ${task.task_status !== "todo" ? "line-through opacity-60" : ""}`}>
                        <div
                          className={`w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0
                            ${task.task_status !== "todo" ? "bg-primary border-primary" : "border-muted-foreground"}
                          `}
                        >
                          {task.task_status !== "todo" && (
                            <svg
                              className="w-2 h-2 text-primary-foreground"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="3"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="truncate">{task.title || "无标题"}</span>
                      </div>
                    </div>
                  ))}

                  {/* Show more button */}
                  {hasMoreTasks && (
                    <button
                      onClick={(e) => handleShowAllTasks(day, e)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 p-0.5 rounded hover:bg-accent/50 w-full transition-colors mt-0.5"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                      <span>{t("common", "moreTasks").replace("{count}", String(sortedTasks.length - 2))}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tasks dialog for selected date */}
      <TasksDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onTaskUpdated={onRefresh}
        title={
          selectedDate
            ? format(selectedDate, "yyyy年MM月dd日 EEEE", { locale: zhCN })
            : ""
        }
        fetchTasks={async () => {
          if (!selectedDate) return [];
          const dateStr = format(selectedDate, "yyyy-MM-dd");
          return await fetchTasksByDate(dateStr);
        }}
      />
    </div>
  );
}
