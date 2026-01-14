import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNodeTypeIcon } from "@/lib/nodeUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UseLinkNodesReturn } from "@/hooks/useLinkNodes";

interface LinkNodeDialogProps extends UseLinkNodesReturn {}

export function LinkNodeDialog({
  isOpen,
  linkingNode,
  linkTargets,
  linkedParents,
  selectedParentId,
  loading,
  submitting,
  error,
  closeDialog,
  setSelectedParent,
  createLink,
}: LinkNodeDialogProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("warehouse", "linkNode")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {linkingNode && (
            <div className="text-xs text-muted-foreground">
              {t("warehouse", "currentNode")}:{" "}
              <span className="text-foreground">
                {linkingNode.title || t("common", "untitled")}
              </span>
            </div>
          )}

          {linkedParents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("warehouse", "linkExistingParents")}
              </p>
              <div className="flex flex-wrap gap-2">
                {linkedParents.map((parent) => (
                  <Badge
                    key={parent.node_id}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {getNodeTypeIcon(parent.node_type, "h-3 w-3")}
                    <span className="max-w-[200px] truncate">
                      {parent.title || t("common", "untitled")}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="warehouse-link-target">
              {t("warehouse", "linkTarget")}
            </Label>
            <Select
              value={selectedParentId}
              onValueChange={setSelectedParent}
              disabled={loading}
            >
              <SelectTrigger id="warehouse-link-target">
                <SelectValue placeholder={t("warehouse", "linkTargetPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {loading ? (
                  <SelectItem value="loading" disabled>
                    {t("warehouse", "linkLoadingTargets")}
                  </SelectItem>
                ) : linkTargets.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    {t("warehouse", "linkNoTargets")}
                  </SelectItem>
                ) : (
                  linkTargets.map((target) => (
                    <SelectItem key={target.node_id} value={String(target.node_id)}>
                      <div className="flex items-center gap-2">
                        {getNodeTypeIcon(target.node_type, "h-3.5 w-3.5")}
                        <span className="truncate">
                          {target.title || t("common", "untitled")}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={closeDialog}
            disabled={submitting}
          >
            {t("warehouse", "linkCancel")}
          </Button>
          <Button
            onClick={() => void createLink()}
            disabled={!selectedParentId || submitting || loading}
          >
            {submitting ? t("common", "loading") : t("warehouse", "linkConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
