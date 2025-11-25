### 1\. 悬浮输入窗 (The Quick Capture HUD) （使用 Rust 完成，不调用 Python）

这是**独立于主程序**的一个极简窗口（类似 Spotlight 或 Raycast）。

- **触发方式：** 全局快捷键（如 `Alt + Space`）。
- **界面包含：**
  - 一个输入框（文本/粘贴图片）。
  - 来源显示（例如：自动识别出“来自微信”）。
  - 输入的是 resources
- **定位：** **“无压力入口”**。用完即走，不打断当前工作。
- **处理逻辑：** **Fire and Forget**
  - 用户输入 -> Rust 立刻存入 SQL-> 界面立即反馈“已保存”， 任务标签为"待分类“
  - 用户离开焦点后，Rust 主动通知 Python 有新数据存入 -> Python 调用 LLM 分析 -> 更新建议的任务 -> 前端通过 WebSocket 接收更新，不要在 HUD 中显示分类
  - 不要让 AI 直接写入任务，而是让用户自己写，写的时候在旁边出现 AI 的建议
  - SQL 启用 WAL 模式，避免文件锁。如果还有锁，Rust 优先（用户输入数据），Python 支持重试

---

### 2\. 主程序窗口 (The Main Application)

这个窗口通常采用 **侧边栏导航 (Sidebar Navigation)** 的布局。包含以下几个主要页面：

#### Page A: 智能看板 (Dashboard / Inbox)

“主页面”，但比单纯的 Upload + Todo 更丰富。

- **第一行：** **智能待办列表**。根据之前设计的 `Priority Score` 排序的卡片。但是要支持用户手动排序，即有两种模式：用户手动和智能排序
- **第二行：** **输入框**。支持手动上传文件；输入文字等
- **第三行：** **分类区**。用卡片呈现用户输入的文件，AI 提示不同文件的关系，用户手动创建 task。如果 Python 没有处理完文件就提示用户正在处理，但是用户仍然可以手动标注/分类。AI 可以建议“单条单条资源属于哪个任务”，但应该首要建议“这 5 条资源看起来都属于 A 任务，是否一键归档”
- **右上角：** **系统提示** 提醒用户 HUD 输入文件的处理情况：成功/失败
- **主要交互：** 浏览今天要做什么 + 分类文件。点击列表中的任务，跳转到 Page B。

#### Page B: 任务工作台 (Task Workspace)

任务页面。采用**分屏设计**，（类似 Cursor）。用户可以自定义每个区块的大小,甚至关闭某个区块。

逻辑设计（类似 Notion）：

1. 视图聚焦 (View Focus)： 左侧列表永远只显示当前层级的任务。
2. 点击行为：
   - 如果点击一个任务（它有子任务），列表刷新，只显示它的子任务，以及这个任务对应的所有文件。
   - 顶部出现面包屑导航： 项目 A > 后端开发 > 数据库设计。
3. 返回： 用户点击面包屑中的某一级。

- **左屏：** **上下文区**。

  - 顶部： 面包屑导航 (Project > Epic > Story > Task)。
  - 列表： 当前层级的 Subtasks。
  - 操作： 点击列表中的某一项，如果它还有子任务，就“钻进去”（列表刷新为下一级）；如果没有子任务，就在下面加载相关的文件。
  - 搜索：
    - MVP 先使用 语义+FTS5 去重后展示, 喂给 AI 的 context 就是两个都选取 top-5
    - 后续考虑：使用 RRF 算法进行 Hybrid Search 检索相关文件 Score = alpha mulplties VectorSimilarity + beta mulplties FTS5Score + gamma mulplties TimeDecay
    - Reranking（后续实现）

- **中间：** **执行区**。（使用现成组件）
  - 用户的工作区域。
  - 文本编辑器 / PDF Reader
- **右屏：** **ChatBox**。(默认开启，用户可手动关闭)
  - Scope (上下文范围) 锁定在当前选中的任务的根任务及其所有子任务（通过 root_task_id 查找获取所有 context）。
  - 用户可设置文件是否仅在当前层级可用或在子层级也可用
  - 也可以使用 “@” 手动添加文件

#### Page C: 复盘与脉搏 (Review & Pulse) （优先级放后, V1.0 先不做）

类似 ChatGPT 的 Pulse

- **界面：** 日历，用户点进去每一天后可以查看 AI 生成的日报。每周日生成日报。
- **报告内容：**
  - AI 生成的当天总结/当周总结：完成了 xx 任务；最近聚焦在 xx 模块等
  - 历史数据
  - AI 生成的推荐内容（优先级靠后）
  - 在右侧边栏可以输入内容，让 AI 第二天推荐别的东西

#### Page D: 知识宇宙 (Knowledge Universe) (锦上添花, V1.0 先不做)

先做一个 2D 知识图谱，3D 的有时间再做

- **界面：** 全屏的 WebGL Canvas。
- **交互：**
  - 拖拽旋转星系。
  - 点击节点（星球），弹出一个小卡片显示摘要。
  - 点击卡片上的“Open”，跳转回 Page B（查看详情）。

#### Page E: 设置 (Settings)

- **内容：**
  - OpenAI API Key 输入框。
  - 本地模型路径选择 (Ollama URL)。
  - 系统快捷键设置。

---

### 总结：页面层级图

```text
[系统层]
   └── 悬浮输入窗 (Quick Capture)

[主程序窗口]
   ├── 侧边栏 (Sidebar)
   │    ├── 📊 看板 (Dashboard)   [Page A]
   │    ├── 📝 工作台 (Workspace) [Page B]
   │    ├── 📈 复盘 (Pulse)       [Page C]
   │    ├── 🔭 宇宙 (Universe)    [Page D]
   │    └── ⚙️ 设置 (Settings)     [Page E]
   │
   └── 主视图区域 (Main View)
        ├── (默认显示 Dashboard)
        └── (点击任务后跳转) -> 📝 工作台 (Workspace) [Page B]
```

**MVP**:

1. Quick Capture (Rust): 极速存入 SQLite，不经过 AI。
2. Dashboard (Page A): 进入主页的时候，能正常显示待办，输入框和待分类的资源。
3. Retrieval (Page B): 进入任务详情页时，仅显示关联的文件和“可能相关的历史任务”。

**第二版**:

1. Quick Capture (Rust): 极速存入 SQLite，不经过 AI。
2. Background Worker (Python): Rust 调用 Python -> Python 调用 Embedding 模型 -> 存入 ChromaDB -> 简单分类（Tagging）。
3. Retrieval (Page B): 进入任务详情页时，仅显示关联的文件和“可能相关的历史任务”。
4. Chat (Page B): 能针对当前挂载的文件进行问答。
