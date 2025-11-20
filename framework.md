# 项目提案：基于 RAG 与 3D 可视化的智能个人助理 (Project: NeuralVault)

## 1. 项目背景与核心痛点

目前市面上的 To-Do 或笔记类应用存在两个核心问题：

1.  **输入阻力大 (High Friction)：** 用户需要手动整理、分类、上传文件，导致大部分信息停留在微信/网页里，没能进入管理系统。
2.  **缺乏上下文 (Context-Less)：** 任务只是孤立的一行字。AI 虽然能总结，但缺乏对用户历史行为和文件之间关联的深度理解。
3.  **同质化严重：** 现有的 AI 助手大多只是 OpenAI API 的简单套壳，缺乏工程深度。

## 2. 项目核心价值

本项目旨在构建一个**本地优先 (Local-First)** 的智能第二大脑。它不仅是一个任务列表，更是一个**信息吞吐工厂**：手动捕获、自动结构化、自动建立知识关联，并最终以 **3D 知识宇宙** 的形式呈现。

---

## 3. 差异化竞争策略 (The 3 Core Differentiators)

_这是本项目区别于普通 CRUD + LLM 项目的核心卖点，也是简历上的“杀手锏”。_

### 策略 A：3D 知识宇宙可视化 (3D Knowledge Universe)

- **痛点解决：** 传统的列表式归档难以让人产生回顾的欲望，也无法直观展示知识间的联系。
- **解决方案：** 利用 WebGL (Three.js / React Three Fiber) 技术，将后台的向量数据库可视化。
  - 每一个任务/文件是一个节点（星球）。
  - **语义相似度 (Semantic Similarity)** 决定节点间的距离和连线。
  - 用户可以在 3D 空间中漫游，直观地看到“我上个月处理的 Bug”和“今天的任务”之间存在关联。
- **技术亮点：** 前端图形学 + 高维数据降维可视化 (t-SNE/UMAP)。

### 策略 B：全域无感捕获与系统级集成 (System-Level Integration)

- **痛点解决：** 解决“微信聊天记录”和“碎片化网页”难以收集的问题。
- **解决方案：** 不依赖 API 同步，而是开发系统级的**剪贴板监听器 (Clipboard Monitor)** 和 **全局钩子 (Global Hook)**。
  - 用户选中任意文本/图片 -> 按下快捷键 -> 呼出极简输入窗 (Capture Bar) -> 用户输入标签（可选） -> 后台自动处理。
- **技术亮点：** 桌面端开发 (Tauri/Rust/Electron) + 操作系统 API 调用。

### 策略 C：本地优先的隐私架构 (Privacy-First & Local AI)

- **痛点解决：** 用户不愿将私密的聊天记录和公司文档上传至云端。
- **解决方案：** 采用 **端云混合 (Hybrid)** 架构。
  - **Local:** 使用量化的小模型 (如 Llama-3-8B / Phi-3) 在本地进行敏感数据的 Embedding (向量化) 和初步分类。
  - **Cloud:** 仅在需要复杂推理且脱敏的情况下，才调用云端大模型。
- **技术亮点：** 本地 LLM 部署 (Ollama/Llama.cpp) + 边缘计算思维。

---

## 4. 系统架构设计 (System Architecture)

我们将系统划分为四个层级，模拟人类处理信息的过程：

### Layer 1: 感知层 (Perception Layer) - "Eyes & Ears"

- **功能：** 负责从外部世界摄入信息。
- **模块：**
  - **Global Capture Bar:** 类似 Spotlight 的悬浮窗。
  - **Clipboard Watcher:** 监听剪贴板变化，自动过滤无用信息。
  - **File Parser:** 针对 PDF/Images 的解析器 (OCR)。

### Layer 2: 认知层 (Cognition Layer) - "The Brain"

- **功能：** 负责清洗、理解和决策。
- **模块：**
  - **Intent Classifier:** 识别输入意图（是新任务？是参考资料？还是日记？）。
  - **Dynamic Ranker (核心算法):**
    - 不单纯按时间排序，而是计算：Score = Weight_priority/Time_remaining + Context_relevance
  - **Auto-Tagger:** 基于语义自动打标签，废弃手动文件夹分类。

### Layer 3: 交互层 (Interaction Layer) - "The Hands"

- **功能：** 用户操作的主界面。
- **模块：**
  - **Smart Dashboard:** 动态优先级看板（根据 DDL 变色的任务卡片）。
  - **Action Workspace:** 任务详情页，左侧是任务拆解，右侧是 AI 自动聚合的参考资料 (Context)。

### Layer 4: 记忆层 (Memory Layer) - "The Hippocampus"

- **功能：** 长期存储与复盘。
- **模块：**
  - **Vector Database:** 存储所有历史数据的向量索引。
  - **The Pulse Engine:** 每日/周报生成器，分析用户行为模式。
  - **Semantic Linker:** 历史任务推荐引擎（"你 3 个月前做过类似的事..."）。

---

## 5. 推荐技术栈 (Tech Stack)

为了兼顾**开发效率**与**简历含金量**，建议采用以下组合：

- **Frontend (桌面端):** **Tauri** (Rust + React/TypeScript)。
  - _理由：高性能、体积小，适合做系统级监听，Rust 是加分项。_
- **Visualization:** **React Three Fiber** (基于 Three.js)。
  - _理由：React 生态下最成熟的 3D 库，适合实现知识宇宙。_
- **Backend / AI Orchestration:** **Python (FastAPI)**。
  - _理由：Python 是 AI 原生语言，方便对接 PyTorch/LangChain。_
- **Database:**
  - **Relational:** SQLite (单文件，易部署)。
  - **Vector:** ChromaDB 或 FAISS (本地向量检索)。
- **LLM Framework:** **LlamaIndex**。
  - _理由：比 LangChain 更擅长处理数据索引和 RAG 任务。_

---

## 6. 开发路线图 (MVP Roadmap)

### Phase 1: 骨架与数据流 (The Foundation)

- 搭建 Tauri + Python 环境。
- 实现“剪贴板监听”功能，能将复制的文本存入 SQLite。
- 完成基本的“待办列表”界面。

### Phase 2: AI 大脑接入 (The Intelligence)

- 接入 Embedding 模型，实现文本向量化。
- 实现“动态优先级排序”算法。
- 开发“语义搜索”功能：输入关键词，不仅搜到字面匹配，还能搜到含义匹配。

### Phase 3: 3D 可视化与复盘 (The Differentiation)

- 利用 Three.js 搭建 3D 视图。
- 将向量数据库的数据映射到 3D 坐标系。
- 实现“每日 Pulse 报告”生成。

---

## 7. 结论

本项目不是另一个简单的 To-Do List。它是一个尝试将 **OS 交互技术**、**生成式 AI (RAG)** 和 **3D 数据可视化** 结合的实验性产品。它旨在解决信息过载时代的“整理焦虑”，让机器负责记忆与规划，让人类回归创造与执行。
