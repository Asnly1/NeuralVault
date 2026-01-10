import { useState, useCallback } from "react";

interface UseSidebarReturn {
  isCollapsed: boolean;
  width: number;
  toggleCollapse: () => void;
  setWidth: (width: number) => void;
}

const STORAGE_KEYS = {
  collapsed: "neuralvault_sidebar_collapsed",
  width: "neuralvault_sidebar_width",
};

const DEFAULT_WIDTH = 240;

/**
 * Sidebar 状态管理 hook
 *
 * 管理 sidebar 的折叠状态和宽度，自动持久化到 localStorage
 */
export function useSidebar(): UseSidebarReturn {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.collapsed);
    return saved ? JSON.parse(saved) : false;
  });

  const [width, setWidthState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.width);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem(STORAGE_KEYS.collapsed, JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  const setWidth = useCallback((newWidth: number) => {
    setWidthState(newWidth);
    localStorage.setItem(STORAGE_KEYS.width, newWidth.toString());
  }, []);

  return {
    isCollapsed,
    width,
    toggleCollapse,
    setWidth,
  };
}
