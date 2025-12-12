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
import { Paperclip, ArrowUp, X } from "lucide-react";
import { readClipboard } from "@/api";
import { ClipboardContent } from "@/types";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t } = useLanguage();

  const isHUD = variant === "hud";

  // 默认 placeholder
  const defaultPlaceholder = isHUD
    ? t("dashboard", "quickCapture")
    : t("dashboard", "quickCapture");

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
        isHUD 
          ? "bg-background/80 backdrop-blur-lg border border-border/40 rounded-xl shadow-2xl"
          : "border border-t-0 border-x-0 border-b-0 shadow-none bg-transparent"
      )}
    >
      <ContentWrapper className={cn(!isHUD && "p-0", isHUD && "p-3")}>
        <form onSubmit={handleSubmit} className="relative group">
          {/* Selected Files Preview */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 p-2">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.path}-${index}`}
                  className="flex items-center gap-2 rounded-md bg-muted/60 border border-border px-2 py-1 text-xs"
                >
                  <span className="opacity-70">{getFileIcon(file.name)}</span>
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={cn(
            "flex items-center gap-2 rounded-xl border bg-background px-3 py-2 transition-all focus-within:ring-1 focus-within:ring-primary/20",
            !isHUD && "shadow-sm border-border hover:border-primary/20"
          )}>
             <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
                onClick={handleFileButtonClick}
                disabled={isLoading}
                title="选择文件" 
              >
                <Paperclip className="h-4.5 w-4.5" />
              </Button>

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
                  "min-h-[24px] max-h-[200px] w-full resize-none border-0 bg-transparent p-0 pl-1 placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0 leading-relaxed",
                  isHUD && "text-base"
                )}
                rows={1}
              />

              <Button
                type="submit"
                size="icon"
                className={cn(
                  "h-7 w-7 rounded-full transition-all shrink-0",
                  canSubmit 
                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                    : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                )}
                disabled={!canSubmit}
                title="发送 (Enter)"
              >
                 {isLoading ? (
                  <span className="animate-spin text-xs">⟳</span>
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
          </div>
          
           {isHUD && (
              <div className="flex justify-end mt-2 px-1">
                 <Badge variant="outline" className="text-[10px] text-muted-foreground border-transparent">
                  Enter 发送 · Esc 关闭
                </Badge>
              </div>
           )}
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
