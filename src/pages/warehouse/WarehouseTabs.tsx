import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, Package, Tag, CheckSquare, FileText } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export type WarehouseTab = "all" | "topics" | "tasks" | "resources" | "inbox";

const tabConfig: { key: WarehouseTab; icon: React.ReactNode }[] = [
  { key: "all", icon: <Package className="h-4 w-4" /> },
  { key: "topics", icon: <Tag className="h-4 w-4" /> },
  { key: "tasks", icon: <CheckSquare className="h-4 w-4" /> },
  { key: "resources", icon: <FileText className="h-4 w-4" /> },
  { key: "inbox", icon: <Inbox className="h-4 w-4" /> },
];

interface WarehouseTabsProps {
  activeTab: WarehouseTab;
  onTabChange: (tab: WarehouseTab) => void;
  inboxCount: number;
}

export function WarehouseTabs({
  activeTab,
  onTabChange,
  inboxCount,
}: WarehouseTabsProps) {
  const { t } = useLanguage();

  return (
    <div className="flex border-b px-4 py-2 gap-2">
      {tabConfig.map(({ key, icon }) => (
        <Button
          key={key}
          variant={activeTab === key ? "default" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => onTabChange(key)}
        >
          {icon}
          {t("warehouse", key)}
          {key === "inbox" && inboxCount > 0 && activeTab !== "inbox" && (
            <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
              {inboxCount}
            </Badge>
          )}
        </Button>
      ))}
    </div>
  );
}
