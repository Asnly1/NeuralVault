import { useState, useCallback } from "react";
import { useKeyboard } from "./useKeyboard";

interface UseGlobalSearchReturn {
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
}

/**
 * 全局搜索状态管理 hook
 *
 * 提供 Cmd/Ctrl+K 快捷键唤醒搜索
 */
export function useGlobalSearch(): UseGlobalSearchReturn {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);
  const toggleSearch = useCallback(() => setIsSearchOpen((prev) => !prev), []);

  // Cmd/Ctrl+K 快捷键
  useKeyboard([
    {
      key: "k",
      ctrl: true,
      handler: () => toggleSearch(),
      preventDefault: true,
    },
  ]);

  return { isSearchOpen, openSearch, closeSearch, toggleSearch };
}
