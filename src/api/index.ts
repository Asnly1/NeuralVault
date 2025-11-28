import { invoke } from "@tauri-apps/api/core";
import {
  dashboardSchema,
  DashboardData,
  CreateTaskRequest,
  CreateTaskResponse,
  CaptureRequest,
  CaptureResponse,
  SeedResponse,
} from "../types";

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
  return await invoke("quick_capture", { payload: request });
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
