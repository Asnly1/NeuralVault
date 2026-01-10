import "./App.css";

import { Sidebar } from "./components";
import { DashboardPage, WorkspacePage, WarehousePage, CalendarPage, SettingsPage } from "./pages";
import {
  useTheme,
  useSidebar,
  useDashboardData,
  useAppNavigation,
  usePythonStatus,
  useIngestProgress,
} from "./hooks";

function App() {
  // App-level hooks
  const { theme, setTheme } = useTheme();
  const sidebar = useSidebar();
  const dashboard = useDashboardData();
  const nav = useAppNavigation();
  const python = usePythonStatus();
  const { progressMap } = useIngestProgress();

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        currentPage={nav.currentPage}
        onNavigate={nav.setCurrentPage}
        isCollapsed={sidebar.isCollapsed}
        width={sidebar.width}
        onToggleCollapse={sidebar.toggleCollapse}
        onWidthChange={sidebar.setWidth}
        onSelectNode={nav.selectNode}
      />

      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Python 后端错误提示 */}
        {python.error && (
          <div className="bg-red-500/90 text-white px-4 py-2 flex items-center justify-between text-sm">
            <span>⚠️ AI 功能暂不可用: {python.error}</span>
            <button
              onClick={python.dismissError}
              className="ml-4 hover:bg-red-600/50 px-2 py-1 rounded"
            >
              ✕
            </button>
          </div>
        )}

        {nav.currentPage === "dashboard" && (
          <DashboardPage
            tasks={dashboard.tasks}
            resources={dashboard.resources}
            loading={dashboard.loading}
            error={dashboard.error}
            onCapture={dashboard.handleCapture}
            onRefresh={dashboard.reloadData}
            onSelectTask={nav.selectTask}
            onSelectResource={nav.selectResource}
            onLinkResource={dashboard.handleLinkResource}
            progressMap={progressMap}
          />
        )}

        {nav.currentPage === "warehouse" && (
          <WarehousePage onSelectNode={nav.selectNode} />
        )}

        {nav.currentPage === "workspace" && (
          <WorkspacePage
            selectedTask={nav.selectedTask}
            selectedResource={nav.selectedResource}
            onBack={nav.backToDashboard}
            onNavigateToSettings={() => nav.setCurrentPage("settings")}
          />
        )}

        {nav.currentPage === "calendar" && (
          <CalendarPage
            tasks={dashboard.allTasks}
            onRefresh={dashboard.reloadData}
          />
        )}

        {nav.currentPage === "settings" && (
          <SettingsPage theme={theme} onThemeChange={setTheme} />
        )}
      </main>
    </div>
  );
}

export default App;
