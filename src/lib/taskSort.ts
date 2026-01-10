import type { NodeRecord } from "@/types";

type PriorityWeight = Record<string, number>;

const DEFAULT_PRIORITY_WEIGHT: PriorityWeight = {
  high: 3,
  medium: 2,
  low: 1,
};

interface TaskSortOptions {
  /** 是否将已完成任务排到最后 */
  doneAtBottom?: boolean;
  /** 是否按优先级排序 */
  byPriority?: boolean;
  /** 是否按截止日期排序 */
  byDueDate?: boolean;
  /** 自定义优先级权重 */
  priorityWeight?: PriorityWeight;
}

/**
 * 通用任务排序函数
 *
 * @param tasks - 要排序的任务数组
 * @param options - 排序选项
 * @returns 排序后的新数组
 */
export function sortTasks(
  tasks: NodeRecord[],
  options: TaskSortOptions = {}
): NodeRecord[] {
  const {
    doneAtBottom = true,
    byPriority = false,
    byDueDate = false,
    priorityWeight = DEFAULT_PRIORITY_WEIGHT,
  } = options;

  return [...tasks].sort((a, b) => {
    // 1. 已完成任务排到最后
    if (doneAtBottom) {
      if (a.task_status === "done" && b.task_status !== "done") return 1;
      if (a.task_status !== "done" && b.task_status === "done") return -1;
    }

    // 2. 按优先级排序 (高优先级在前)
    if (byPriority) {
      const aPriority = a.priority ?? "medium";
      const bPriority = b.priority ?? "medium";
      const aWeight = priorityWeight[aPriority] ?? 2;
      const bWeight = priorityWeight[bPriority] ?? 2;
      if (aWeight !== bWeight) {
        return bWeight - aWeight;
      }
    }

    // 3. 按截止日期排序 (早的在前)
    if (byDueDate) {
      if (a.due_date && b.due_date) {
        return a.due_date.getTime() - b.due_date.getTime();
      }
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
    }

    return 0;
  });
}

/**
 * Dashboard 任务排序
 * 规则: done 在底部 → 优先级 → 截止日期
 */
export function sortTasksForDashboard(tasks: NodeRecord[]): NodeRecord[] {
  return sortTasks(tasks, {
    doneAtBottom: true,
    byPriority: true,
    byDueDate: true,
  });
}

/**
 * Calendar 任务排序
 * 规则: todo 在 done 前面
 */
export function sortTasksForCalendar(tasks: NodeRecord[]): NodeRecord[] {
  return sortTasks(tasks, {
    doneAtBottom: true,
    byPriority: false,
    byDueDate: false,
  });
}
