import { apiCall, apiCallVoid, apiCallArray } from "./client";
import { nodeRecordSchema, type NodeRecord } from "../types";
import type { CreateTaskRequest, CreateTaskResponse } from "../types";

// ============================================
// Task CRUD 操作
// ============================================

export const createTask = (request: CreateTaskRequest): Promise<CreateTaskResponse> =>
  apiCall("create_task", { payload: request });

export const softDeleteTask = (nodeId: number): Promise<void> =>
  apiCallVoid("soft_delete_task_command", { nodeId });

export const hardDeleteTask = (nodeId: number): Promise<void> =>
  apiCallVoid("hard_delete_task_command", { nodeId });

// ============================================
// Task 状态操作
// ============================================

export const markTaskAsDone = (nodeId: number): Promise<void> =>
  apiCallVoid("mark_task_as_done_command", { nodeId });

export const markTaskAsTodo = (nodeId: number): Promise<void> =>
  apiCallVoid("mark_task_as_todo_command", { nodeId });

export const markTaskAsCancelled = (nodeId: number): Promise<void> =>
  apiCallVoid("mark_task_as_cancelled_command", { nodeId });

// ============================================
// Task 字段更新
// ============================================

export const updateTaskPriority = (nodeId: number, priority: string): Promise<void> =>
  apiCallVoid("update_task_priority_command", { nodeId, priority });

export const updateTaskDueDate = (nodeId: number, dueDate: string | null): Promise<void> =>
  apiCallVoid("update_task_due_date_command", { nodeId, dueDate });

export const updateTaskTitle = (nodeId: number, title: string): Promise<void> =>
  apiCallVoid("update_task_title_command", { nodeId, title });

export const updateTaskDescription = (nodeId: number, description: string | null): Promise<void> =>
  apiCallVoid("update_task_description_command", { nodeId, description });

export const updateTaskSummary = (nodeId: number, summary: string | null): Promise<void> =>
  apiCallVoid("update_task_summary_command", { nodeId, summary });

// ============================================
// Task 查询
// ============================================

export const fetchTasksByDate = (date: string): Promise<NodeRecord[]> =>
  apiCallArray("get_tasks_by_date", nodeRecordSchema, { date });

export const fetchAllTasks = (): Promise<NodeRecord[]> =>
  apiCallArray("get_all_tasks", nodeRecordSchema);

export const fetchActiveTasks = (): Promise<NodeRecord[]> =>
  apiCallArray("get_active_tasks", nodeRecordSchema);
