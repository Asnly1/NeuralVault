import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageType, navItems } from "../types";

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <aside className="flex h-screen w-16 flex-col items-center border-r border-border bg-card py-4">
        {/* Brand Logo */}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
          N
        </div>

        <Separator className="my-4 w-10" />

        {/* Navigation */}
        <nav className="flex flex-1 flex-col items-center gap-2">
          {navItems.map((item) => (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <Button
                  variant={currentPage === item.key ? "secondary" : "ghost"}
                  size="icon"
                  className={cn(
                    "h-10 w-10 text-lg",
                    currentPage === item.key && "bg-secondary"
                  )}
                  onClick={() => onNavigate(item.key)}
                >
                  {item.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        {/* User Avatar */}
        <div className="mt-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-9 w-9 cursor-pointer">
                <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                  U
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              用户
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
