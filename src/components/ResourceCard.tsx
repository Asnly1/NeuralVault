import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  FileText, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  File, 
  MoreHorizontal,
  Paperclip,
  CheckCircle2,
  Circle,
  Trash2
} from "lucide-react";
import { Resource, Task, ResourceType } from "../types";

interface ResourceCardProps {
  resource: Resource;
  tasks?: Task[];
  onLinkToTask?: (resourceId: number, taskId: number) => Promise<void>;
  onDelete?: (resourceId: number) => Promise<void>;
}

const iconMap: Record<ResourceType, React.ReactNode> = {
  text: <FileText className="h-4 w-4 text-orange-500" />,
  image: <ImageIcon className="h-4 w-4 text-purple-500" />,
  pdf: <FileText className="h-4 w-4 text-red-500" />,
  url: <LinkIcon className="h-4 w-4 text-blue-500" />,
  epub: <File className="h-4 w-4 text-green-500" />,
  other: <Paperclip className="h-4 w-4 text-gray-500" />,
};

export function ResourceCard({
  resource,
  tasks = [],
  onLinkToTask,
  onDelete,
}: ResourceCardProps) {
  const [linking, setLinking] = useState(false);

  const handleSelectTask = async (taskId: number) => {
    if (onLinkToTask && !linking) {
      setLinking(true);
      try {
        await onLinkToTask(resource.resource_id, taskId);
      } finally {
        setLinking(false);
      }
    }
  };

  return (
    <Card className="group transition-all border-border shadow-sm hover:shadow-none hover:bg-muted/40 overflow-hidden relative">
      <CardContent className="flex items-center gap-3 p-3">
        {/* File Icon */}
        <div className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          {iconMap[resource.file_type] || <Paperclip className="h-4 w-4" />}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <h4 className="text-sm font-medium truncate text-foreground/90 group-hover:text-foreground transition-colors">
            {resource.display_name || "Untitled"}
          </h4>
          {resource.created_at && (
            <span className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors">
              {resource.created_at.toLocaleDateString("zh-CN")}
            </span>
          )}
        </div>

        {/* Actions Group */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Link Task */}
          {onLinkToTask && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={linking || tasks.length === 0}
                >
                  {linking ? (
                    <span className="animate-spin text-xs">⟳</span>
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Link to task</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {tasks.length > 0 ? tasks.map((task) => (
                  <DropdownMenuItem
                    key={task.task_id}
                    onClick={() => handleSelectTask(task.task_id)}
                    className="cursor-pointer gap-2"
                  >
                    {task.status === "todo" ? <Circle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3 text-green-500" />}
                    <span className="truncate text-sm">{task.title || "Untitled"}</span>
                  </DropdownMenuItem>
                )) : (
                   <div className="p-2 text-xs text-muted-foreground text-center">No active tasks</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

           {/* Delete Action */}
           {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(resource.resource_id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
