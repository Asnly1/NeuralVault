import { useEffect, useState, useCallback } from "react";
import { z } from "zod";
import "./App.css";

import { Task, Resource, PageType } from "./types";
import { fetchDashboardData, createTask, seedDemoData } from "./api";
import { Sidebar } from "./components";
import { DashboardPage, WorkspacePage, SettingsPage } from "./pages";

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
  const handleCreateTask = useCallback(
    async (title: string, description: string) => {
      setError(null);
      try {
        await createTask({
          title,
          description: description || undefined,
          status: "inbox",
          priority: "medium",
        });
        await reloadData();
      } catch (err) {
        console.error(err);
        setError("创建任务失败");
      }
    },
    // React 要求：凡是在 Hook 内部（也就是 { ... } 里面）使用到的、来自组件作用域的变量或函数，都必须包含在依赖数组中。
    // handleCreateTask 函数内部使用了 reloadData 函数，所以 reloadData 必须出现在依赖数组中。
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
    <div className="app-container">
      {/* Sidebar: 是一个函数，接收一个参数（通常称为 props，这里被解构成了 { currentPage, onNavigate }） */}
      {/* onNavigate: 一个接受PageType并返回void的函数吗 */}
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="main-content">
        {currentPage === "dashboard" && (
          <DashboardPage
            tasks={tasks}
            resources={resources}
            loading={loading || seeding}
            error={error}
            onCreateTask={handleCreateTask}
            onSeed={handleSeed}
            onRefresh={reloadData}
            onSelectTask={handleSelectTask}
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
