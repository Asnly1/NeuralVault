import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { linkNodes, unlinkNodes } from "@/api";
import type { EdgeRecord, NodeRecord, RelationType } from "@/types";

type Point = { x: number; y: number };

interface GraphPanelProps {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  loading: boolean;
  error: string | null;
  onNodeClick: (node: NodeRecord) => void;
  onRefresh: () => Promise<void>;
}

const NODE_RADIUS = 18;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.2;
const DRAG_THRESHOLD = 4;

const nodePalette: Record<NodeRecord["node_type"], { fill: string; stroke: string }> = {
  topic: {
    fill: "hsl(var(--chart-4) / 0.25)",
    stroke: "hsl(var(--chart-4) / 0.85)",
  },
  task: {
    fill: "hsl(var(--chart-1) / 0.25)",
    stroke: "hsl(var(--chart-1) / 0.85)",
  },
  resource: {
    fill: "hsl(var(--chart-2) / 0.25)",
    stroke: "hsl(var(--chart-2) / 0.85)",
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const truncateLabel = (value: string, max = 12) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const normalizeEdge = (
  relationType: RelationType,
  sourceId: number,
  targetId: number
) => {
  if (relationType === "related_to" && sourceId > targetId) {
    return { sourceId: targetId, targetId: sourceId };
  }
  return { sourceId, targetId };
};

const buildLayout = (
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  width: number,
  height: number
): Map<number, Point> => {
  const positions = new Map<number, Point>();
  if (nodes.length === 0 || width === 0 || height === 0) {
    return positions;
  }

  const containsEdges = edges.filter((edge) => edge.relation_type === "contains");
  const childrenMap = new Map<number, number[]>();
  const incomingCount = new Map<number, number>();

  for (const edge of containsEdges) {
    const list = childrenMap.get(edge.source_node_id) ?? [];
    list.push(edge.target_node_id);
    childrenMap.set(edge.source_node_id, list);
    incomingCount.set(
      edge.target_node_id,
      (incomingCount.get(edge.target_node_id) ?? 0) + 1
    );
  }

  const roots = nodes.filter((node) => !incomingCount.has(node.node_id));
  const queue: Array<{ id: number; depth: number }> = roots.map((node) => ({
    id: node.node_id,
    depth: 0,
  }));
  const depthMap = new Map<number, number>();

  for (const root of roots) {
    depthMap.set(root.node_id, 0);
  }

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const children = childrenMap.get(id) ?? [];
    for (const childId of children) {
      const nextDepth = depth + 1;
      const existing = depthMap.get(childId);
      if (existing === undefined || nextDepth < existing) {
        depthMap.set(childId, nextDepth);
        queue.push({ id: childId, depth: nextDepth });
      }
    }
  }

  for (const node of nodes) {
    if (!depthMap.has(node.node_id)) {
      depthMap.set(node.node_id, 0);
    }
  }

  const levels = new Map<number, NodeRecord[]>();
  for (const node of nodes) {
    const depth = depthMap.get(node.node_id) ?? 0;
    const list = levels.get(depth) ?? [];
    list.push(node);
    levels.set(depth, list);
  }

  const levelKeys = Array.from(levels.keys()).sort((a, b) => a - b);
  const maxPerLevel = Math.max(
    1,
    ...Array.from(levels.values()).map((list) => list.length)
  );

  const gapX = clamp(width / (maxPerLevel + 1), 140, 240);
  const gapY = clamp(height / (levelKeys.length + 1), 120, 220);
  const startY = -((levelKeys.length - 1) * gapY) / 2;

  levelKeys.forEach((depth, idx) => {
    const row = levels.get(depth) ?? [];
    row.sort((a, b) => a.title.localeCompare(b.title));
    const rowWidth = (row.length - 1) * gapX;
    const startX = -rowWidth / 2;
    row.forEach((node, index) => {
      positions.set(node.node_id, {
        x: startX + index * gapX,
        y: startY + idx * gapY,
      });
    });
  });

  return positions;
};

export function GraphPanel({
  nodes,
  edges,
  loading,
  error,
  onNodeClick,
  onRefresh,
}: GraphPanelProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [positions, setPositions] = useState<Map<number, Point>>(new Map());
  const [linkMode, setLinkMode] = useState(false);
  const [relationType, setRelationType] = useState<RelationType>("contains");
  const [linkPreview, setLinkPreview] = useState<{ sourceId: number; point: Point } | null>(
    null
  );
  const [hoverTargetId, setHoverTargetId] = useState<number | null>(null);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [isUpdatingEdge, setIsUpdatingEdge] = useState(false);

  const userMovedRef = useRef(false);
  const lastLayoutKeyRef = useRef("");
  const dragStateRef = useRef<{
    mode: "pan" | "node" | "link";
    pointerId: number;
    startScreen: Point;
    startGraph: Point;
    startPan?: Point;
    nodeId?: number;
    origin?: Point;
    moved: boolean;
  } | null>(null);

  const nodeMap = useMemo(() => {
    const map = new Map<number, NodeRecord>();
    nodes.forEach((node) => map.set(node.node_id, node));
    return map;
  }, [nodes]);

  const layoutKey = useMemo(() => {
    const nodeIds = nodes.map((node) => node.node_id).sort((a, b) => a - b).join(",");
    const containsPairs = edges
      .filter((edge) => edge.relation_type === "contains")
      .map((edge) => `${edge.source_node_id}-${edge.target_node_id}`)
      .sort()
      .join(",");
    return `${nodeIds}|${containsPairs}`;
  }, [nodes, edges]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect) {
        setViewport({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!viewport.width || !viewport.height) return;
    const shouldRelayout =
      layoutKey !== lastLayoutKeyRef.current && (!userMovedRef.current || positions.size === 0);
    if (!shouldRelayout) return;

    const next = buildLayout(nodes, edges, viewport.width, viewport.height);
    setPositions(next);
    lastLayoutKeyRef.current = layoutKey;
    userMovedRef.current = false;
    if (next.size > 0) {
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      setPan({ x: centerX, y: centerY });
      setScale(1);
    }
  }, [layoutKey, nodes, edges, viewport.width, viewport.height, positions.size]);

  const fitToView = useCallback(
    (override?: Map<number, Point>) => {
      const map = override ?? positions;
      if (map.size === 0 || !viewport.width || !viewport.height) return;
      const points = Array.from(map.values());
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const maxY = Math.max(...points.map((p) => p.y));
      const padding = 120;
      const graphWidth = maxX - minX + padding;
      const graphHeight = maxY - minY + padding;
      const nextScale = clamp(
        Math.min(viewport.width / graphWidth, viewport.height / graphHeight),
        ZOOM_MIN,
        ZOOM_MAX
      );
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      setScale(nextScale);
      setPan({
        x: viewport.width / 2 - centerX * nextScale,
        y: viewport.height / 2 - centerY * nextScale,
      });
    },
    [positions, viewport.width, viewport.height]
  );

  const screenToGraph = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / scale,
        y: (clientY - rect.top - pan.y) / scale,
      };
    },
    [pan.x, pan.y, scale]
  );

  const findNodeAtPoint = useCallback(
    (point: Point, excludeId?: number) => {
      let hit: number | null = null;
      let minDist = Infinity;
      for (const node of nodes) {
        if (node.node_id === excludeId) continue;
        const pos = positions.get(node.node_id);
        if (!pos) continue;
        const dx = pos.x - point.x;
        const dy = pos.y - point.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= NODE_RADIUS + 6 && dist < minDist) {
          minDist = dist;
          hit = node.node_id;
        }
      }
      return hit;
    },
    [nodes, positions]
  );

  const handleEdgeUpdate = useCallback(
    async (sourceId: number, targetId: number) => {
      if (isUpdatingEdge) return;
      setEdgeError(null);
      setIsUpdatingEdge(true);
      let linkSucceeded = false;
      try {
        const normalized = normalizeEdge(relationType, sourceId, targetId);
        const hasSameEdge = edges.some((edge) => {
          if (edge.relation_type !== relationType) return false;
          if (relationType === "related_to") {
            const min = Math.min(sourceId, targetId);
            const max = Math.max(sourceId, targetId);
            return edge.source_node_id === min && edge.target_node_id === max;
          }
          return (
            edge.source_node_id === normalized.sourceId &&
            edge.target_node_id === normalized.targetId
          );
        });
        if (hasSameEdge) return;

        const conflictingEdges = edges.filter((edge) => {
          if (relationType === "contains") {
            return (
              edge.relation_type === "related_to" &&
              ((edge.source_node_id === sourceId &&
                edge.target_node_id === targetId) ||
                (edge.source_node_id === targetId &&
                  edge.target_node_id === sourceId))
            );
          }
          return (
            edge.relation_type === "contains" &&
            ((edge.source_node_id === sourceId &&
              edge.target_node_id === targetId) ||
              (edge.source_node_id === targetId &&
                edge.target_node_id === sourceId))
          );
        });

        await linkNodes(normalized.sourceId, normalized.targetId, relationType);
        linkSucceeded = true;

        for (const edge of conflictingEdges) {
          await unlinkNodes(
            edge.source_node_id,
            edge.target_node_id,
            edge.relation_type
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("warehouse", "graphEdgeUpdateFailed");
        setEdgeError(message);
      } finally {
        setIsUpdatingEdge(false);
        if (linkSucceeded) {
          await onRefresh();
        }
      }
    },
    [edges, relationType, onRefresh, isUpdatingEdge, t]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      dragStateRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        startScreen: { x: event.clientX, y: event.clientY },
        startGraph: { x: 0, y: 0 },
        startPan: { ...pan },
        moved: false,
      };
      svgRef.current?.setPointerCapture(event.pointerId);
    },
    [pan]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startScreen.x;
      const dy = event.clientY - drag.startScreen.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        drag.moved = true;
      }

      if (drag.mode === "pan" && drag.startPan) {
        setPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
        return;
      }

      const graphPoint = screenToGraph(event.clientX, event.clientY);

      if (drag.mode === "node" && drag.nodeId && drag.origin) {
        const offsetX = graphPoint.x - drag.startGraph.x;
        const offsetY = graphPoint.y - drag.startGraph.y;
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(drag.nodeId!, {
            x: drag.origin!.x + offsetX,
            y: drag.origin!.y + offsetY,
          });
          return next;
        });
        userMovedRef.current = true;
      }

      if (drag.mode === "link" && drag.nodeId) {
        setLinkPreview({ sourceId: drag.nodeId, point: graphPoint });
        setHoverTargetId(findNodeAtPoint(graphPoint, drag.nodeId));
      }
    },
    [screenToGraph, findNodeAtPoint]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      svgRef.current?.releasePointerCapture(event.pointerId);
      dragStateRef.current = null;

      if (drag.mode === "node" && drag.nodeId && !drag.moved) {
        const node = nodeMap.get(drag.nodeId);
        if (node) onNodeClick(node);
      }

      if (drag.mode === "link" && drag.nodeId) {
        const graphPoint = screenToGraph(event.clientX, event.clientY);
        const targetId = findNodeAtPoint(graphPoint, drag.nodeId);
        if (!drag.moved) {
          const node = nodeMap.get(drag.nodeId);
          if (node) onNodeClick(node);
        } else if (targetId && targetId !== drag.nodeId) {
          void handleEdgeUpdate(drag.nodeId, targetId);
        }
      }

      setLinkPreview(null);
      setHoverTargetId(null);
    },
    [findNodeAtPoint, handleEdgeUpdate, nodeMap, onNodeClick, screenToGraph]
  );

  const handleNodePointerDown = useCallback(
    (nodeId: number, event: React.PointerEvent<SVGGElement>) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      const graphPoint = screenToGraph(event.clientX, event.clientY);
      if (linkMode) {
        dragStateRef.current = {
          mode: "link",
          pointerId: event.pointerId,
          startScreen: { x: event.clientX, y: event.clientY },
          startGraph: graphPoint,
          nodeId,
          moved: false,
        };
        setLinkPreview({ sourceId: nodeId, point: graphPoint });
      } else {
        const origin = positions.get(nodeId) ?? graphPoint;
        dragStateRef.current = {
          mode: "node",
          pointerId: event.pointerId,
          startScreen: { x: event.clientX, y: event.clientY },
          startGraph: graphPoint,
          nodeId,
          origin,
          moved: false,
        };
      }
      svgRef.current?.setPointerCapture(event.pointerId);
    },
    [linkMode, positions, screenToGraph]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = clamp(scale * delta, ZOOM_MIN, ZOOM_MAX);
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const graphX = (mouseX - pan.x) / scale;
      const graphY = (mouseY - pan.y) / scale;
      setScale(nextScale);
      setPan({
        x: mouseX - graphX * nextScale,
        y: mouseY - graphY * nextScale,
      });
    },
    [pan.x, pan.y, scale]
  );

  const visibleEdges = useMemo(() => {
    return edges.filter((edge) => {
      return positions.has(edge.source_node_id) && positions.has(edge.target_node_id);
    });
  }, [edges, positions]);

  const emptyState = !loading && !error && nodes.length === 0;

  return (
    <div className="flex-1 min-h-0 relative border-t">
      <div
        ref={containerRef}
        className="absolute inset-0 bg-muted/30"
        style={{
          backgroundImage:
            "radial-gradient(hsl(var(--border)) 0.5px, transparent 0.5px)",
          backgroundSize: "18px 18px",
        }}
      />

      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <defs>
          <marker
            id="graph-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--foreground) / 0.45)" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
          {visibleEdges.map((edge) => {
            const source = positions.get(edge.source_node_id)!;
            const target = positions.get(edge.target_node_id)!;
            const isRelated = edge.relation_type === "related_to";
            return (
              <line
                key={edge.edge_id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={
                  isRelated
                    ? "hsl(var(--muted-foreground) / 0.6)"
                    : "hsl(var(--foreground) / 0.35)"
                }
                strokeWidth={1.4}
                strokeDasharray={isRelated ? "5 5" : undefined}
                markerEnd={isRelated ? undefined : "url(#graph-arrow)"}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {linkPreview && (
            <line
              x1={positions.get(linkPreview.sourceId)?.x ?? 0}
              y1={positions.get(linkPreview.sourceId)?.y ?? 0}
              x2={linkPreview.point.x}
              y2={linkPreview.point.y}
              stroke="hsl(var(--primary) / 0.55)"
              strokeWidth={1.6}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {nodes.map((node) => {
            const position = positions.get(node.node_id);
            if (!position) return null;
            const palette = nodePalette[node.node_type];
            const isHovered = hoverTargetId === node.node_id;
            return (
              <g
                key={node.node_id}
                transform={`translate(${position.x} ${position.y})`}
                onPointerDown={(event) => handleNodePointerDown(node.node_id, event)}
                className={linkMode ? "cursor-crosshair" : "cursor-grab"}
              >
                <title>{node.title || t("common", "untitled")}</title>
                <circle
                  r={NODE_RADIUS}
                  fill={palette.fill}
                  stroke={isHovered ? "hsl(var(--primary))" : palette.stroke}
                  strokeWidth={isHovered ? 2.2 : 1.6}
                />
                <text
                  y={4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="hsl(var(--foreground))"
                >
                  {truncateLabel(node.title || t("common", "untitled"))}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md border bg-background/80 backdrop-blur px-2 py-1">
        <Button
          size="sm"
          variant={linkMode ? "ghost" : "secondary"}
          onClick={() => setLinkMode(false)}
        >
          {t("warehouse", "graphModePan")}
        </Button>
        <Button
          size="sm"
          variant={linkMode ? "secondary" : "ghost"}
          onClick={() => setLinkMode(true)}
        >
          {t("warehouse", "graphModeLink")}
        </Button>
        <div className="w-px h-5 bg-border" />
        <Button
          size="sm"
          variant={relationType === "contains" ? "secondary" : "ghost"}
          onClick={() => setRelationType("contains")}
          disabled={!linkMode}
        >
          {t("warehouse", "graphRelationContains")}
        </Button>
        <Button
          size="sm"
          variant={relationType === "related_to" ? "secondary" : "ghost"}
          onClick={() => setRelationType("related_to")}
          disabled={!linkMode}
        >
          {t("warehouse", "graphRelationRelated")}
        </Button>
        {isUpdatingEdge && (
          <Badge variant="secondary" className="text-[10px]">
            {t("warehouse", "graphUpdating")}
          </Badge>
        )}
      </div>

      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-md border bg-background/80 backdrop-blur px-2 py-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setScale((prev) => clamp(prev * 1.1, ZOOM_MIN, ZOOM_MAX))}
        >
          {t("warehouse", "graphZoomIn")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setScale((prev) => clamp(prev * 0.9, ZOOM_MIN, ZOOM_MAX))}
        >
          {t("warehouse", "graphZoomOut")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => fitToView()}>
          {t("warehouse", "graphFit")}
        </Button>
      </div>

      <div className="absolute bottom-3 left-3 text-xs text-muted-foreground flex items-center gap-2">
        <span>{t("warehouse", "graphHint")}</span>
        {edgeError && <span className="text-destructive">{edgeError}</span>}
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t("common", "loading")}...
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive">
          {error}
        </div>
      )}

      {emptyState && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t("warehouse", "graphEmpty")}
        </div>
      )}
    </div>
  );
}
