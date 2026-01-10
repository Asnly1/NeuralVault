import { apiCall, apiCallVoid } from "./client";
import { dashboardSchema, type DashboardData, type ReadClipboardResponse } from "../types";

// ============================================
// Dashboard
// ============================================

export const fetchDashboardData = (): Promise<DashboardData> =>
  apiCall("get_dashboard", undefined, dashboardSchema);

// ============================================
// HUD
// ============================================

export const toggleHUD = (): Promise<void> =>
  apiCallVoid("toggle_hud");

export const hideHUD = (): Promise<void> =>
  apiCallVoid("hide_hud");

// ============================================
// Clipboard
// ============================================

export const readClipboard = (): Promise<ReadClipboardResponse> =>
  apiCall("read_clipboard");

// ============================================
// File System
// ============================================

export const getAssetsPath = (): Promise<string> =>
  apiCall("get_assets_path");
