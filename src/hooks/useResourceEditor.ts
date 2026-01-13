import { useState, useCallback, useEffect } from "react";
import { updateResourceUserNote, updateResourceTitle } from "@/api";
import type { NodeRecord } from "@/types";

export interface ResourceEditorState {
  content: string;
  isModified: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  isEditingName: boolean;
  editedDisplayName: string;
  viewMode: "file" | "text";
}

export interface ResourceEditorActions {
  setContent: (content: string) => void;
  setViewMode: (mode: "file" | "text") => void;
  startEditingName: () => void;
  setEditedDisplayName: (name: string) => void;
  cancelEditingName: () => void;
  save: () => Promise<{ updatedResource?: NodeRecord } | null>;
}

export interface UseResourceEditorReturn extends ResourceEditorState, ResourceEditorActions {}

/**
 * 资源编辑器状态管理 hook
 *
 * 封装编辑器内容、修改状态、保存逻辑
 */
export function useResourceEditor(
  currentResource: NodeRecord | null,
  onResourceUpdate?: (resource: NodeRecord) => void
): UseResourceEditorReturn {
  const [content, setContentState] = useState("");
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState("");
  const [viewMode, setViewMode] = useState<"file" | "text">("file");

  // 当资源变化时，重置编辑器状态
  useEffect(() => {
    if (currentResource) {
      // 使用 user_note 作为编辑内容
      setContentState(currentResource.user_note || "");
      setIsModified(false);
      setEditedDisplayName(currentResource.title || "");
      setIsEditingName(false);
      setSaveSuccess(false);
      setSaveError(null);

      // 根据资源类型设置默认视图模式
      setViewMode(currentResource.resource_subtype === "text" ? "text" : "file");
    } else {
      setContentState("");
      setIsModified(false);
      setEditedDisplayName("");
      setIsEditingName(false);
      setViewMode("file");
    }
  }, [currentResource]);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setIsModified(true);
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  const startEditingName = useCallback(() => {
    setIsEditingName(true);
  }, []);

  const cancelEditingName = useCallback(() => {
    setIsEditingName(false);
    if (currentResource) {
      setEditedDisplayName(currentResource.title || "");
    }
  }, [currentResource]);

  const save = useCallback(async () => {
    if (!currentResource || isSaving) return null;

    const hasContentChange = isModified;
    const hasNameChange = editedDisplayName !== (currentResource.title || "");

    if (!hasContentChange && !hasNameChange) return null;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (hasContentChange) {
        // 保存到 user_note 字段
        await updateResourceUserNote(currentResource.node_id, content);
      }
      if (hasNameChange) {
        await updateResourceTitle(currentResource.node_id, editedDisplayName);
      }

      setIsModified(false);
      setIsEditingName(false);
      setSaveSuccess(true);

      // 3秒后清除成功状态
      setTimeout(() => setSaveSuccess(false), 3000);

      // 返回更新后的资源
      if (hasNameChange) {
        const updatedResource = { ...currentResource, title: editedDisplayName };
        onResourceUpdate?.(updatedResource);
        return { updatedResource };
      }

      return {};
    } catch (err) {
      console.error("保存失败:", err);
      setSaveError(err instanceof Error ? err.message : "保存失败");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [currentResource, isModified, isSaving, content, editedDisplayName, onResourceUpdate]);

  return {
    // State
    content,
    isModified,
    isSaving,
    saveSuccess,
    saveError,
    isEditingName,
    editedDisplayName,
    viewMode,
    // Actions
    setContent,
    setViewMode,
    startEditingName,
    setEditedDisplayName,
    cancelEditingName,
    save,
  };
}
