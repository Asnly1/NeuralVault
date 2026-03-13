import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, X } from "lucide-react";
import { NodeRecord, priorityConfig } from "@/types";
import { useEditableField } from "@/hooks";
import {
  updateTaskTitle,
  updateTaskSummary,
  updateTopicTitle,
  updateTopicSummary,
} from "@/api";

interface NodeDetailCardProps {
  node: NodeRecord;
  nodeType: "task" | "topic";
  onUpdate?: (node: NodeRecord) => void;
}

export function NodeDetailCard({ node, nodeType, onUpdate }: NodeDetailCardProps) {
  const isTask = nodeType === "task";

  // Title field
  const titleField = useEditableField<string>({
    initialValue: node.title || "",
    onSave: async (value) => {
      if (isTask) {
        await updateTaskTitle(node.node_id, value);
      } else {
        await updateTopicTitle(node.node_id, value);
      }
      onUpdate?.({ ...node, title: value });
    },
  });

  // Summary field
  const summaryField = useEditableField<string>({
    initialValue: node.summary || "",
    onSave: async (value) => {
      const summaryValue = value || null;
      if (isTask) {
        await updateTaskSummary(node.node_id, summaryValue);
      } else {
        await updateTopicSummary(node.node_id, summaryValue);
      }
      onUpdate?.({ ...node, summary: summaryValue });
    },
  });

  // Reset fields when node changes
  useEffect(() => {
    if (titleField.isEditing) {
      titleField.cancel();
    }
    if (summaryField.isEditing) {
      summaryField.cancel();
    }
  }, [node.node_id]);

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        {/* Title - double click to edit */}
        {titleField.isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              value={titleField.editValue}
              onChange={(e) => titleField.setEditValue(e.target.value)}
              className="h-8 text-sm font-medium"
              autoFocus
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => void titleField.save()}
              disabled={titleField.isSaving}
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={titleField.cancel}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <h4
            className="font-medium cursor-pointer hover:text-primary transition-colors"
            onDoubleClick={titleField.startEditing}
            title="双击编辑"
          >
            {node.title || (isTask ? "未命名任务" : "未命名主题")}
          </h4>
        )}

        {/* Summary - double click to edit */}
        {summaryField.isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={summaryField.editValue}
              onChange={(e) => summaryField.setEditValue(e.target.value)}
              className="text-sm resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void summaryField.save()}
                disabled={summaryField.isSaving}
              >
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={summaryField.cancel}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <p
            className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
            onDoubleClick={summaryField.startEditing}
            title="双击编辑"
          >
            {node.summary || <span className="italic">无摘要</span>}
          </p>
        )}

        {/* Task-specific: status & priority */}
        {isTask && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{node.task_status}</Badge>
              {node.priority && (
                <Badge
                  style={{
                    backgroundColor: `${priorityConfig[node.priority].color}20`,
                    color: priorityConfig[node.priority].color,
                  }}
                >
                  {priorityConfig[node.priority].label}
                </Badge>
              )}
            </div>
            {node.due_date && (
              <p className="text-xs text-muted-foreground">
                截止: {node.due_date.toLocaleDateString("zh-CN")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
