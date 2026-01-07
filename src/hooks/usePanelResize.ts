import { useState, useEffect, useCallback } from "react";

interface UsePanelResizeOptions {
  min: number;
  max: number;
  storageKey: string;
  initialWidth?: number;
  /** 拖拽方向：left 表示从左边缘拖拽，right 表示从右边缘拖拽 */
  direction?: "left" | "right";
}

interface UsePanelResizeReturn {
  /** 当前宽度（用于渲染） */
  width: number;
  /** 拖拽过程中的临时宽度 */
  tempWidth: number | null;
  /** 是否正在拖拽 */
  isResizing: boolean;
  /** 开始拖拽的事件处理器 */
  onMouseDown: (e: React.MouseEvent) => void;
  /** 计算后的当前宽度（tempWidth ?? width） */
  currentWidth: number;
}

/**
 * 可复用的面板拖拽调整 Hook
 * 
 * 封装了 mousedown/mousemove/mouseup 事件处理逻辑，支持 localStorage 持久化
 * 
 * @example
 * const leftPanel = usePanelResize({
 *   min: 150,
 *   max: 400,
 *   storageKey: "neuralvault_workspace_left_width",
 *   initialWidth: 256,
 *   direction: "right", // 从右边缘拖拽调整宽度
 * });
 * 
 * // 使用:
 * <aside style={{ width: leftPanel.currentWidth }}>
 *   <div onMouseDown={leftPanel.onMouseDown} />
 * </aside>
 */
export function usePanelResize({
  min,
  max,
  storageKey,
  initialWidth = 256,
  direction = "right",
}: UsePanelResizeOptions): UsePanelResizeReturn {
  // 从 localStorage 读取保存的宽度
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : initialWidth;
  });

  const [isResizing, setIsResizing] = useState(false);
  const [tempWidth, setTempWidth] = useState<number | null>(null);

  // 开始拖拽
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setTempWidth(width);
  }, [width]);

  // 处理拖拽移动和结束
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      let newWidth: number;

      if (direction === "right") {
        // 从右边缘拖拽（左侧面板）：使用鼠标相对于容器左边的距离
        const workspaceContainer = document.querySelector("main.flex-1");
        if (workspaceContainer) {
          const containerRect = workspaceContainer.getBoundingClientRect();
          newWidth = e.clientX - containerRect.left;
        } else {
          return;
        }
      } else {
        // 从左边缘拖拽（右侧面板）：使用窗口宽度减去鼠标位置
        newWidth = window.innerWidth - e.clientX;
      }

      // 限制宽度范围
      if (newWidth >= min && newWidth <= max) {
        setTempWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (tempWidth !== null) {
        setWidth(tempWidth);
        localStorage.setItem(storageKey, tempWidth.toString());
      }
      setIsResizing(false);
      setTempWidth(null);
    };

    // 添加事件监听
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // 设置拖拽时的光标和禁止选中文本
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, tempWidth, min, max, storageKey, direction]);

  return {
    width,
    tempWidth,
    isResizing,
    onMouseDown,
    currentWidth: tempWidth !== null ? tempWidth : width,
  };
}
