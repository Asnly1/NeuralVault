import { useEffect, useState, useCallback } from "react";
import { z } from "zod";
import "./App.css";

import { Task, Resource, PageType } from "./types";
import {
  fetchDashboardData,
  quickCapture,
  seedDemoData,
  linkResource,
} from "./api";
import { Sidebar } from "./components";
import { DashboardPage, WorkspacePage, SettingsPage } from "./pages";

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
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [seeding, setSeeding] = useState(false);

  const reloadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardData();
      setTasks(data.tasks);
      setResources(data.resources);
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
    setCurrentPage("workspace");
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setSelectedTask(null);
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

  useEffect(() => {
    let ignore = false;

    const initLoad = async () => {
      setLoading(true);
      try {
        const data = await fetchDashboardData();
        if (!ignore) {
          setTasks(data.tasks);
          setResources(data.resources);
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
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="flex-1 min-w-0 overflow-hidden">
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
            onLinkResource={handleLinkResource}
          />
        )}

        {currentPage === "workspace" && (
          <WorkspacePage
            selectedTask={selectedTask}
            onBack={handleBackToDashboard}
          />
        )}

        {currentPage === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

export default App;
