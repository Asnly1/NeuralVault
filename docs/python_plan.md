### 第一阶段：骨架与动脉 (Infrastructure & IPC)
**目标**：Python 进程能随 Tauri 启动/退出，数据库连接正常，基础心跳打通。

1.  **环境初始化 (The "Lean" Setup)** (已完成)
    * **依赖管理**：使用 `uv` 初始化项目。
    * **核心库锁定**：安装 `fastapi`, `uvicorn`, `llamaindex`, `qdrant-client`, `sqlmodel` (ORM), `aiosqlite` (异步驱动)。

2.  **数据库复刻 (Schema Mirroring)**
    * **任务**：在 Python 端 (`models/sql_models.py`) 建立与 Rust `migrations/*.sql` **严格一一对应**的 SQLModel 模型。
    * **校验点**：编写一个简单的脚本，连接 SQLite，测试SQLModel和SQLite的模型是否一样

3.  **Sidecar 生命周期管理**
    * **启动**：在 Tauri (Rust) 端配置 `tauri.conf.json` 的 sidecar 路径。
    * **通信**：实现 Python 端的 `/health` 接口。
    * **退出机制**：实现一个“自杀”逻辑。如果 Rust 父进程死掉（可以通过监听 stdin 或心跳超时），Python 必须自动退出，防止变成僵尸进程占用数据库锁。

---

### 第二阶段：数据摄入流水线 (The Ingestion Pipeline)
**目标**：Rust 丢过来一个文件 ID，Python 能把它变成向量存进 Qdrant，并更新 SQLite 状态。

1.  **Qdrant 本地化集成**
    * **安装**：`qdrant-client`。 （已完成）
    * **配置**：设置 Qdrant Client 为 `path="./qdrant_data"` (Embedded Mode)。
    * **Collection 初始化**：在应用启动时检查并创建 Collection（如果不存在），定义好 Vector Size（取决于选用的 Embedding 模型）。

2.  **轻量级 Embedding 方案**
    * **关键动作**：安装 `fastembed` (基于 ONNX Runtime)。 （已完成）
    * **集成**：不使用 PyTorch。配置 LlamaIndex 使用 `FastEmbedEmbedding`。使用 BAAI/bge-m3（TODO）

3.  **实现 `/ingest/notify` (异步处理)**
    * **接收**：FastAPI 接收 Rust 发来的 `resource_id`。
    * **响应**：**立即**返回 200 OK，使用 FastAPI 的 `BackgroundTasks` 在后台运行处理逻辑。
    * **处理逻辑 (Worker)**：
        1.  **Fetch**: 从 SQLite 读取文件路径。
        2.  **Parse**: 使用 `PyMuPDF` (fitz) 解析 PDF，或基础 I/O 读取文本。
        3.  **Chunk**: 使用 LlamaIndex 的 `SentenceSplitter` 切分文本。
        4.  **Embed**: 调用 `fastembed` 生成向量。
        5.  **Upsert**: 写入 Qdrant。
        6.  **Update**: 更新 SQLite 的 `sync_status` 为 "synced" (注意：使用短事务，避免锁死 Rust)。

4.  **WebSocket 进度推送**
    * 实现 `/ws/notifications`，当后台处理每一阶段（解析完、向量化完）时，向前端推送进度，让 Dashboard 的 loading 状态动起来。

---

### 第三阶段：大脑上线 (RAG & Chat)
**目标**：实现混合检索和对话功能。

1.  **混合检索逻辑 (Hybrid Search)**
    * **FTS5 (Keyword)**: Python 通过 SQL 查询 SQLite 的 FTS 虚表（需要在 Rust 建表时开启 FTS）。
    * **Vector (Semantic)**: Python 查询 Qdrant。
    * **Fusion**: 在内存中对两个结果集进行简单的 ID 去重和合并。

2.  **LLM 服务封装**
    * **接口抽象**：封装一层 `LLMService`，支持切换 `Ollama` (本地) 和 `OpenAI` (云端)。
    * **Prompt 管理**：将提示词模板化，不要硬编码在逻辑里。

3.  **对话接口 `/chat/completions`**
    * **上下文挂载**：根据前端传来的 `task_id`，去 SQLite 找关联的 Resource，再去 Qdrant 捞相关的 Chunk。
    * **流式输出**：使用 `StreamingResponse`，这对用户体验至关重要（不要让用户盯着空白屏幕等 5 秒）。

---

### 第四阶段：智能增强 (Agents & Polish)
**目标**：任务拆解、自动打标、打包优化。

1.  **Agent 功能**
    * **任务拆解**：实现 `/agent/decompose`。利用 LLM 的 JSON Mode 确保输出结构化的子任务列表。
    * **自动打标**：实现 `/agent/tag`。

2.  **打包与发布 (The Final Boss)**
    * **依赖清理**：检查 `pyproject.toml`，移除所有开发依赖。
    * **打包工具**：使用 `PyInstaller（已安装）` 将 Python 环境打包成单文件或单目录（推荐单目录，启动快）。
    * **Tauri 集成**：将打包好的二进制文件重命名放入 Tauri 的 sidecar 目录。

### 核心检查清单 (Pre-flight Checklist)

* [ ] **SQLite WAL 模式**：确保 Rust 初始化数据库时开启了 `PRAGMA journal_mode=WAL;`，否则 Python 一读写就会报错。
* [ ] **Schema 一致性**：Rust 改了表结构，Python 必须同步改 Model。
* [ ] **Qdrant 路径**：确保 Embedded Qdrant 的数据存储路径在 `$APPDATA` 下，而不是程序安装目录下（后者没有写权限）。
* [ ] **端口管理**：Python 启动端口最好由 Rust 动态分配并通过参数传入，或者是硬编码一个极少冲突的端口（虽然 Sidecar 模式下动态分配更安全）。