import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getFileTypeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""

  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) {
    return "image"
  }
  if (ext === "pdf") {
    return "pdf"
  }
  if (ext === "epub") {
    return "epub"
  }
  if (["txt", "md", "json", "csv", "xml", "html", "css", "js", "ts"].includes(ext)) {
    return "text"
  }
  return "other"
}

/**
 * 根据文件名返回对应的图标 emoji
 * 用于 QuickCapture、文件列表等地方显示文件图标
 */
export function getFileIcon(fileName: string): string {
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

