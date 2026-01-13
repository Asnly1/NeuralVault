import "./App.css";

import { useState, useCallback } from "react";
import { Sidebar, GlobalSearchDialog } from "./components";
import { DashboardPage, WorkspacePage, WarehousePage, CalendarPage, SettingsPage } from "./pages";
import {
  useTheme,
  useSidebar,
  useDashboardData,
  useAppNavigation,
  useIngestProgress,
  useGlobalSearch,
} from "./hooks";
import { getResourceById } from "./api";

function App() {
  // App-level hooks
  const { theme, setTheme } = useTheme();
  const sidebar = useSidebar();
  const dashboard = useDashboardData();
  const nav = useAppNavigation();
  const { progressMap } = useIngestProgress();
  const globalSearch = useGlobalSearch();

  // Sidebar 刷新触发器（用于收藏状态变更后刷新）
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const refreshSidebar = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  // 处理搜索结果选择
  const handleSearchSelect = async (node: { node_id: number; node_type: string }) => {
    // 如果节点信息不完整，先获取完整信息
    if (!("title" in node)) {
      try {
        const fullNode = await getResourceById(node.node_id);
        nav.selectNode(fullNode);
      } catch (err) {
        console.error("Failed to fetch node:", err);
      }
    } else {
      nav.selectNode(node as any);
    }
  };

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
        refreshKey={sidebarRefreshKey}
      />

      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
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
          <WarehousePage
            onSelectNode={nav.selectNode}
            onPinnedChange={refreshSidebar}
          />
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

      {/* 全局搜索对话框 - Cmd/Ctrl+K 唤醒 */}
      <GlobalSearchDialog
        open={globalSearch.isSearchOpen}
        onOpenChange={(open) => (open ? globalSearch.openSearch() : globalSearch.closeSearch())}
        onSelectResult={handleSearchSelect}
      />
    </div>
  );
}

export default App;

