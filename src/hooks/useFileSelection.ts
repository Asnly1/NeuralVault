import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface SelectedFile {
  path: string;
  name: string;
  isFromClipboard?: boolean;
}

interface UseFileSelectionReturn {
  selectedFiles: SelectedFile[];
  addFiles: (files: SelectedFile[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  openFileDialog: () => Promise<void>;
}

const FILE_FILTERS = [
  {
    name: "支持的文件",
    extensions: ["txt", "md", "pdf", "png", "jpg", "jpeg", "gif", "webp", "epub"],
  },
  { name: "文本文件", extensions: ["txt", "md"] },
  { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
  { name: "文档", extensions: ["pdf", "epub"] },
  { name: "所有文件", extensions: ["*"] },
];

/**
 * 文件选择 hook
 *
 * 封装文件选择对话框和文件列表管理
 */
export function useFileSelection(): UseFileSelectionReturn {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);

  const addFiles = useCallback((files: SelectedFile[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const openFileDialog = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: FILE_FILTERS,
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const newFiles = paths.map((filePath) => ({
          path: filePath,
          name: filePath.split("/").pop() || filePath.split("\\").pop() || "未知文件",
        }));
        setSelectedFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  }, []);

  return {
    selectedFiles,
    addFiles,
    removeFile,
    clearFiles,
    openFileDialog,
  };
}
