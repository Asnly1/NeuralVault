import { useEffect, useState, useCallback } from "react";
import { z } from "zod";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

import { PageType, NodeRecord } from "./types";
import { getFileTypeFromPath } from "./lib/utils";
import {
  fetchDashboardData,
  quickCapture,
  linkNodes,
  fetchAllTasks,
} from "./api";
import { useIngestProgress } from "./hooks/useIngestProgress";
import { Sidebar } from "./components";
import { DashboardPage, WorkspacePage, WarehousePage, CalendarPage, SettingsPage } from "./pages";

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>("dashboard");
  const [tasks, setTasks] = useState<NodeRecord[]>([]);
  const [allTasks, setAllTasks] = useState<NodeRecord[]>([]); // For calendar view (includes done tasks)
  const [resources, setResources] = useState<NodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<NodeRecord | null>(null);
  const [selectedResource, setSelectedResource] = useState<NodeRecord | null>(null);
  
  // Theme state
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("neuralvault_sidebar_collapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("neuralvault_sidebar_width");
    return saved ? parseInt(saved, 10) : 240;
  });

  // Ingest progress for resource processing (via Tauri Events)
  const { progressMap } = useIngestProgress();

  // Python backend status
  const [pythonError, setPythonError] = useState<string | null>(null);

  // Listen for Python backend status events
  useEffect(() => {
    const unlisten = listen<{ status: string; message?: string }>("python-status", (event) => {
      if (event.payload.status === "error") {
        setPythonError(event.payload.message || "Python 后端启动失败");
      } else if (event.payload.status === "ready") {
        setPythonError(null);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Apply theme class to document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);

      // Listen for system theme changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        const newSystemTheme = e.matches ? "dark" : "light";
        root.classList.remove("light", "dark");
        root.classList.add(newSystemTheme);
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  const reloadData = useCallback(async (fallbackMessage = "加载数据失败") => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardData();
      setTasks(data.tasks);
      setResources(data.resources);
      // Also fetch all tasks (including done) for calendar
      const all = await fetchAllTasks();
      setAllTasks(all);
    } catch (err) {
      console.error(err);
      if (err instanceof z.ZodError) {
        setError("数据格式校验失败，请联系开发者");
      } else {
        setError(fallbackMessage);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // useCallback: React 会把这个函数存起来。只要依赖数组（第二个参数）没变，React 就会返回上一次生成的那个函数引用。
  // handleCapture: 处理快速捕获，将内容或文件保存为资源
  // content: 用户输入的文本内容
  // filePath: 通过 Tauri dialog 选择的文件路径（Rust 会直接读取）
  const handleCapture = useCallback(
    async (content: string, filePath?: string) => {
      setError(null);
      try {
        if (filePath) {
          // 有文件路径：让 Rust 后端直接读取文件
          // Rust 会根据 file_path 读取文件内容，支持图片/PDF 等二进制文件
          await quickCapture({
            file_path: filePath,
            file_type: getFileTypeFromPath(filePath),
            // 如果用户同时输入了文本，也一起传递
            content: content || undefined,
          });
        } else if (content) {
          // 纯文本内容
          await quickCapture({
            content,
            file_type: "text",
          });
        }
        await reloadData();
      } catch (err) {
        console.error(err);
        setError("捕获失败");
      }
    },
    // React 要求：凡是在 Hook 内部（也就是 { ... } 里面）使用到的、来自组件作用域的变量或函数，都必须包含在依赖数组中。
    // handleCapture 函数内部使用了 reloadData 函数，所以 reloadData 必须出现在依赖数组中。
    [reloadData]
  );

  const handleSelectTask = useCallback((task: NodeRecord) => {
    setSelectedTask(task);
    setSelectedResource(null); // 清除资源选择
    setCurrentPage("workspace");
  }, []);

  const handleSelectResource = useCallback((resource: NodeRecord) => {
    setSelectedResource(resource);
    setSelectedTask(null); // 清除任务选择
    setCurrentPage("workspace");
  }, []);

  // 处理从 Sidebar 或 Warehouse 选择节点
  const handleSelectNode = useCallback((node: NodeRecord) => {
    if (node.node_type === "task") {
      setSelectedTask(node);
      setSelectedResource(null);
    } else if (node.node_type === "resource") {
      setSelectedResource(node);
      setSelectedTask(null);
    } else if (node.node_type === "topic") {
      // Topic 暂时作为 Resource 处理
      setSelectedResource(node);
      setSelectedTask(null);
    }
    setCurrentPage("workspace");
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setSelectedTask(null);
    setSelectedResource(null);
    setCurrentPage("dashboard");
  }, []);

  // 关联资源到任务
  const handleLinkResource = useCallback(
    async (resourceId: number, taskId: number) => {
      setError(null);
      try {
        await linkNodes(taskId, resourceId, "contains");
        // 关联成功后刷新数据，资源会从未分类列表中消失
        await reloadData();
      } catch (err) {
        console.error(err);
        setError("关联资源失败");
      }
    },
    [reloadData]
  );

  // Handle sidebar toggle
  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem("neuralvault_sidebar_collapsed", JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  // Handle sidebar width change
  const handleSidebarWidthChange = useCallback((width: number) => {
    setSidebarWidth(width);
    localStorage.setItem("neuralvault_sidebar_width", width.toString());
  }, []);

  useEffect(() => {
    reloadData("初始化数据失败");
  }, [reloadData]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar: 是一个函数，接收一个参数（通常称为 props，这里被解构成了 { currentPage, onNavigate }） */}
      {/* onNavigate: 一个接受PageType并返回void的函数吗 */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        isCollapsed={sidebarCollapsed}
        width={sidebarWidth}
        onToggleCollapse={handleToggleSidebar}
        onWidthChange={handleSidebarWidthChange}
        onSelectNode={handleSelectNode}
      />

      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Python 后端错误提示 */}
        {pythonError && (
          <div className="bg-red-500/90 text-white px-4 py-2 flex items-center justify-between text-sm">
            <span>⚠️ AI 功能暂不可用: {pythonError}</span>
            <button 
              onClick={() => setPythonError(null)}
              className="ml-4 hover:bg-red-600/50 px-2 py-1 rounded"
            >
              ✕
            </button>
          </div>
        )}
        {currentPage === "dashboard" && (
          <DashboardPage
            tasks={tasks}
            resources={resources}
            loading={loading}
            error={error}
            onCapture={handleCapture}
            onRefresh={reloadData}
            onSelectTask={handleSelectTask}
            onSelectResource={handleSelectResource}
            onLinkResource={handleLinkResource}
            progressMap={progressMap}
          />
        )}

        {currentPage === "warehouse" && (
          <WarehousePage onSelectNode={handleSelectNode} />
        )}

        {currentPage === "workspace" && (
          <WorkspacePage
            selectedTask={selectedTask}
            selectedResource={selectedResource}
            onBack={handleBackToDashboard}
            onNavigateToSettings={() => setCurrentPage("settings")}
          />
        )}

        {currentPage === "calendar" && (
          <CalendarPage
            tasks={allTasks}
            onRefresh={reloadData}
          />
        )}

        {currentPage === "settings" && (
          <SettingsPage theme={theme} onThemeChange={setTheme} />
        )}
      </main>
    </div>
  );
}

export default App;
