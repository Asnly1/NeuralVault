import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";

import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  Settings,
  Search,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { PageType, navItems } from "../types";

import { useLanguage } from "@/contexts/LanguageContext";

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
  isCollapsed: boolean;
  width: number;
  onToggleCollapse: () => void;
  onWidthChange: (width: number) => void;
}

const MIN_WIDTH = 150;
const MAX_WIDTH = 400;

export function Sidebar({ 
  currentPage, 
  onNavigate, 
  isCollapsed, 
  width, 
  onToggleCollapse, 
  onWidthChange 
}: SidebarProps) {
  const { t } = useLanguage();
  const [isResizing, setIsResizing] = useState(false);
  const [tempWidth, setTempWidth] = useState<number | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Icon mapping for each page type
  const iconMap: Record<PageType, React.ReactNode> = {
    dashboard: <LayoutDashboard className="h-4 w-4" />,
    workspace: <Briefcase className="h-4 w-4" />,
    calendar: <Calendar className="h-4 w-4" />,
    settings: <Settings className="h-4 w-4" />,
  };

  // Handle mouse down on resize handle
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setTempWidth(width); // Initialize temp width
  };

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        // Only update local state during drag for smooth performance
        setTempWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      // Save to parent state and localStorage only when drag ends
      if (tempWidth !== null) {
        onWidthChange(tempWidth);
      }
      setIsResizing(false);
      setTempWidth(null);
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

  // Use temp width during drag for better performance
  const currentWidth = tempWidth !== null ? tempWidth : width;

  return (
    <aside 
      ref={sidebarRef}
      style={{ width: `${currentWidth}px` }}
      className={cn(
        "bg-sidebar border-r border-border flex flex-col h-full shrink-0 relative",
        !isResizing && "transition-all duration-300" // Disable transition during drag
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

      {/* Search / Quick Actions */}
      <div className="px-3 py-2">
        <div className="relative group cursor-pointer">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <div className="h-8 w-full rounded-md bg-muted/50 border border-transparent px-8 py-1.5 text-xs text-muted-foreground group-hover:bg-muted group-hover:border-border/50 transition-all flex items-center">
            {t("sidebar", "searchPlaceholder")}
          </div>
        </div>
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
                ? "bg-accent/80 text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
            )}
            onClick={() => onNavigate(item.key)}
          >
            <span className={cn("mr-2", currentPage === item.key ? "text-foreground" : "text-muted-foreground")}>
              {iconMap[item.key]}
            </span>
            {t("sidebar", item.key)}
          </Button>
        ))}

        {/* Favorites Section (Placeholder) */}
        <div className="mt-6">
          <div className="text-[11px] font-medium text-muted-foreground px-2 py-1.5 mb-0.5">
            {t("sidebar", "favorites").toUpperCase()}
          </div>
          <div className="px-2 py-1">
             <span className="text-xs text-muted-foreground/60 pl-2">• &nbsp; {t("sidebar", "noFavorites")}</span>
          </div>
        </div>
      </nav>

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
