import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { IngestProgress } from "../types";

/**
 * Ingest 进度管理 Hook
 *
 * 监听 Tauri Events 接收资源处理进度更新。
 * 进度由 Rust 后端从 Python 的 HTTP StreamingResponse 读取并转发。
 *
 * @returns progressMap - 资源 ID 到进度的映射
 * @returns clearProgress - 清除特定资源的进度
 */
export function useIngestProgress() {
  const [progressMap, setProgressMap] = useState<Map<number, IngestProgress>>(new Map());

  // 监听 Tauri Events

  // 执行顺序：
  // 1. 打开界面，浏览器绘制UI
  // 2. 绘制UI后执行useEffect
  // 3.1.1 在用户切换界面前，Listen返回了数据，同时返回了fn(卸载函数)
  // 3.1.2 用户切换界面，执行useEffect中的cleanup，设置isMounted为false，调用fn卸载
  // 3.2.1 在用户切换界面前，Listen没有返回了，同时没有返回fn(卸载函数)
  // 3.2.2 用户切换界面，执行useEffect中的cleanup，设置isMounted为false，没有调用fn卸载
  // 3.2.3 在用户切换界面后，Listenr仍在运行，返回了数据，并返回Fn
  // 3.2.4 检测到 !isMounted，调用fn卸载
  
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        // listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn>
        // event: 事件名称。这是一个全局标识符，必须与 Rust 后端 emit 或 emit_all 时使用的字符串完全一致
        // handler: 事件处理函数。当事件发生时，这个函数会被调用
        // 参数：{
        //   event: "ingest-progress", // 事件名
        //   windowLabel: "main",      // 发出事件的窗口（如果是全局事件则可能不同）
        //   payload: { ... }          // Rust 传递过来的实际数据（对应你的 IngestProgress）
        //   id: number                // 事件唯一ID
        // }
        // listen 会返回一个 UnlistenFn，用于取消监听
        const fn = await listen<IngestProgress>("ingest-progress", (event) => {
          if (!isMounted) return; // 防止在卸载后设置状态
          const progress = event.payload;
          console.log("[IngestProgress] Progress update:", progress);

          setProgressMap((prev) => {
            const newMap = new Map(prev);
            newMap.set(progress.node_id, progress);
            return newMap;
          });
        });

        console.log("[IngestProgress] Event listener registered");

        if (!isMounted) {
          fn();
        } else {
          unlistenFn = fn;
        }

      } catch (e) {
        console.error("[IngestProgress] Failed to setup listener:", e);
      }
    };

    setupListener();

    // 清理函数
    return () => {
      isMounted = false; // 标记组件已卸载
      if (unlistenFn) {
        unlistenFn(); // 如果监听器已建立，则清理
        console.log("[IngestProgress] Event listener unregistered");
      }
    };
  }, []);

  // 清除特定资源的进度
  const clearProgress = useCallback((resourceId: number) => {
    setProgressMap((prev) => {
      const newMap = new Map(prev);
      newMap.delete(resourceId);
      return newMap;
    });
  }, []);

  return {
    progressMap,
    clearProgress,
  };
}
