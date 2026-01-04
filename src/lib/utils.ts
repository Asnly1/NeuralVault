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
