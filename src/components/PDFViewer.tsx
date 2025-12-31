import { useState, useRef, useCallback, useEffect } from "react";
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  AreaHighlight,
  MonitoredHighlightContainer,
  useHighlightContainerContext,
  usePdfHighlighterContext,
} from "react-pdf-highlighter-extended";
import type {
  Highlight,
  ScaledPosition,
  Content,
  PdfHighlighterUtils,
} from "react-pdf-highlighter-extended";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

// 动态导入 pdfjs-dist 以配置 worker
let pdfjsLib: any = null;

const configurePdfWorker = async () => {
  if (!pdfjsLib) {
    // 动态导入 pdfjs-dist
    pdfjsLib = await import("pdfjs-dist");
    // 配置 worker 路径
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
};

interface PDFViewerProps {
  url: string;
  displayName?: string;
}

// 高亮容器组件
interface HighlightContainerProps {
  onDelete: (id: string) => void;
}

const HighlightContainer = ({ onDelete }: HighlightContainerProps) => {
  const { highlight, isScrolledTo, highlightBindings } =
    useHighlightContainerContext();

  const { toggleEditInProgress, setTip } = usePdfHighlighterContext();

  const isTextHighlight = !highlight.content?.image;

  const component = isTextHighlight ? (
    <TextHighlight isScrolledTo={isScrolledTo} highlight={highlight} />
  ) : (
    <AreaHighlight
      isScrolledTo={isScrolledTo}
      highlight={highlight}
      onChange={() => {
        // 编辑完成后关闭编辑模式
        toggleEditInProgress?.(false);
      }}
      bounds={highlightBindings.textLayer}
      onEditStart={() => toggleEditInProgress?.(true)}
    />
  );

  // 高亮提示内容
  const highlightTip = {
    position: highlight.position,
    content: (
      <div className="Tip__card">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-sm font-medium">高亮内容</div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => {
              onDelete(highlight.id);
              setTip?.(null);
            }}
          >
            ×
          </Button>
        </div>
        {highlight.content?.text && (
          <div className="text-xs text-muted-foreground line-clamp-3">
            {highlight.content.text}
          </div>
        )}
      </div>
    ),
  };

  return (
    <MonitoredHighlightContainer highlightTip={highlightTip}>
      {component}
    </MonitoredHighlightContainer>
  );
};

// 选择提示组件
const SelectionTip = ({ onConfirm }: { onConfirm: () => void }) => {
  const { setTip } = usePdfHighlighterContext();

  return (
    <div className="Tip">
      <div className="flex gap-2">
        <Button size="sm" onClick={onConfirm}>
          ✓ 高亮
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setTip?.(null);
          }}
        >
          取消
        </Button>
      </div>
    </div>
  );
};

export function PDFViewer({ url, displayName: _displayName }: PDFViewerProps) {
  const [highlights, setHighlights] = useState<Array<Highlight>>([]);
  const [workerReady, setWorkerReady] = useState(false);
  const highlighterUtilsRef = useRef<PdfHighlighterUtils | undefined>(
    undefined
  );

  // 配置 PDF worker
  useEffect(() => {
    configurePdfWorker().then(() => setWorkerReady(true));
  }, []);

  const addHighlight = useCallback(
    (position: ScaledPosition, content: Content) => {
      const newHighlight: Highlight = {
        id: String(Date.now()),
        position,
        content,
      };
      setHighlights((prev) => [...prev, newHighlight]);
    },
    []
  );

  const deleteHighlight = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // 等待 worker 配置完成
  if (!workerReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="animate-spin text-4xl mb-4">⟳</div>
        <p className="text-lg font-medium">正在初始化 PDF 引擎...</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-wrapper">
      <PdfLoader document={url}>
        {(pdfDocument) => (
          <PdfHighlighter
            pdfDocument={pdfDocument}
            enableAreaSelection={(event) => event.altKey}
            highlights={highlights}
            utilsRef={(utils) => {
              highlighterUtilsRef.current = utils;
            }}
            selectionTip={
              <SelectionTip
                onConfirm={() => {
                  const selection =
                    highlighterUtilsRef.current?.getCurrentSelection?.();
                  if (selection) {
                    const { position, content } = selection;
                    addHighlight(position, content);
                    // 创建虚影高亮
                    selection.makeGhostHighlight();
                    // 隐藏提示
                    highlighterUtilsRef.current?.setTip(null);
                  }
                }}
              />
            }
          >
            <HighlightContainer onDelete={deleteHighlight} />
          </PdfHighlighter>
        )}
      </PdfLoader>

      {/* 顶部工具栏 - 仅在有高亮时显示 */}
      {highlights.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-background/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg">
          <div className="flex items-center gap-2 px-2">
            <Badge variant="secondary" className="text-xs">
              {highlights.length} 个高亮
            </Badge>
          </div>
          <div className="h-6 w-px bg-border" />
          <Button size="sm" variant="ghost" onClick={() => setHighlights([])}>
            清除高亮
          </Button>
        </div>
      )}

      {/* 底部提示 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-background/80 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
        选中文本添加高亮 · 按住 Alt/Option 框选区域
      </div>
    </div>
  );
}
