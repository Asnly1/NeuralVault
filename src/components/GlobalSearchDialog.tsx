import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { SearchBar } from "./SearchBar";
import { NodeRecord } from "@/types";

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectResult: (node: NodeRecord) => void;
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
  onSelectResult,
}: GlobalSearchDialogProps) {
  const handleSelect = async (
    nodeId: number,
    nodeType: string,
    fullNode?: NodeRecord
  ) => {
    if (fullNode) {
      onSelectResult(fullNode);
    } else {
      // 对于语义搜索，需要获取完整节点信息
      // 这里简化处理，创建部分 NodeRecord
      const partialNode = {
        node_id: nodeId,
        node_type: nodeType,
      } as NodeRecord;
      onSelectResult(partialNode);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0">
        <div className="p-4">
          <SearchBar onSelectResult={handleSelect} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
