import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

interface UsePythonStatusReturn {
  error: string | null;
  dismissError: () => void;
}

/**
 * Python 后端状态监听 hook
 *
 * 监听 Python 后端的启动状态事件
 */
export function usePythonStatus(): UsePythonStatusReturn {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen<{ status: string; message?: string }>("python-status", (event) => {
      if (event.payload.status === "error") {
        setError(event.payload.message || "Python 后端启动失败");
      } else if (event.payload.status === "ready") {
        setError(null);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const dismissError = () => setError(null);

  return { error, dismissError };
}
