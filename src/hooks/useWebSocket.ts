import { useState, useEffect, useRef, useCallback } from "react";
import { WebSocketProgress } from "../types";
import { getPythonPort } from "../api";

/**
 * WebSocket 连接状态
 */
type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

/**
 * WebSocket 进度管理 Hook
 *
 * 连接 Python 后端的 WebSocket，接收资源处理进度更新
 *
 * @returns progressMap - 资源 ID 到进度的映射
 */
export function useWebSocket() {
  const [progressMap, setProgressMap] = useState<Map<number, WebSocketProgress>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  // useRef 用于保存 WebSocket 连接状态，修改时不会触发组件重新渲染，保证在组件重渲染时 WebSocket 连接不断开
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 避免重复获取 Python 端口
  const portRef = useRef<number | null>(null);

  // 清理 reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // 连接 WebSocket
  // 依赖数组变化时，重新创建connect函数（内存地址变化），否则内存地址不变
  const connect = useCallback(async () => {
    // 如果已连接或正在连接，跳过
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      setConnectionState("connecting");

      // 获取 Python 端口（只获取一次）
      if (!portRef.current) {
        portRef.current = await getPythonPort();
      }

      const wsUrl = `ws://127.0.0.1:${portRef.current}/ws/notifications`;
      console.log("[WebSocket] Connecting to:", wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WebSocket] Connected");
        setConnectionState("connected");
        clearReconnectTimeout();
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketProgress = JSON.parse(event.data);
          console.log("[WebSocket] Progress update:", message);

          setProgressMap((prev) => {
            const newMap = new Map(prev);
            newMap.set(message.resource_id, message);
            return newMap;
          });
        } catch (e) {
          console.error("[WebSocket] Failed to parse message:", e);
        }
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
        setConnectionState("error");
      };

      ws.onclose = (event) => {
        console.log("[WebSocket] Connection closed:", event.code, event.reason);
        setConnectionState("disconnected");
        wsRef.current = null;

        // 自动重连（每 5 秒尝试一次）
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("[WebSocket] Attempting to reconnect...");
            connect();
          }, 5000);
        }
      };
    } catch (e) {
      console.error("[WebSocket] Failed to connect:", e);
      setConnectionState("error");

      // 重试获取端口
      portRef.current = null;

      // 5 秒后重试
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      }
    }
  }, [clearReconnectTimeout]);

  // 断开连接
  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState("disconnected");
  }, [clearReconnectTimeout]);

  // 清除特定资源的进度
  const clearProgress = useCallback((resourceId: number) => {
    setProgressMap((prev) => {
      const newMap = new Map(prev);
      newMap.delete(resourceId);
      return newMap;
    });
  }, []);

  // 组件卸载时清理
  // 先执行return中的函数（清理函数），再执行主体中的函数
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    progressMap,
    connectionState,
    connect,
    disconnect,
    clearProgress,
  };
}
