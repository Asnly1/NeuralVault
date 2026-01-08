# Phase 5: 前端重构实现计划

## 概述

将前端从旧的 Task/Resource 模型迁移到统一的 Node/Edge 模型，并实现新功能。

## 实现顺序

```
5.1 类型系统更新 ────────────────────────────────────────┐
     │                                                   │
5.2 Rust 后端补充（新增 2 个查询命令）                    │
     │                                                   │
5.3 API 层更新 ──────────────────────────────────────────┤
     │                                                   │
     ├── 5.4 Sidebar 收藏功能                            │
     ├── 5.5 Warehouse 页面                              │
     ├── 5.6 Dashboard Capture/Chat 模式                 │
     └── 5.7 Workspace Pin to Context ───────────────────┘
```

---

## 5.1 类型系统更新

**文件**: `src/types/index.ts`

### 新增 NodeRecord Schema

```typescript
// 新增枚举
export const nodeTypeValues = ["topic", "task", "resource"] as const;
export type NodeType = (typeof nodeTypeValues)[number];

export const reviewStatusValues = ["unreviewed", "reviewed", "rejected"] as const;
export type ReviewStatus = (typeof reviewStatusValues)[number];

export const syncStatusValues = ["pending", "synced", "dirty", "error"] as const;
export type SyncStatus = (typeof syncStatusValues)[number];

// NodeRecord schema（对应 Rust NodeRecord）
export const nodeRecordSchema = z.object({
  node_id: z.number(),
  uuid: z.string(),
  user_id: z.number(),
  title: z.string(),
  summary: z.string().nullable(),
  node_type: z.enum(nodeTypeValues),
  task_status: z.enum(["todo", "done", "cancelled"]).nullable(),
  priority: z.enum(taskPriorityValues).nullable(),
  due_date: z.coerce.date().nullable(),
  done_date: z.coerce.date().nullable(),
  file_hash: z.string().nullable(),
  file_path: z.string().nullable(),
  file_content: z.string().nullable(),
  user_note: z.string().nullable(),
  resource_subtype: z.enum(resourceTypeValues).nullable(),
  source_meta: z.string().nullable(),
  sync_status: z.enum(syncStatusValues),
  processing_stage: z.enum(processingStageValues),
  review_status: z.enum(reviewStatusValues),
  is_pinned: z.boolean(),
  pinned_at: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
  is_deleted: z.boolean(),
  deleted_at: z.string().nullable(),
});

export type NodeRecord = z.infer<typeof nodeRecordSchema>;
```

### 兼容性别名（渐进式迁移）

```typescript
/** @deprecated 使用 NodeRecord 替代，通过 node_id 访问 */
export type Task = NodeRecord;
/** @deprecated 使用 NodeRecord 替代，通过 node_id 访问 */
export type Resource = NodeRecord;
```

### 更新 PageType 和 navItems

```typescript
export type PageType = "dashboard" | "workspace" | "warehouse" | "calendar" | "settings";

export const navItems = [
  { key: "dashboard", icon: "◈", label: "看板" },
  { key: "warehouse", icon: "📦", label: "仓库" },
  { key: "workspace", icon: "⬡", label: "工作台" },
  { key: "calendar", icon: "📅", label: "日历" },
  { key: "settings", icon: "⚙", label: "设置" },
];
```

---

## 5.2 Rust 后端补充

**文件**: `src-tauri/src/db/nodes.rs`

### 新增查询函数

```rust
/// 获取所有收藏节点
pub async fn list_pinned_nodes(pool: &DbPool) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE is_pinned = 1 AND is_deleted = 0 ORDER BY pinned_at DESC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql).fetch_all(pool).await
}

/// 获取所有待审核节点
pub async fn list_unreviewed_nodes(pool: &DbPool) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE review_status = 'unreviewed' AND is_deleted = 0 ORDER BY created_at DESC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql).fetch_all(pool).await
}
```

**文件**: `src-tauri/src/commands/nodes.rs`（新建或在现有文件中添加）

```rust
#[tauri::command]
pub async fn list_pinned_nodes(state: State<'_, AppState>) -> AppResult<Vec<NodeRecord>> {
    Ok(crate::db::list_pinned_nodes(&state.db).await?)
}

#[tauri::command]
pub async fn list_unreviewed_nodes(state: State<'_, AppState>) -> AppResult<Vec<NodeRecord>> {
    Ok(crate::db::list_unreviewed_nodes(&state.db).await?)
}

#[tauri::command]
pub async fn update_node_review_status(
    state: State<'_, AppState>,
    node_id: i64,
    review_status: String,
) -> AppResult<()> {
    let status = match review_status.as_str() {
        "reviewed" => ReviewStatus::Reviewed,
        "rejected" => ReviewStatus::Rejected,
        _ => ReviewStatus::Unreviewed,
    };
    crate::db::update_resource_review_status(&state.db, node_id, status).await?;
    Ok(())
}
```

**文件**: `src-tauri/src/lib.rs` - 注册命令

---

## 5.3 API 层更新

**文件**: `src/api/index.ts`

### 新增 API 函数

```typescript
// 收藏相关
export const fetchPinnedNodes = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("list_pinned_nodes");
  return z.array(nodeRecordSchema).parse(raw);
};

export const updateNodePinned = async (nodeId: number, isPinned: boolean): Promise<void> => {
  await invoke("update_topic_favourite_command", { topicId: nodeId, isFavourite: isPinned });
};

// Inbox 相关
export const fetchUnreviewedNodes = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("list_unreviewed_nodes");
  return z.array(nodeRecordSchema).parse(raw);
};

export const updateNodeReviewStatus = async (
  nodeId: number,
  status: ReviewStatus
): Promise<void> => {
  await invoke("update_node_review_status", { nodeId, reviewStatus: status });
};

// 节点链接（通用）
export const linkNodes = async (
  sourceNodeId: number,
  targetNodeId: number,
  relationType: "contains" | "related_to"
): Promise<void> => {
  await invoke("link_nodes_command", {
    payload: { source_node_id: sourceNodeId, target_node_id: targetNodeId, relation_type: relationType },
  });
};

// Topic 相关
export const fetchAllTopics = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("list_topics_command");
  return z.array(nodeRecordSchema).parse(raw);
};
```

---

## 5.4 Sidebar 收藏功能

**文件**: `src/components/Sidebar.tsx`

### Props 扩展

```typescript
interface SidebarProps {
  // 现有 props...
  onSelectNode?: (node: NodeRecord) => void;
  onRefreshPinned?: () => void;
}
```

### 加载收藏数据

```typescript
const [pinnedNodes, setPinnedNodes] = useState<NodeRecord[]>([]);

useEffect(() => {
  fetchPinnedNodes().then(setPinnedNodes).catch(console.error);
}, []);

// 刷新函数
const refreshPinned = useCallback(async () => {
  const nodes = await fetchPinnedNodes();
  setPinnedNodes(nodes);
}, []);
```

### 更新 Favorites UI

```tsx
{/* Favorites Section */}
<div className="mt-6">
  <div className="text-[11px] font-medium text-muted-foreground px-2 py-1.5 mb-0.5">
    {t("sidebar", "favorites").toUpperCase()}
  </div>
  {pinnedNodes.length === 0 ? (
    <div className="px-2 py-1">
      <span className="text-xs text-muted-foreground/60 pl-2">{t("sidebar", "noFavorites")}</span>
    </div>
  ) : (
    pinnedNodes.map((node) => (
      <Button
        key={node.node_id}
        variant="ghost"
        className="w-full justify-start h-7 text-xs px-2.5"
        onClick={() => onSelectNode?.(node)}
      >
        <span className="mr-2">{getNodeTypeIcon(node.node_type)}</span>
        <span className="truncate">{node.title}</span>
      </Button>
    ))
  )}
</div>
```

---

## 5.5 Warehouse 页面

**新建文件**: `src/pages/Warehouse.tsx`

### 组件结构

```typescript
type WarehouseTab = "all" | "topics" | "tasks" | "resources" | "inbox";

interface WarehousePageProps {
  onSelectNode: (node: NodeRecord) => void;
}

export function WarehousePage({ onSelectNode }: WarehousePageProps) {
  const [activeTab, setActiveTab] = useState<WarehouseTab>("all");
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const loadData = async (tab: WarehouseTab) => {
    setLoading(true);
    try {
      switch (tab) {
        case "all":
          const [topics, tasks, resources] = await Promise.all([
            fetchAllTopics(),
            fetchAllTasks(),
            fetchAllResources(),
          ]);
          setNodes([...topics, ...tasks, ...resources]);
          break;
        case "topics":
          setNodes(await fetchAllTopics());
          break;
        case "tasks":
          setNodes(await fetchAllTasks());
          break;
        case "resources":
          setNodes(await fetchAllResources());
          break;
        case "inbox":
          setNodes(await fetchUnreviewedNodes());
          break;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (node: NodeRecord) => {
    await updateNodeReviewStatus(node.node_id, "reviewed");
    await loadData(activeTab);
  };

  const handleReject = async (node: NodeRecord) => {
    await updateNodeReviewStatus(node.node_id, "rejected");
    await loadData(activeTab);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab 栏 */}
      <div className="flex border-b px-4 py-2 gap-2">
        {(["all", "topics", "tasks", "resources", "inbox"] as WarehouseTab[]).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab)}
          >
            {t("warehouse", tab)}
            {tab === "inbox" && nodes.length > 0 && activeTab !== "inbox" && (
              <Badge variant="secondary" className="ml-1">{/* count */}</Badge>
            )}
          </Button>
        ))}
      </div>

      {/* 节点列表 */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div>Loading...</div>
        ) : nodes.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">{t("warehouse", "empty")}</div>
        ) : (
          <div className="grid gap-2">
            {nodes.map((node) => (
              <NodeCard
                key={node.node_id}
                node={node}
                onClick={() => onSelectNode(node)}
                showReviewActions={activeTab === "inbox"}
                onApprove={() => handleApprove(node)}
                onReject={() => handleReject(node)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
```

### 新建 NodeCard 组件

**新建文件**: `src/components/NodeCard.tsx`

通用节点卡片，根据 node_type 显示不同样式，支持 review 操作。

### 更新 App.tsx 路由

```typescript
{currentPage === "warehouse" && (
  <WarehousePage
    onSelectNode={(node) => {
      if (node.node_type === "task") {
        setSelectedTask(node);
        setCurrentPage("workspace");
      } else if (node.node_type === "resource") {
        setSelectedResource(node);
        setCurrentPage("workspace");
      }
    }}
  />
)}
```

---

## 5.6 Dashboard Capture/Chat 模式

### 5.6.1 扩展 QuickCapture 组件

**文件**: `src/components/QuickCapture.tsx`

```typescript
type InputMode = "capture" | "chat";

interface QuickCaptureProps {
  // 现有 props...
  mode?: InputMode;
  onModeChange?: (mode: InputMode) => void;
  onChatSubmit?: (content: string) => void;
}

// 在输入框左侧添加模式切换按钮
<Button
  type="button"
  variant="ghost"
  size="icon"
  className={cn("h-8 w-8 shrink-0", mode === "chat" && "text-blue-500")}
  onClick={() => onModeChange?.(mode === "capture" ? "chat" : "capture")}
  title={mode === "capture" ? "切换到聊天模式" : "切换到捕获模式"}
>
  {mode === "capture" ? <Paperclip /> : <MessageSquare />}
</Button>

// 根据模式调整样式
<div className={cn(
  "flex items-center gap-2 rounded-xl border bg-background px-3 py-2",
  mode === "chat" && "border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20"
)}>

// 根据模式处理提交
const handleSubmit = async (e?: FormEvent) => {
  if (mode === "chat") {
    onChatSubmit?.(content.trim());
    setContent("");
  } else {
    // 原有 capture 逻辑
  }
};
```

### 5.6.2 新建 TemporaryChatPanel 组件

**新建文件**: `src/components/TemporaryChatPanel.tsx`

全屏聊天面板，用于临时会话（不绑定任何 node）。

```typescript
interface TemporaryChatPanelProps {
  initialMessage?: string;
  onClose: () => void;
}

export function TemporaryChatPanel({ initialMessage, onClose }: TemporaryChatPanelProps) {
  // 复用 AIContext，但不传 taskId/resourceId
  // 创建临时 session（session_type = "temporary"）
}
```

### 5.6.3 Dashboard 集成

**文件**: `src/pages/Dashboard.tsx`

```typescript
const [captureMode, setCaptureMode] = useState<InputMode>("capture");
const [showChatPanel, setShowChatPanel] = useState(false);
const [initialChatMessage, setInitialChatMessage] = useState("");

const handleChatSubmit = (content: string) => {
  setInitialChatMessage(content);
  setShowChatPanel(true);
};

// 渲染
{showChatPanel ? (
  <TemporaryChatPanel
    initialMessage={initialChatMessage}
    onClose={() => setShowChatPanel(false)}
  />
) : (
  // 原有 Dashboard 内容，QuickCapture 添加 mode props
  <QuickCapture
    mode={captureMode}
    onModeChange={setCaptureMode}
    onCapture={handleCapture}
    onChatSubmit={handleChatSubmit}
  />
)}
```

### 5.6.4 HUD 集成

**文件**: `src/pages/HUD.tsx`

```typescript
const [mode, setMode] = useState<InputMode>("capture");
const [showChat, setShowChat] = useState(false);
const [initialMessage, setInitialMessage] = useState("");

// Chat 模式下替换整个 HUD 内容
{showChat ? (
  <HUDChatPanel
    initialMessage={initialMessage}
    onClose={() => {
      setShowChat(false);
      // 可选：关闭 HUD 窗口
    }}
  />
) : (
  <QuickCapture
    variant="hud"
    mode={mode}
    onModeChange={setMode}
    onCapture={handleCapture}
    onChatSubmit={(content) => {
      setInitialMessage(content);
      setShowChat(true);
    }}
    onCancel={() => emit("hud-blur")}
    autoFocus
  />
)}
```

---

## 5.7 Workspace Pin to Context

**文件**: `src/components/workspace/ChatPanel.tsx`

### 添加 Pin 按钮

在每条 assistant 消息的渲染中添加：

```typescript
{messages.map((msg, idx) => (
  <div key={idx} className="group relative">
    {/* 消息内容 */}
    <div className={cn("p-3 rounded-lg", msg.role === "user" ? "bg-muted" : "bg-background")}>
      {msg.content}
    </div>

    {/* Pin 按钮（仅 assistant 消息显示） */}
    {msg.role === "assistant" && idx > 0 && messages[idx - 1]?.role === "user" && (
      <Button
        variant="ghost"
        size="icon"
        className="absolute -bottom-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => handlePinToContext(idx)}
        title="保存为资源"
      >
        <Pin className="h-3.5 w-3.5" />
      </Button>
    )}
  </div>
))}
```

### 实现 Pin 逻辑

```typescript
const handlePinToContext = async (assistantMsgIndex: number) => {
  const userMsg = messages[assistantMsgIndex - 1];
  const assistantMsg = messages[assistantMsgIndex];

  if (!userMsg || userMsg.role !== "user") return;

  // 1. 创建 Resource（对话内容）
  const content = `## User\n${userMsg.content}\n\n## Assistant\n${assistantMsg.content}`;
  const response = await quickCapture({ content, file_type: "text" });

  // 2. 关联到当前上下文节点
  const anchorNodeId = taskId || resourceId;
  if (anchorNodeId && response.node_id) {
    await linkNodes(anchorNodeId, response.node_id, "contains");
  }

  // 3. 刷新上下文列表
  onContextRefresh?.();

  // 4. 提示用户
  toast.success("已保存到上下文");
};
```

---

## 验证清单

### 类型系统
- [ ] NodeRecord schema 通过 Zod 验证
- [ ] Task/Resource 别名正常工作
- [ ] 所有现有组件编译通过

### Rust 后端
- [ ] `list_pinned_nodes` 返回正确数据
- [ ] `list_unreviewed_nodes` 返回正确数据
- [ ] `update_node_review_status` 更新成功

### Sidebar
- [ ] 加载收藏节点
- [ ] 点击节点跳转到 Workspace
- [ ] 空状态显示正确

### Warehouse
- [ ] Tab 切换正常
- [ ] 节点列表正确显示
- [ ] Inbox 审核操作工作
- [ ] 导航跳转正常

### Capture/Chat 模式
- [ ] 模式切换 UI 正常
- [ ] Capture 模式创建资源
- [ ] Chat 模式弹出聊天面板
- [ ] HUD 模式替换内容
- [ ] Dashboard 模式全屏聊天

### Pin to Context
- [ ] Pin 按钮显示正确
- [ ] 创建资源成功
- [ ] 链接到当前节点成功
- [ ] 上下文列表刷新

---

## 关键文件清单

### 需要修改
- `src/types/index.ts` - 添加 NodeRecord schema
- `src/api/index.ts` - 添加新 API 函数
- `src/components/QuickCapture.tsx` - 添加 mode 支持
- `src/components/Sidebar.tsx` - 加载收藏数据
- `src/components/workspace/ChatPanel.tsx` - 添加 Pin 按钮
- `src/pages/Dashboard.tsx` - 集成 Capture/Chat 模式
- `src/pages/HUD.tsx` - 集成 Chat 模式
- `src/App.tsx` - 添加 Warehouse 路由
- `src-tauri/src/db/nodes.rs` - 添加查询函数
- `src-tauri/src/commands/` - 添加命令
- `src-tauri/src/lib.rs` - 注册命令

### 需要新建
- `src/pages/Warehouse.tsx` - 仓库页面
- `src/components/NodeCard.tsx` - 通用节点卡片
- `src/components/TemporaryChatPanel.tsx` - 临时聊天面板
