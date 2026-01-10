import { useCallback } from "react";
import { readClipboard } from "@/api";
import type { ClipboardContent } from "@/types";

interface SelectedFile {
  path: string;
  name: string;
  isFromClipboard?: boolean;
}

interface UseClipboardReturn {
  handlePaste: (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    callbacks: {
      onText: (text: string) => void;
      onFiles: (files: SelectedFile[]) => void;
    }
  ) => Promise<void>;
}

/**
 * 剪贴板处理 hook
 *
 * 封装剪贴板读取和内容处理逻辑
 */
export function useClipboard(): UseClipboardReturn {
  const handlePaste = useCallback(
    async (
      e: React.ClipboardEvent<HTMLTextAreaElement>,
      callbacks: {
        onText: (text: string) => void;
        onFiles: (files: SelectedFile[]) => void;
      }
    ) => {
      // 检查是否有文件或图片
      const items = e.clipboardData?.items;
      let hasFileOrImage = false;

      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === "file") {
            hasFileOrImage = true;
            break;
          }
        }
      }

      // 如果有文件或图片，使用 Rust 后端读取
      if (hasFileOrImage) {
        e.preventDefault();

        try {
          const response = await readClipboard();
          processClipboardContent(response.content, callbacks);
        } catch (err) {
          console.error("读取剪贴板失败:", err);
        }
      }
      // 纯文本让浏览器默认处理
    },
    []
  );

  return { handlePaste };
}

function processClipboardContent(
  content: ClipboardContent,
  callbacks: {
    onText: (text: string) => void;
    onFiles: (files: SelectedFile[]) => void;
  }
) {
  switch (content.type) {
    case "Image":
      callbacks.onFiles([
        {
          path: content.data.file_path,
          name: content.data.file_name,
          isFromClipboard: true,
        },
      ]);
      break;

    case "Files":
      if (content.data.paths.length > 0) {
        const files = content.data.paths.map((filePath) => ({
          path: filePath,
          name: filePath.split("/").pop() || filePath.split("\\").pop() || "未知文件",
        }));
        callbacks.onFiles(files);
      }
      break;

    case "Html":
      callbacks.onText(content.data.plain_text || content.data.content);
      break;

    case "Text":
      callbacks.onText(content.data.content);
      break;

    case "Empty":
      break;
  }
}
