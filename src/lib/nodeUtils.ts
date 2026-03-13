/**
 * Node 相关的通用工具函数
 * 从 Sidebar.tsx 和 NodeCard.tsx 中抽取的共享代码
 */
import {
  Tag,
  CheckSquare,
  FileText,
  type LucideProps,
} from "lucide-react";
import { NodeType } from "@/types";
import React from "react";

/**
 * 根据 node_type 返回对应的 Lucide 图标组件
 * @param nodeType - 节点类型：topic | task | resource
 * @param className - 可选的自定义 className
 */
export const getNodeTypeIcon = (
  nodeType: NodeType,
  className = "h-3.5 w-3.5"
): React.ReactElement<LucideProps> => {
  const iconProps = { className };
  switch (nodeType) {
    case "topic":
      return React.createElement(Tag, iconProps);
    case "task":
      return React.createElement(CheckSquare, iconProps);
    case "resource":
      return React.createElement(FileText, iconProps);
  }
};

/**
 * 根据 node_type 返回对应的显示标签
 */
export const getNodeTypeLabel = (nodeType: NodeType): string => {
  switch (nodeType) {
    case "topic":
      return "Topic";
    case "task":
      return "Task";
    case "resource":
      return "Resource";
  }
};
