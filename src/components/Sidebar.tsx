import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import {
  LayoutDashboard,
  Briefcase,
  Settings,
  Search,
  ChevronsLeft,
} from "lucide-react";
import { PageType, navItems } from "../types";

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
}

const iconMap: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  workspace: <Briefcase className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
};

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="group flex h-screen w-60 flex-col border-r border-border bg-[#F7F7F5] dark:bg-[#202020] transition-all duration-300">
      {/* Workspace / User Header */}
      <div className="flex h-12 items-center px-4 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors m-2 rounded-md">
        <Avatar className="h-5 w-5 mr-3 rounded-sm">
          <AvatarFallback className="rounded-sm bg-orange-500 text-white text-[10px]">
            N
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium text-foreground truncate">
          NeuralVault
        </span>
        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
           <ChevronsLeft className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Action List (Search, etc - Aesthetic only for now) */}
      <div className="px-2 pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground font-normal h-8 px-3"
        >
          <Search className="mr-2 h-4 w-4" />
          <span className="text-xs">Search</span>
          <span className="ml-auto text-[10px] opacity-60">⌘K</span>
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Menu
        </div>
        {navItems.map((item) => (
          <Button
            key={item.key}
            variant="ghost"
            size="sm"
            onClick={() => onNavigate(item.key)}
            className={cn(
              "w-full justify-start h-8 px-3 font-medium text-sm transition-colors",
              currentPage === item.key
                ? "bg-black/5 dark:bg-white/10 text-foreground"
                : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
            )}
          >
            <span className="mr-2 opacity-80">
              {iconMap[item.key] || <div className="h-4 w-4" />}
            </span>
            {item.label}
          </Button>
        ))}

        {/* Placeholder for favorites or other sections */}
        <div className="mt-6 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider group-hover:block">
          Favorites
        </div>
        <Button
           variant="ghost"
           size="sm" 
           className="w-full justify-start text-muted-foreground font-normal h-8 px-3"
           disabled
        >
          <div className="mr-2 h-4 w-4 flex items-center justify-center">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300"></span>
          </div>
          <span className="text-sm opacity-60">No favorites yet</span>
        </Button>
      </nav>

    </aside>
  );
}
