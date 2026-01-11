# Rust 后端替代 Python 迁移计划

## 目标与原则

- Rust 完全替代 Python sidecar（summary/embedding/classify/chat/search），内部调用，不保留向后兼容。
- 仅保留 Google（Gemini），支持流式、多轮对话、结构化输出。
- Qdrant 继续使用 embedded 模式，路径由 Rust 配置统一管理。
- 先保留 `src-python` 代码不删除（后续手动清理）。
 - 继续支持文件上传模式，上传失败时回退到解析文本。

## 新接口形态（Rust 内部 API 建议）

目标是移除 HTTP 边界，保持清晰的内部服务层，Tauri commands 与 `AiPipeline` 统一调用。

建议模块结构（示例）：

- `src-tauri/src/services/ai/mod.rs`：统一入口 `AiServices`
- `src-tauri/src/services/ai/llm.rs`：Gemini client（reqwest + serde）
- `src-tauri/src/services/ai/embedding.rs`：fastembed-rs + text-splitter + qdrant
- `src-tauri/src/services/ai/search.rs`：hybrid search (RRF)
- `src-tauri/src/services/ai/agent.rs`：summary/classify 组合逻辑
- `src-tauri/src/services/ai/types.rs`：请求/响应 DTO

接口建议（保持语义清晰、便于替换实现）：

- `summarize(SummaryRequest) -> SummaryResponse`
- `embed(EmbedRequest) -> EmbedResponse`
- `delete_embeddings(DeleteEmbeddingRequest) -> ()`
- `classify(ClassifyRequest) -> ClassifyResponse`
- `chat_stream(ChatRequest) -> Stream<ChatStreamEvent>`
- `search_hybrid(SearchRequest) -> SearchResponse`

`ChatStreamEvent` 建议沿用现有前端事件类型以降低改动成本：
`answer_delta` / `thinking_delta` / `answer_full_text` / `thinking_full_text` / `usage` / `error`。

## 分阶段迁移清单

### Phase 0: 规划与基础设施
- [ ] 在 `src-tauri/src/services/ai/*` 建立模块骨架与 DTO 定义。
- [ ] 在 Rust config 中新增 Qdrant 路径、collection、chunk_size/overlap、模型名称等配置项。
- [ ] 梳理 `src-tauri/src/commands/ai_config.rs` 与 `ai_pipeline.rs` 中的 Python 调用点，形成替换清单。

### Phase 1: Embedding + Qdrant
- [ ] 集成 `fastembed-rs`（dense/sparse/image 按 `docs/overview.md` 选型）。
- [ ] 引入 `text-splitter` + HF tokenizer（bge-m3），输出 `chunk_text/chunk_index/token_count`。
- [ ] 实现 Qdrant collection 初始化：Named Vectors `dense/sparse/image`，vector size 1024/1024/512，dense/image 使用 Cosine，sparse 使用 `SparseVectorParams`。
- [ ] 建立 qdrant client 生命周期（embedded path 读取 config，启动时初始化，退出时关闭）。
- [ ] 实现 `embed_dense/embed_sparse/embed_image` 与 `embedding_hash`（sha256 截断）。
- [ ] 实现 upsert：写入 payload（`node_id/type/chunk_text/chunk_index/token_count`），返回 `qdrant_uuid` 与 hash，用于写入 SQLite `context_chunks`。
- [ ] 实现 delete：按 `node_id` + `embedding_type` 清理 Qdrant 与 `context_chunks`。
- [ ] 迁移 hybrid search（RRF）：prefetch dense/sparse，filter `type` + `node_ids`，返回 chunk + score。
- [ ] 补齐 `context_chunks` 的 model 信息写入（dense/sparse/image 模型名）。

### Phase 2: LLM (Gemini) 与流式
- [ ] 定义 Rust 侧 LLM DTO：`ChatMessage/ChatRequest/ChatStreamEvent/StructuredTask`（字段对齐 Python schema）。
- [ ] 用 `reqwest + serde` 实现 Gemini：对话、流式、结构化输出。
- [ ] 实现文件/图片上传与轮询 Active；上传失败时回退到解析文本。
- [ ] 实现 stream parsing：逐段产出 `answer_delta/thinking_delta`，末尾补 `answer_full_text/thinking_full_text/usage`。
- [ ] 实现结构化输出：JSON schema 生成 + 响应校验（可用 `schemars` + `serde`）。
- [ ] 把 `send_chat_message` 改为直接调用 Rust LLM 服务并发出相同 `chat-stream` 事件。
- [ ] 实现细节参考：`src-python/test/gemini_file_example.py`、`src-python/test/gemini_stream_multi_example.py`、`src-python/test/gemini_structure_example.py`。

### Phase 3: Agent + Pipeline
- [ ] 实现 Summary 任务：user_note 优先，max_length 约束，支持文件上传并回退到文本。
- [ ] 实现 Embedding 任务：summary 单段写入，content 切分写入，先清理旧 `context_chunks`。
- [ ] 实现候选检索：summary embedding -> Qdrant Top-10（>0.7），拉取候选 Topic + 父级上下文。
- [ ] 实现 Classify 任务：assign/create_new/restructure，解析 JSON 结果并 clamp 置信度。
- [ ] 实现去重与重构逻辑：新 Topic 创建前做相似性检查，reparent 前做 DAG 环检测。
- [ ] 写入 `node_revision_logs`（title/summary），仅置信度 >= 0.8 允许修改。
- [ ] 根据 `classification_mode` 更新 `review_status`（manual/aggressive）。
- [ ] 替换 `AiPipeline` 中的所有 HTTP 调用，直接调用 Rust 服务并保持状态流转字段一致。

### Phase 4: 收尾与文档
- [ ] 移除 `python.rs` command 与 sidecar 启动/健康检查流程。
- [ ] 更新 `docs/backend_rust.md` 与 `docs/overview.md` 描述 Rust-only 架构。
- [ ] 保留 `src-python` 代码但标记为 deprecated。

## 配置默认值建议（可从 Python 迁移）

- `chunk_size = 512`
- `chunk_overlap = 50`
- `qdrant_collection_name = "neuralvault_chunks"`
- `qdrant_vector_names = { dense, sparse, image }`
- `dense_vector_size = 1024`
- `sparse_vector_size = 1024`
- `image_vector_size = 512`
- `dense_embedding_model / sparse_embedding_model / image_embedding_model` 按 `docs/overview.md` 的 TODO

## 手动验收清单

- 资源捕获：text/image/pdf 的解析与 OCR 回退。
- summary 生成：user_note 约束生效，超长裁剪。
- embedding：summary/content 写入、删除、重算。
- classify：assign/create_new/restructure 分支可触发。
- chat：流式、多轮、结构化输出、文件上传。
- search：local/global scope 的 hybrid search 返回稳定。

## 风险与注意事项

- 模型加载耗时与内存占用（fastembed-rs）。
- Gemini 文件上传失败的回退策略。
- image embedding 维度与 Qdrant Named Vectors 兼容性。
- 流式事件格式变更导致前端适配成本。

## 已确认

- 保留文件上传模式，失败回退到解析文本。
- `ChatStreamEvent` 保留现有事件类型以避免改前端。
- 使用 Qdrant Named Vectors：同一个 collection，向量名区分 dense/sparse/image。
