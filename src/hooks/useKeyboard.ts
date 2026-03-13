import { useEffect, useCallback, useRef } from "react";

interface KeyboardShortcut {
  /** 按键，如 "s", "Enter", "Escape" */
  key: string;
  /** 是否需要 Ctrl/Cmd 键 */
  ctrl?: boolean;
  /** 是否需要 Shift 键 */
  shift?: boolean;
  /** 是否需要 Alt 键 */
  alt?: boolean;
  /** 是否需要 Meta 键 (Mac Cmd) */
  meta?: boolean;
  /** 回调函数 */
  handler: (e: KeyboardEvent) => void;
  /** 是否阻止默认行为 */
  preventDefault?: boolean;
}

/**
 * 键盘快捷键管理 hook
 *
 * @example
 * useKeyboard([
 *   { key: "s", ctrl: true, handler: handleSave, preventDefault: true },
 *   { key: "Escape", handler: handleClose },
 * ]);
 */
export function useKeyboard(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true
): void {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        const ctrlMatch = shortcut.ctrl
          ? e.ctrlKey || e.metaKey // 支持 Mac Cmd
          : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;
        const metaMatch = shortcut.meta ? e.metaKey : true;

        if (
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlMatch &&
          shiftMatch &&
          altMatch &&
          metaMatch
        ) {
          if (shortcut.preventDefault) {
            e.preventDefault();
          }
          shortcut.handler(e);
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}

/**
 * 单个快捷键 hook
 *
 * @example
 * useKeyboardShortcut("Escape", handleClose);
 * useKeyboardShortcut("s", handleSave, { ctrl: true, preventDefault: true });
 */
export function useKeyboardShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options: Omit<KeyboardShortcut, "key" | "handler"> = {}
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const stableHandler = useCallback((e: KeyboardEvent) => {
    handlerRef.current(e);
  }, []);

  useKeyboard([{ key, handler: stableHandler, ...options }]);
}

/**
 * Ctrl+S / Cmd+S 保存快捷键
 *
 * @example
 * useSaveShortcut(handleSave, { enabled: isModified });
 */
export function useSaveShortcut(
  handler: () => void,
  options: { enabled?: boolean } = {}
): void {
  const { enabled = true } = options;

  useKeyboard(
    [
      {
        key: "s",
        ctrl: true,
        handler: () => handler(),
        preventDefault: true,
      },
    ],
    enabled
  );
}

/**
 * Escape 键快捷键
 *
 * @example
 * useEscapeKey(handleClose);
 */
export function useEscapeKey(
  handler: () => void,
  enabled: boolean = true
): void {
  useKeyboard(
    [
      {
        key: "Escape",
        handler: () => handler(),
      },
    ],
    enabled
  );
}

/**
 * Enter 键快捷键（支持 Shift+Enter 例外）
 *
 * @example
 * useEnterKey(handleSubmit, { allowShiftEnter: true });
 */
export function useEnterKey(
  handler: () => void,
  options: { enabled?: boolean; allowShiftEnter?: boolean } = {}
): void {
  const { enabled = true, allowShiftEnter = true } = options;

  useKeyboard(
    [
      {
        key: "Enter",
        handler: (e) => {
          if (allowShiftEnter && e.shiftKey) return;
          handler();
        },
      },
    ],
    enabled
  );
}
