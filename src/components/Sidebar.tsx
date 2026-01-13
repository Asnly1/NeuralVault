import { cn } from "@/lib/utils";
import { getNodeTypeIcon } from "@/lib/nodeUtils";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect, useCallback } from "react";

import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Package,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { PageType, navItems, NodeRecord } from "../types";
import { fetchPinnedNodes, processPendingResources, getResourceById } from "../api";

import { useLanguage } from "@/contexts/LanguageContext";
import { SearchBar } from "./SearchBar";
import { useEmbeddingStatus } from "@/hooks";

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
  isCollapsed: boolean;
  width: number;
  onToggleCollapse: () => void;
  onWidthChange: (width: number) => void;
  onSelectNode?: (node: NodeRecord) => void;
  refreshKey?: number; // 用于强制刷新收藏节点
}

const MIN_WIDTH = 150;
const MAX_WIDTH = 400;

export function Sidebar({
  currentPage,
  onNavigate,
  isCollapsed,
  width,
  onToggleCollapse,
  onWidthChange,
  onSelectNode,
  refreshKey,
}: SidebarProps) {
  const { t } = useLanguage();
  const { isProcessing } = useEmbeddingStatus();
  const [isResizing, setIsResizing] = useState(false);
  const [tempWidth, setTempWidth] = useState<number | null>(null);
  const tempWidthRef = useRef<number | null>(null);
  const [pinnedNodes, setPinnedNodes] = useState<NodeRecord[]>([]);

  // 加载收藏节点
  const loadPinnedNodes = useCallback(async () => {
    try {
      const nodes = await fetchPinnedNodes();
      setPinnedNodes(nodes);
    } catch (err) {
      console.error("Failed to load pinned nodes:", err);
    }
  }, []);

  const handleProcessResources = useCallback(async () => {
    try {
      await processPendingResources();
    } catch (err) {
      console.error("Failed to process resources:", err);
    }
  }, []);

  useEffect(() => {
    loadPinnedNodes();
  }, [loadPinnedNodes, refreshKey]);

  // Icon mapping for each page type
  const iconMap: Record<PageType, React.ReactNode> = {
    dashboard: <LayoutDashboard className="h-4 w-4" />,
    warehouse: <Package className="h-4 w-4" />,
    workspace: <Briefcase className="h-4 w-4" />,
    calendar: <Calendar className="h-4 w-4" />,
    settings: <Settings className="h-4 w-4" />,
  };

  // Handle mouse down on resize handle
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setTempWidth(width);
    tempWidthRef.current = width;
  };

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setTempWidth(newWidth);
        tempWidthRef.current = newWidth;
      }
    };

    const handleMouseUp = () => {
      if (tempWidthRef.current !== null) {
        onWidthChange(tempWidthRef.current);
      }
      setIsResizing(false);
      setTempWidth(null);
      tempWidthRef.current = null;
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, onWidthChange]);

  // Floating expand button when collapsed
  if (isCollapsed) {
    return (
      <div className="fixed left-0 top-1/2 -translate-y-1/2 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="h-12 w-6 rounded-r-lg rounded-l-none bg-sidebar border border-l-0 border-border hover:bg-accent shadow-lg"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const currentWidth = tempWidth !== null ? tempWidth : width;

  return (
    <aside
      style={{ width: `${currentWidth}px` }}
      className={cn(
        "bg-sidebar border-r border-border flex flex-col h-full shrink-0 relative",
        !isResizing && "transition-all duration-300"
      )}
    >
      {/* Header */}
      <div className="p-4 h-14 flex items-center border-b border-border/40">
        <div className="flex items-center gap-2 px-2 w-full">
          <div className="h-5 w-5 rounded bg-orange-500 flex items-center justify-center text-[10px] text-white font-bold shrink-0">
            N
          </div>
          <span className="font-medium text-sm truncate">NeuralVault</span>
          <ChevronsLeft
            className="ml-auto h-4 w-4 text-muted-foreground/50 hover:text-foreground cursor-pointer transition-colors"
            onClick={onToggleCollapse}
          />
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <SearchBar
          onSelectResult={async (nodeId, _nodeType, fullNode) => {
            if (fullNode) {
              // 关键词搜索已有完整节点
              onSelectNode?.(fullNode);
            } else {
              // 语义搜索需要获取节点信息
              try {
                const node = await getResourceById(nodeId);
                onSelectNode?.(node);
              } catch (err) {
                console.error("Failed to fetch node:", err);
              }
            }
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        <div className="text-[11px] font-medium text-muted-foreground px-2 py-1.5 mb-0.5">
          {t("sidebar", "menu").toUpperCase()}
        </div>
        {navItems.map((item) => (
          <Button
            key={item.key}
            variant="ghost"
            className={cn(
              "w-full justify-start h-8 mb-0.5 text-sm font-normal px-2.5 transition-colors",
              currentPage === item.key
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
            onClick={() => onNavigate(item.key)}
          >
            <span className={cn("mr-2", currentPage === item.key ? "text-sidebar-foreground" : "text-muted-foreground")}>
              {iconMap[item.key]}
            </span>
            {t("sidebar", item.key)}
          </Button>
        ))}

        {/* Favorites Section */}
        <div className="mt-6">
          <div className="text-[11px] font-medium text-muted-foreground px-2 py-1.5 mb-0.5">
            {t("sidebar", "favorites").toUpperCase()}
          </div>
          {pinnedNodes.length === 0 ? (
            <div className="px-2 py-1">
              <span className="text-xs text-muted-foreground/60 pl-2">
                {t("sidebar", "noFavorites")}
              </span>
            </div>
          ) : (
            pinnedNodes.map((node) => (
              <Button
                key={node.node_id}
                variant="ghost"
                className="w-full justify-start h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => onSelectNode?.(node)}
              >
                <span className="mr-2 opacity-70">
                  {getNodeTypeIcon(node.node_type)}
                </span>
                <span className="truncate">{node.title}</span>
              </Button>
            ))
          )}
        </div>
      </nav>

      <div className="px-3 py-3 border-t border-border/40 space-y-2">
        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{t("sidebar", "processingStatus")}</span>
          </div>
        )}

        <Button
          size="sm"
          variant="outline"
          className="w-full justify-center"
          onClick={handleProcessResources}
          disabled={isProcessing}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("sidebar", "processResources")}
        </Button>
      </div>

      {/* Resize Handle */}
      <div
        className={cn(
          "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent transition-colors group",
          isResizing && "bg-accent"
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute top-0 right-0 w-4 h-full -mr-1.5" />
      </div>
    </aside>
  );
}
