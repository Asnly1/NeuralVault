import {
  FormEvent,
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  ClipboardEvent,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { readClipboard } from "@/api";
import { ClipboardContent } from "@/types";

// variant: 组件变体，用于添加不同的 CSS 类
// - "card": Dashboard 中的卡片样式（默认）
// - "hud": 悬浮窗样式
type QuickCaptureVariant = "card" | "hud";

// 选中的文件信息
interface SelectedFile {
  path: string; // 文件绝对路径或相对路径（从剪贴板粘贴的图片）
  name: string; // 文件名（用于显示）
  isFromClipboard?: boolean; // 是否来自剪贴板（图片已保存到 assets）
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
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
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
    if (
      (!content.trim() && selectedFiles.length === 0) ||
      loading ||
      isSubmitting
    )
      return;

    setIsSubmitting(true);
    try {
      const text = content.trim();
      if (selectedFiles.length === 0) {
        // 只有文本，没有文件
        await onCapture(text);
      } else {
        // 有文件：每个文件都使用相同的文本
        for (const file of selectedFiles) {
          await onCapture(text, file.path);
        }
      }

      setContent("");
      setSelectedFiles([]);

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

  // 处理粘贴事件：读取系统剪贴板内容
  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    // 检查是否有文件或图片（通过原生 clipboardData）
    const items = e.clipboardData?.items;
    let hasFileOrImage = false;

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // 检查是否是文件类型（图片也是文件）
        if (item.kind === "file") {
          hasFileOrImage = true;
          break;
        }
      }
    }

    // 如果有文件或图片，使用 Rust 后端读取剪贴板
    if (hasFileOrImage) {
      e.preventDefault(); // 阻止默认粘贴行为

      try {
        const response = await readClipboard();
        handleClipboardContent(response.content);
      } catch (err) {
        console.error("读取剪贴板失败:", err);
      }
    }
    // 如果是纯文本，让浏览器默认处理
  };

  // 处理剪贴板内容
  const handleClipboardContent = (clipboardContent: ClipboardContent) => {
    switch (clipboardContent.type) {
      case "Image":
        // 图片已保存到 assets，添加到文件列表
        setSelectedFiles((prev) => [
          ...prev,
          {
            path: clipboardContent.data.file_path,
            name: clipboardContent.data.file_name,
            isFromClipboard: true,
          },
        ]);
        break;

      case "Files":
        // 文件列表：添加所有文件
        if (clipboardContent.data.paths.length > 0) {
          const newFiles = clipboardContent.data.paths.map((filePath) => ({
            path: filePath,
            name:
              filePath.split("/").pop() ||
              filePath.split("\\").pop() ||
              "未知文件",
          }));
          setSelectedFiles((prev) => [...prev, ...newFiles]);
        }
        break;

      case "Html":
        // HTML 内容：优先使用纯文本，否则使用 HTML
        const textContent =
          clipboardContent.data.plain_text || clipboardContent.data.content;
        setContent((prev) => prev + textContent);
        break;

      case "Text":
        // 纯文本：追加到输入框
        setContent((prev) => prev + clipboardContent.data.content);
        break;

      case "Empty":
        // 剪贴板为空，不做处理
        break;
    }
  };

  // 使用 Tauri dialog API 选择文件（支持多选）
  const handleFileButtonClick = async () => {
    try {
      const selected = await open({
        multiple: true,
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
          { name: "文本文件", extensions: ["txt", "md"] },
          {
            name: "图片",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
          },
          { name: "文档", extensions: ["pdf", "epub"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });

      if (selected) {
        // selected 可能是 string 或 string[]
        const paths = Array.isArray(selected) ? selected : [selected];
        const newFiles = paths.map((filePath) => ({
          path: filePath,
          name:
            filePath.split("/").pop() ||
            filePath.split("\\").pop() ||
            "未知文件",
        }));
        setSelectedFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  // 移除指定索引的文件
  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const isLoading = loading || isSubmitting;
  const canSubmit = (content.trim() || selectedFiles.length > 0) && !isLoading;

  const Wrapper = isHUD ? "div" : Card;
  const ContentWrapper = isHUD ? "div" : CardContent;

  return (
    <Wrapper
      className={cn(
        isHUD &&
          "bg-background/80 backdrop-blur-lg border rounded-xl shadow-2xl"
      )}
    >
      <ContentWrapper className={cn(!isHUD && "p-4", isHUD && "p-3")}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Selected Files Preview */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.path}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{getFileIcon(file.name)}</span>
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => handleRemoveFile(index)}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            placeholder={placeholder || defaultPlaceholder}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={isLoading}
            autoFocus={autoFocus}
            className={cn(
              "min-h-[40px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0",
              isHUD && "text-base"
            )}
            rows={1}
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleFileButtonClick}
                disabled={isLoading}
                title="选择文件"
              >
                <span className="text-lg">+</span>
              </Button>
              {isHUD && (
                <Badge variant="secondary" className="text-xs">
                  Enter 发送 · Esc 关闭
                </Badge>
              )}
            </div>

            <Button
              type="submit"
              size="icon"
              className="h-8 w-8 rounded-full"
              disabled={!canSubmit}
              title="发送 (Enter)"
            >
              {isLoading ? (
                <span className="animate-spin text-sm">○</span>
              ) : (
                <span className="text-sm">↑</span>
              )}
            </Button>
          </div>
        </form>
      </ContentWrapper>
    </Wrapper>
  );
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  const iconMap: Record<string, string> = {
    txt: "📄",
    md: "📝",
    json: "📋",
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    gif: "🖼️",
    webp: "🖼️",
    svg: "🖼️",
    pdf: "📕",
    epub: "📖",
    js: "📜",
    ts: "📜",
    html: "🌐",
    css: "🎨",
  };

  return iconMap[ext] || "📎";
}
