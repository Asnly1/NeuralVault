import { useState, useCallback, useEffect } from "react";
import { updateResourceContent, updateResourceUserNote, updateResourceTitle } from "@/api";
import type { NodeRecord } from "@/types";

export interface ResourceEditorState {
  content: string;
  userNote: string;
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
  setUserNote: (note: string) => void;
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
  const [userNote, setUserNoteState] = useState("");
  const [isContentModified, setIsContentModified] = useState(false);
  const [isUserNoteModified, setIsUserNoteModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState("");
  const [viewMode, setViewMode] = useState<"file" | "text">("file");
  const isTextResource = currentResource?.resource_subtype === "text";
  const isModified = isContentModified || isUserNoteModified;

  // 当资源变化时，重置编辑器状态
  useEffect(() => {
    if (currentResource) {
      // text 资源使用 file_content，其他资源使用 user_note
      const nextContent = isTextResource
        ? currentResource.file_content || ""
        : currentResource.user_note || "";
      setContentState(nextContent);
      setUserNoteState(currentResource.user_note || "");
      setIsContentModified(false);
      setIsUserNoteModified(false);
      setEditedDisplayName(currentResource.title || "");
      setIsEditingName(false);
      setSaveSuccess(false);
      setSaveError(null);

      // 默认显示文件/正文视图
      setViewMode("file");
    } else {
      setContentState("");
      setUserNoteState("");
      setIsContentModified(false);
      setIsUserNoteModified(false);
      setEditedDisplayName("");
      setIsEditingName(false);
      setViewMode("file");
    }
  }, [currentResource, isTextResource]);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setIsContentModified(true);
    if (!isTextResource) {
      setUserNoteState(newContent);
    }
    setSaveSuccess(false);
    setSaveError(null);
  }, [isTextResource]);

  const setUserNote = useCallback((note: string) => {
    setUserNoteState(note);
    setIsUserNoteModified(true);
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

    const hasContentChange = isContentModified;
    const hasNoteChange = isTextResource && isUserNoteModified;
    const hasNameChange = editedDisplayName !== (currentResource.title || "");

    if (!hasContentChange && !hasNoteChange && !hasNameChange) return null;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (hasContentChange) {
        if (isTextResource) {
          await updateResourceContent(currentResource.node_id, content);
        } else {
          // 保存到 user_note 字段
          await updateResourceUserNote(currentResource.node_id, content);
        }
      }
      if (hasNoteChange) {
        await updateResourceUserNote(currentResource.node_id, userNote);
      }
      if (hasNameChange) {
        await updateResourceTitle(currentResource.node_id, editedDisplayName);
      }

      setIsContentModified(false);
      setIsUserNoteModified(false);
      setIsEditingName(false);
      setSaveSuccess(true);

      // 3秒后清除成功状态
      setTimeout(() => setSaveSuccess(false), 3000);

      let updatedResource: NodeRecord | null = null;
      if (hasContentChange) {
        updatedResource = {
          ...currentResource,
          ...(isTextResource ? { file_content: content } : { user_note: content }),
        };
      }
      if (hasNoteChange) {
        updatedResource = {
          ...(updatedResource ?? currentResource),
          user_note: userNote,
        };
      }
      if (hasNameChange) {
        updatedResource = {
          ...(updatedResource ?? currentResource),
          title: editedDisplayName,
        };
      }

      if (updatedResource) {
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
  }, [
    currentResource,
    isContentModified,
    isUserNoteModified,
    isSaving,
    content,
    userNote,
    editedDisplayName,
    onResourceUpdate,
    isTextResource,
  ]);

  return {
    // State
    content,
    userNote,
    isModified,
    isSaving,
    saveSuccess,
    saveError,
    isEditingName,
    editedDisplayName,
    viewMode,
    // Actions
    setContent,
    setUserNote,
    setViewMode,
    startEditingName,
    setEditedDisplayName,
    cancelEditingName,
    save,
  };
}
