import { invoke } from "@tauri-apps/api/core";
import {
  dashboardSchema,
  DashboardData,
  CreateTaskRequest,
  CreateTaskResponse,
  CaptureRequest,
  CaptureResponse,
  SeedResponse,
  LinkResourceRequest,
  LinkResourceResponse,
  TaskResourcesResponse,
  ReadClipboardResponse,
  resourceSchema,
  Task,
  taskSchema,
} from "../types";
import { z } from "zod";

// ============================================
// Dashboard API
// ============================================

/**
 * 获取 Dashboard 数据（任务和资源）
 *
 * Promise: 代表这是一个异步操作。调用这个函数时，你拿不到现成的数据，只能拿到一个"取货凭证"
 * 你需要用 await 等待它完成，或者用 .then() 来处理结果
 * <DashboardData>: 它告诉 TypeScript："这个承诺兑现后，包在里面的数据绝对是符合 DashboardData 结构的对象。"
 */
export const fetchDashboardData = async (): Promise<DashboardData> => {
  const raw = await invoke("get_dashboard");
  // 1. 自动转换： 把日期转换成标准的 JavaScript Date 对象
  // 2. 数据校验： 确保返回的数据完全符合 dashboardSchema 的结构要求
  // 3. 返回结果： 返回一个 Promise，里面包含符合要求的 DashboardData 对象
  return dashboardSchema.parse(raw);
};

// ============================================
// Task API
// ============================================

/**
 * 创建新任务
 * @param request - 创建任务请求参数
 */
export const createTask = async (
  request: CreateTaskRequest
): Promise<CreateTaskResponse> => {
  return await invoke("create_task", { payload: request });
};

/**
 * 删除任务（软删除）
 * @param taskId - 任务 ID
 */
export const softDeleteTask = async (taskId: number): Promise<void> => {
  return await invoke("soft_delete_task_command", { taskId });
};

/**
 * 硬删除任务（物理删除数据库记录和级联数据）
 * @param taskId - 任务 ID
 */
export const hardDeleteTask = async (taskId: number): Promise<void> => {
  return await invoke("hard_delete_task_command", { taskId });
};

/**
 * 将任务状态从 'todo' 转换为 'done'
 * @param taskId - 任务 ID
 */
export const markTaskAsDone = async (taskId: number): Promise<void> => {
  return await invoke("mark_task_as_done_command", { taskId });
};

/**
 * 将任务状态从 'done' 转换为 'todo'
 * @param taskId - 任务 ID
 */
export const markTaskAsTodo = async (taskId: number): Promise<void> => {
  return await invoke("mark_task_as_todo_command", { taskId });
};

/**
 * 更新任务优先级
 * @param taskId - 任务 ID
 * @param priority - 优先级 ('high' | 'medium' | 'low')
 */
export const updateTaskPriority = async (
  taskId: number,
  priority: string
): Promise<void> => {
  return await invoke("update_task_priority_command", { taskId, priority });
};

/**
 * 更新任务的截止日期
 * @param taskId - 任务 ID
 * @param dueDate - 截止日期 (YYYY-MM-DD HH:mm:ss 格式，或 null 清除)
 */
export const updateTaskDueDate = async (
  taskId: number,
  dueDate: string | null
): Promise<void> => {
  return await invoke("update_task_due_date_command", { taskId, dueDate });
};

/**
 * 更新任务标题
 * @param taskId - 任务 ID
 * @param title - 新标题
 */
export const updateTaskTitle = async (
  taskId: number,
  title: string
): Promise<void> => {
  return await invoke("update_task_title_command", { taskId, title });
};

/**
 * 更新任务描述
 * @param taskId - 任务 ID
 * @param description - 新描述 (或 null 清除)
 */
export const updateTaskDescription = async (
  taskId: number,
  description: string | null
): Promise<void> => {
  return await invoke("update_task_description_command", {
    taskId,
    description,
  });
};

/**
 * 获取今天已完成的任务
 */
export const fetchTodayCompletedTasks = async (): Promise<Task[]> => {
  const raw = await invoke("get_today_completed_tasks");
  return z.array(taskSchema).parse(raw);
};

// ============================================
// Resource API
// ============================================

/**
 * 快速捕获资源
 * @param request - 捕获请求参数
 */
export const quickCapture = async (
  request: CaptureRequest
): Promise<CaptureResponse> => {
  return await invoke("capture_resource", { payload: request });
};

/**
 * 将资源关联到任务
 * @param request - 关联请求参数
 */
export const linkResource = async (
  request: LinkResourceRequest
): Promise<LinkResourceResponse> => {
  return await invoke("link_resource", { payload: request });
};

/**
 * 取消资源与任务的关联
 * @param taskId - 任务 ID
 * @param resourceId - 资源 ID
 */
export const unlinkResource = async (
  taskId: number,
  resourceId: number
): Promise<LinkResourceResponse> => {
  return await invoke("unlink_resource", { taskId, resourceId });
};

/**
 * 获取任务关联的资源列表
 * @param taskId - 任务 ID
 */
export const fetchTaskResources = async (
  taskId: number
): Promise<TaskResourcesResponse> => {
  const raw = await invoke("get_task_resources", { taskId });
  // 校验并转换资源数据
  const parsed = z
    .object({
      resources: z.array(resourceSchema).default([]),
    })
    .parse(raw);
  return parsed;
};

/**
 * 删除资源（软删除）
 * @param resourceId - 资源 ID
 */
export const softDeleteResource = async (resourceId: number): Promise<void> => {
  return await invoke("soft_delete_resource_command", { resourceId });
};

/**
 * 硬删除资源（物理删除数据库记录、级联数据和文件）
 * @param resourceId - 资源 ID
 */
export const hardDeleteResource = async (resourceId: number): Promise<void> => {
  return await invoke("hard_delete_resource_command", { resourceId });
};

// ============================================
// Demo Data API
// ============================================

/**
 * 生成演示数据
 */
export const seedDemoData = async (): Promise<SeedResponse> => {
  return await invoke("seed_demo_data");
};

// ============================================
// HUD API
// ============================================

/**
 * 切换 HUD 窗口显示/隐藏
 */
export const toggleHUD = async (): Promise<void> => {
  return await invoke("toggle_hud");
};

/**
 * 隐藏 HUD 窗口
 */
export const hideHUD = async (): Promise<void> => {
  return await invoke("hide_hud");
};

// ============================================
// Clipboard API
// ============================================

/**
 * 读取系统剪贴板内容
 * 支持图片、文件、HTML、纯文本
 */
export const readClipboard = async (): Promise<ReadClipboardResponse> => {
  return await invoke("read_clipboard");
};

// ============================================
// File System API
// ============================================

/**
 * 获取 assets 目录的完整路径
 */
export const getAssetsPath = async (): Promise<string> => {
  return await invoke("get_assets_path");
};
