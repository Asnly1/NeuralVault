import { useState, useCallback, useEffect } from "react";

interface UseEditableFieldOptions<T> {
  initialValue: T;
  onSave: (value: T) => Promise<void>;
}

export interface UseEditableFieldReturn<T> {
  value: T;
  isEditing: boolean;
  editValue: T;
  isSaving: boolean;
  startEditing: () => void;
  setEditValue: (value: T) => void;
  save: () => Promise<void>;
  cancel: () => void;
}

export function useEditableField<T>(
  options: UseEditableFieldOptions<T>
): UseEditableFieldReturn<T> {
  const { initialValue, onSave } = options;

  const [value, setValue] = useState<T>(initialValue);
  const [editValue, setEditValue] = useState<T>(initialValue);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync with external changes
  useEffect(() => {
    setValue(initialValue);
    if (!isEditing) {
      setEditValue(initialValue);
    }
  }, [initialValue, isEditing]);

  const startEditing = useCallback(() => {
    setEditValue(value);
    setIsEditing(true);
  }, [value]);

  const save = useCallback(async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(editValue);
      setValue(editValue);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save:", err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [editValue, value, onSave]);

  const cancel = useCallback(() => {
    setEditValue(value);
    setIsEditing(false);
  }, [value]);

  return {
    value,
    isEditing,
    editValue,
    setEditValue,
    startEditing,
    save,
    cancel,
    isSaving,
  };
}
