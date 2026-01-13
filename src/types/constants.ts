import type { TaskPriority, ResourceSubtype, NodeType } from "./node";
import type { AIProvider, ProviderInfo } from "./chat";

// ============================================
// 页面与导航
// ============================================

export type PageType = "dashboard" | "workspace" | "warehouse" | "calendar" | "settings";

export const navItems: { key: PageType; icon: string; label: string }[] = [
  { key: "dashboard", icon: "◈", label: "看板" },
  { key: "warehouse", icon: "📦", label: "仓库" },
  { key: "workspace", icon: "⬡", label: "工作台" },
  { key: "calendar", icon: "📅", label: "日历" },
  { key: "settings", icon: "⚙", label: "设置" },
];

// ============================================
// 优先级配置
// ============================================

export const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: "高", color: "var(--priority-high)" },
  medium: { label: "中", color: "var(--priority-medium)" },
  low: { label: "低", color: "var(--priority-low)" },
};

// ============================================
// 图标映射
// ============================================

export const resourceSubtypeIcons: Record<ResourceSubtype, string> = {
  text: "📄",
  image: "🖼️",
  pdf: "📕",
  url: "🔗",
  epub: "📖",
  other: "📎",
};

export const nodeTypeIcons: Record<NodeType, string> = {
  topic: "🏷️",
  task: "☑️",
  resource: "📄",
};

// ============================================
// AI Provider 配置
// ============================================

export const AI_PROVIDER_INFO: Record<AIProvider, ProviderInfo> = {
  openai: {
    name: "ChatGPT",
    icon: "openai.svg",
    defaultBaseUrl: null,
    models: [{ id: "gpt-5.2-2025-12-11", name: "GPT-5.2" }],
  },
  anthropic: {
    name: "Claude",
    icon: "claude-color.svg",
    defaultBaseUrl: null,
    models: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
    ],
  },
  gemini: {
    name: "Gemini",
    icon: "gemini-color.svg",
    defaultBaseUrl: null,
    models: [
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        thinkingConfig: { supported: ["minimal", "low", "medium", "high"], default: "low" },
      },
      {
        id: "gemini-3-pro-preview",
        name: "Gemini 3 Pro",
        thinkingConfig: { supported: ["low", "high"], default: "low" },
      },
    ],
  },
  grok: {
    name: "Grok",
    icon: "grok.svg",
    defaultBaseUrl: null,
    models: [
      { id: "grok-4-1-fast-reasoning", name: "Grok 4.1 Reasoning" },
      { id: "grok-4-1-fast-non-reasoning", name: "Grok 4.1 Non-Reasoning" },
    ],
  },
  deepseek: {
    name: "Deepseek",
    icon: "deepseek-color.svg",
    defaultBaseUrl: "https://api.deepseek.com",
    models: [
      { id: "deepseek-chat", name: "Deepseek Chat" },
      { id: "deepseek-reasoner", name: "Deepseek Reasoner" },
    ],
  },
  qwen: {
    name: "Qwen",
    icon: "qwen-color.svg",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      { id: "qwen3-max-preview", name: "Qwen 3 Max" },
      { id: "qwen-plus", name: "Qwen 3 Plus" },
    ],
  },
};

// ============================================
// 输入模式
// ============================================

export type InputMode = "capture" | "chat";
