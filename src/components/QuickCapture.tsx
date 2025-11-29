import { FormEvent, useState, useRef, useEffect, KeyboardEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";

// variant: 组件变体，用于添加不同的 CSS 类
// - "card": Dashboard 中的卡片样式（默认）
// - "hud": 悬浮窗样式
type QuickCaptureVariant = "card" | "hud";

// 选中的文件信息
interface SelectedFile {
  path: string; // 文件绝对路径
  name: string; // 文件名（用于显示）
}

interface QuickCaptureProps {
  // content: 文本内容, filePath: 文件路径（二选一或都有）
  onCapture: (content: string, filePath?: string) => Promise<void>;
  loading?: boolean;
  variant?: QuickCaptureVariant;
  // 成功后的回调（HUD 用于隐藏窗口）
  onSuccess?: () => void;
  // 取消/关闭的回调（HUD 用于 Esc 关闭）
  onCancel?: () => void;
  // 是否自动聚焦
  autoFocus?: boolean;
  placeholder?: string;
}

export function QuickCapture({
  onCapture,
  loading = false,
  variant = "card",
  onSuccess,
  onCancel,
  autoFocus = false,
  placeholder,
}: QuickCaptureProps) {
  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isHUD = variant === "hud";

  // 默认 placeholder
  const defaultPlaceholder = isHUD
    ? "快速捕获... Enter 发送，Esc 关闭"
    : "输入内容，按 Enter 发送...";

  // 自动调整 textarea 高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      // HUD 模式最大高度小一些
      const maxHeight = isHUD ? 120 : 200;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [content, isHUD]);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  // HUD 模式：监听 Escape 键
  useEffect(() => {
    if (!isHUD || !onCancel) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isHUD, onCancel]);

  // HUD 模式：窗口失焦时关闭
  useEffect(() => {
    if (!isHUD || !onCancel) return;

    const handleBlur = () => {
      setTimeout(() => {
        if (!document.hasFocus()) {
          onCancel();
        }
      }, 100);
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [isHUD, onCancel]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if ((!content.trim() && !selectedFile) || loading || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onCapture(content.trim(), selectedFile?.path);
      setContent("");
      setSelectedFile(null);

      // 重置 textarea 高度
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      // 调用成功回调
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error("Capture failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 处理键盘事件：Enter 提交，Shift+Enter 换行
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 使用 Tauri dialog API 选择文件
  const handleFileButtonClick = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "支持的文件",
            extensions: [
              "txt",
              "md",
              "pdf",
              "png",
              "jpg",
              "jpeg",
              "gif",
              "webp",
              "epub",
            ],
          },
          {
            name: "文本文件",
            extensions: ["txt", "md"],
          },
          {
            name: "图片",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
          },
          {
            name: "文档",
            extensions: ["pdf", "epub"],
          },
          {
            name: "所有文件",
            extensions: ["*"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        const fileName =
          selected.split("/").pop() || selected.split("\\").pop() || "未知文件";
        setSelectedFile({
          path: selected,
          name: fileName,
        });
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  // 移除已选文件
  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  const isLoading = loading || isSubmitting;
  const canSubmit = (content.trim() || selectedFile) && !isLoading;

  // 统一的 UI 结构，通过 variant 类名区分样式
  return (
    <div className={`quick-capture-gemini ${isHUD ? "quick-capture-hud" : ""}`}>
      <form onSubmit={handleSubmit}>
        {/* 已选文件预览 */}
        {selectedFile && (
          <div className="capture-file-preview">
            <div className="file-info">
              <span className="file-icon">
                {getFileIcon(selectedFile.name)}
              </span>
              <span className="file-name">{selectedFile.name}</span>
            </div>
            <button
              type="button"
              className="file-remove"
              onClick={handleRemoveFile}
              title="移除文件"
            >
              ×
            </button>
          </div>
        )}

        {/* 输入区域 */}
        <div className="capture-input-area">
          <textarea
            ref={textareaRef}
            className="capture-textarea"
            placeholder={placeholder || defaultPlaceholder}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
            autoFocus={autoFocus}
          />
        </div>

        {/* 底部工具栏 */}
        <div className="capture-toolbar">
          <div className="toolbar-left">
            {/* 上传文件按钮 */}
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleFileButtonClick}
              disabled={isLoading}
              title="选择文件"
            >
              <span className="toolbar-icon">+</span>
            </button>
          </div>

          <div className="toolbar-right">
            {/* 发送按钮 */}
            <button
              type="submit"
              className="capture-submit"
              disabled={!canSubmit}
              title="发送 (Enter)"
            >
              {isLoading ? (
                <span className="submit-loading">○</span>
              ) : (
                <span className="submit-icon">↑</span>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// 根据文件扩展名返回对应的图标
function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  const iconMap: Record<string, string> = {
    // 文本
    txt: "📄",
    md: "📝",
    json: "📋",
    // 图片
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    gif: "🖼️",
    webp: "🖼️",
    svg: "🖼️",
    // 文档
    pdf: "📕",
    epub: "📖",
    // 代码
    js: "📜",
    ts: "📜",
    html: "🌐",
    css: "🎨",
  };

  return iconMap[ext] || "📎";
}
