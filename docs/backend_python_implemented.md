# Python 后端实现文档

## 运行约束

> **必须使用单进程模式 (workers=1)**
> 
> WebSocket、IngestionQueue、VectorService 均使用内存状态，多进程会导致状态不共享。

---

## 文件结构

```
src-python/
├── app/
│   ├── main.py              # FastAPI 入口，生命周期管理
│   ├── core/
│   │   ├── config.py        # Embedding 模型配置
│   │   ├── db.py            # SQLite & Qdrant 连接池
│   │   ├── events.py        # 启动/关闭钩子
│   │   └── logging.py       # 日志配置
│   │
│   ├── api/
│   │   ├── ingest.py        # /ingest 端点
│   │   └── websocket.py     # /ws 端点
│   │
│   ├── models/
│   │   └── sql_models.py    # SQLModel + API DTO
│   │
│   ├── services/
│   │   ├── file_service.py  # PDF/Text 解析
│   │   └── vector_service.py# Chunking & Embedding
│   │
│   └── workers/
│       ├── queue_manager.py # asyncio.Queue
│       └── processors.py    # Ingestion Worker
```

---

## 已实现端点

### /ingest

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/ingest/notify` | Rust 通知数据变更，立即返回，后台处理 |
| GET | `/ingest/status/{resource_id}` | 查询处理状态 |

### /ws

| 方法 | 路径 | 说明 |
|------|------|------|
| WebSocket | `/ws/notifications` | 进度推送 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/shutdown` | 优雅关闭 |

---

## Ingestion 流水线

```
/ingest/notify → IngestionQueue → Worker
                                    ↓
                    Fetch → Parse → Chunk → Embed → Upsert
                                    ↓
                            WebSocket 推送进度
```

---

## Embedding 配置

| 类型 | 模型 | 维度 |
|------|------|------|
| Dense | `BAAI/bge-small-zh-v1.5` | 512 |
| Sparse | `Qdrant/bm42-all-minilm-l6-v2-attentions` | - |

---

## 数据写入规则

| 字段/表 | 写入方 |
|---------|--------|
| `resources` (sync_status, processing_stage 等) | Python |
| `context_chunks` | Python |
| 其他 | Rust |

---

## 生命周期

**启动**: DB 初始化 → WAL 模式 → VectorService → Worker → 重建队列 → 心跳监控

**关闭**: 停止心跳 → 停止 Worker → 关闭 DB
