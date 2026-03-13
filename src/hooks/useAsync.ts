import { useState, useCallback } from "react";

export interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface UseAsyncReturn<T, Args extends unknown[]> extends UseAsyncState<T> {
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
  setData: (data: T | null) => void;
}

/**
 * 通用异步操作 hook
 *
 * 封装了 loading/error/data 状态管理，避免在组件中重复编写异步状态逻辑
 *
 * @example
 * const { data, loading, error, execute } = useAsync(fetchDashboardData);
 *
 * useEffect(() => {
 *   execute();
 * }, [execute]);
 *
 * if (loading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 * return <Dashboard data={data} />;
 */
export function useAsync<T, Args extends unknown[] = []>(
  asyncFn: (...args: Args) => Promise<T>
): UseAsyncReturn<T, Args> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await asyncFn(...args);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, loading: false, error }));
        return null;
      }
    },
    [asyncFn]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
  };
}

/**
 * 带立即执行的异步 hook
 *
 * @example
 * const { data, loading, error, refetch } = useAsyncImmediate(fetchDashboardData);
 */
export function useAsyncImmediate<T>(
  asyncFn: () => Promise<T>
): UseAsyncState<T> & { refetch: () => Promise<T | null> } {
  const { data, loading, error, execute } = useAsync(asyncFn);

  // 使用 useState 初始化时执行一次
  useState(() => {
    execute();
  });

  return {
    data,
    loading,
    error,
    refetch: execute,
  };
}
