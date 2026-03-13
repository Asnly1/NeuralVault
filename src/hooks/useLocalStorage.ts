import { useState, useCallback, useEffect } from "react";

/**
 * localStorage 封装 hook
 *
 * 提供类型安全的 localStorage 读写，支持默认值和序列化
 *
 * @example
 * const [theme, setTheme] = useLocalStorage<"light" | "dark" | "system">("theme", "system");
 *
 * // 自动持久化到 localStorage
 * setTheme("dark");
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // 初始化时从 localStorage 读取
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      return JSON.parse(item) as T;
    } catch {
      return defaultValue;
    }
  });

  // 更新值并同步到 localStorage
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const newValue = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(newValue));
        } catch (err) {
          console.error(`Error saving to localStorage key "${key}":`, err);
        }
        return newValue;
      });
    },
    [key]
  );

  return [storedValue, setValue];
}

/**
 * 简单的 localStorage 字符串读写 hook
 *
 * 不进行 JSON 序列化，适合简单字符串值
 *
 * @example
 * const [language, setLanguage] = useLocalStorageString("language", "zh");
 */
export function useLocalStorageString(
  key: string,
  defaultValue: string
): [string, (value: string) => void] {
  const [storedValue, setStoredValue] = useState<string>(() => {
    return localStorage.getItem(key) ?? defaultValue;
  });

  const setValue = useCallback(
    (value: string) => {
      setStoredValue(value);
      localStorage.setItem(key, value);
    },
    [key]
  );

  return [storedValue, setValue];
}

/**
 * localStorage 数字读写 hook
 *
 * @example
 * const [sidebarWidth, setSidebarWidth] = useLocalStorageNumber("sidebar_width", 256);
 */
export function useLocalStorageNumber(
  key: string,
  defaultValue: number
): [number, (value: number) => void] {
  const [storedValue, setStoredValue] = useState<number>(() => {
    const saved = localStorage.getItem(key);
    return saved ? parseInt(saved, 10) : defaultValue;
  });

  const setValue = useCallback(
    (value: number) => {
      setStoredValue(value);
      localStorage.setItem(key, value.toString());
    },
    [key]
  );

  return [storedValue, setValue];
}

/**
 * localStorage 布尔值读写 hook
 *
 * @example
 * const [collapsed, setCollapsed] = useLocalStorageBoolean("sidebar_collapsed", false);
 */
export function useLocalStorageBoolean(
  key: string,
  defaultValue: boolean
): [boolean, (value: boolean) => void] {
  const [storedValue, setStoredValue] = useState<boolean>(() => {
    const saved = localStorage.getItem(key);
    return saved !== null ? saved === "true" : defaultValue;
  });

  const setValue = useCallback(
    (value: boolean) => {
      setStoredValue(value);
      localStorage.setItem(key, value.toString());
    },
    [key]
  );

  return [storedValue, setValue];
}

/**
 * 监听其他标签页对 localStorage 的修改
 *
 * @example
 * useLocalStorageSync("theme", (newValue) => {
 *   setTheme(newValue);
 * });
 */
export function useLocalStorageSync(
  key: string,
  onUpdate: (newValue: string | null) => void
): void {
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key) {
        onUpdate(e.newValue);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [key, onUpdate]);
}
