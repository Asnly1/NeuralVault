import { useEffect, useState, useCallback } from "react";
import { z } from "zod";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

import { Task, Resource, PageType } from "./types";
import {
  fetchDashboardData,
  quickCapture,
  seedDemoData,
  linkResource,
  fetchAllTasks,
} from "./api";
import { useWebSocket } from "./hooks/useWebSocket";
import { Sidebar } from "./components";
import { DashboardPage, WorkspacePage, CalendarPage, SettingsPage } from "./pages";

// 根据文件扩展名推断文件类型
function getFileTypeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) {
    return "image";
  }
  if (ext === "pdf") {
    return "pdf";
  }
  if (ext === "epub") {
    return "epub";
  }
  if (
    ["txt", "md", "json", "csv", "xml", "html", "css", "js", "ts"].includes(ext)
  ) {
    return "text";
  }
  return "other";
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>("dashboard");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]); // For calendar view (includes done tasks)
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [seeding, setSeeding] = useState(false);
  
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

  // WebSocket progress for resource processing
  const { progressMap } = useWebSocket();

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

  const reloadData = useCallback(async () => {
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
        setError("加载数据失败");
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

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    setError(null);
    try {
      await seedDemoData();
      await reloadData();
    } catch (err) {
      console.error(err);
      setError("生成演示数据失败");
    } finally {
      setSeeding(false);
    }
  }, [reloadData]);

  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTask(task);
    setSelectedResource(null); // 清除资源选择
    setCurrentPage("workspace");
  }, []);

  const handleSelectResource = useCallback((resource: Resource) => {
    setSelectedResource(resource);
    setSelectedTask(null); // 清除任务选择
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
        await linkResource({ resource_id: resourceId, task_id: taskId });
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
    let ignore = false;

    const initLoad = async () => {
      setLoading(true);
      try {
        const data = await fetchDashboardData();
        if (!ignore) {
          setTasks(data.tasks);
          setResources(data.resources);
          // Also fetch all tasks for calendar
          const all = await fetchAllTasks();
          setAllTasks(all);
        }
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError("初始化数据失败");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    initLoad();
    return () => {
      ignore = true;
    };
  }, []);

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
            loading={loading || seeding}
            error={error}
            onCapture={handleCapture}
            onSeed={handleSeed}
            onRefresh={reloadData}
            onSelectTask={handleSelectTask}
            onSelectResource={handleSelectResource}
            onLinkResource={handleLinkResource}
            progressMap={progressMap}
          />
        )}

        {currentPage === "workspace" && (
          <WorkspacePage
            selectedTask={selectedTask}
            selectedResource={selectedResource}
            onBack={handleBackToDashboard}
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
