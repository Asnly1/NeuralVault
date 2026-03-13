import { useEffect, useCallback } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { quickCapture } from "../api";
import { QuickCapture } from "../components";
import { getFileTypeFromPath } from "../lib/utils";

export function HUDPage() {
  // 处理捕获
  const handleCapture = useCallback(
    async (content: string, filePath?: string) => {
      if (filePath) {
        // 有文件：传递文件路径给 Rust
        await quickCapture({
          file_path: filePath,
          file_type: getFileTypeFromPath(filePath),
          content: content || undefined,
        });
      } else if (content) {
        // 纯文本
        await quickCapture({
          content,
          file_type: "text",
        });
      }
    },
    []
  );

  // 隐藏窗口
  const handleHide = useCallback(() => {
    emit("hud-blur");
  }, []);

  // 监听 hud-focus 事件
  // 方向：后端 -> 前端
  // 场景：用户按下快捷键唤起窗口时，Rust 发送 hud-focus 信号
  useEffect(() => {
    const unlisten = listen("hud-focus", () => {
      // QuickCapture 组件会自动聚焦（通过 autoFocus prop）
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4 bg-transparent">
      <div className="w-full max-w-lg">
        <QuickCapture
          variant="hud"
          onCapture={handleCapture}
          onSuccess={handleHide}
          onCancel={handleHide}
          autoFocus
        />
      </div>
    </div>
  );
}
