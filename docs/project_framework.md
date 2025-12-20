# 项目提案：基于 RAG 的智能个人助理 (Project: NeuralVault)

## 1. 项目背景与核心痛点

目前市面上的 To-Do 或笔记类应用存在两个核心问题：

1.  **输入阻力大 (High Friction)：** 用户需要手动整理、分类、上传文件，导致大部分信息停留在微信/网页里，没能进入管理系统。
2.  **缺乏上下文 (Context-Less)：** 任务只是孤立的一行字。AI 虽然能总结，但缺乏对用户历史行为和文件之间关联的深度理解。
3.  **同质化严重：** 现有的 AI 助手大多只是 OpenAI API 的简单套壳，缺乏工程深度。

## 2. 项目核心价值

本项目旨在构建一个**本地优先 (Local-First)** 的智能第二大脑。它不仅是一个任务列表，更是一个**信息吞吐工厂**：手动捕获、自动结构化、自动建立知识关联，方便用户复盘。
流程：用户通过 HUD 无感收集资源，然后分类为任务。任务可以创建新的，也可以归类于原有任务的子任务。分类的时候由 AI 提出建议，用户如果接受可以直接按 tab。点击任务的时候出现 AI 推荐的分解任务，用户如果接受可以直接按 tab。然后进入任务界面，完成任务（通过 Text Editor / PDF Reader）。每个任务和资源都由 AI 进行 tag，方便进行关联。

---

## 3. 差异化竞争策略

### 策略 A：全域极速捕获与系统级集成 (System-Level Integration)（使用 Rust 完成，不调用 Python）

- **痛点解决：** 解决“微信聊天记录”和“碎片化网页”难以收集的问题。
- **解决方案：** 不依赖 API 同步，而是开发系统级的**剪贴板监听器 (Clipboard Monitor)** 和 **全局钩子 (Global Hook)**。
  - 用户选中任意文本/图片/文件 -> 按下快捷键 -> 呼出极简输入窗 (Capture Bar) -> 用户输入标签（可选） -> 后台自动处理。
- **技术亮点：** 桌面端开发 (Tauri/Rust) + 操作系统 API 调用。

### 策略 B：自动化信息分类 (Automatic Classification)

- **痛点解决：** 用户收集很多数据，但是不知道怎么分类。以及不知道做的任务有什么关联。
- **解决方案：** 调用 LLM 自动对用户的数据进行标注，找出不同数据之间的关系
- **技术亮点：** LLM 框架
-

### 策略 C：本地优先的隐私架构 (Privacy-First & Local AI)

- **痛点解决：** 用户不愿将私密的聊天记录和公司文档上传至云端。
- **解决方案：** 采用 **端云混合 (Hybrid)** 架构。
  - **Local:** 使用量化的小模型在本地进行敏感数据的 Embedding 和初步分类。
  - **Cloud:** 仅在需要复杂推理且脱敏的情况下，才调用云端大模型。
- **技术亮点：** 本地 LLM 部署 (Ollama) + 边缘计算思维。

---

## 4. 系统架构设计 (System Architecture)

### Layer 1: 感知层 (Perception Layer)

- **功能：** 负责从外部世界摄入信息。
- **模块：**
  - **Global Capture Bar:** 类似 Spotlight 的悬浮窗。（使用 Rust 完成，不调用 Python）
  - **File Parser:** 针对 PDF/Images/EPUB 的解析器。

### Layer 2: 认知层 (Cognition Layer)

- **功能：** 负责清洗、理解和决策。
- **模块：**
  - **Task Router** 把大任务分解成小任务，小任务分解成 checklist。（由 AI 生成建议，用户确认，最好调用大模型）
  - **Dynamic Ranker:** 不单纯按时间排序，而是计算：Score = Weight_priority/Time_remaining(暂定，每 6h 更新一次，防止破坏心流)（MVP 先不实现，先手动排序）
  - **Auto-Tagger:** 基于语义自动打标签。（由 AI 生成建议，用户确认，调用本地小模型）
    - Tag 的作用：分类任务和资源，方便推荐资源应该属于哪个任务；任务应该命名为什么；建立任务之间的关联；建立知识图谱

### Layer 3: 交互层 (Interaction Layer)

- **功能：** 用户操作的主界面。
- **模块：**
  - **Smart Dashboard:** 动态优先级看板（根据 DDL 变色的任务卡片）。
  - **Action Workspace:** 任务详情页，左侧是任务+参考资料，中间是工作区，右侧是 ChatBox。

### Layer 4: 记忆层 (Memory Layer) （待定，v1.0 先不做）

- **功能：** 长期存储与复盘。
- **模块：**
  - **Vector Database:** 存储所有历史数据的向量索引。
  - **The Pulse Engine:** 每日/周报生成器，分析用户行为模式。
  - **Semantic Linker:** 历史任务推荐引擎（"你 3 个月前做过类似的事..."）。

---

## 5. 推荐技术栈 (Tech Stack)

- **Frontend (桌面端):** **Tauri** (Rust + React/TypeScript + Shadcn)。
  - 理由：高性能、体积小，适合做系统级监听。
- **Backend**
  - AI Orchestration: **Python (FastAPI)**。（先用 Python 完成第一版，后续有时间使用 Rust 重写）
  - 理由：Python 是 AI 原生语言，方便对接 PyTorch/LlamaIndex
  - Capture: **Rust**
  - 理由: Rust 占用内存小，处理快
  - 整体：Tauri 启用 Sibecar 模式调用 Python。
- **Database:**
  - **Tools:** Rust: SQLx; Python: SQLModel
  - **Relational:** SQLite (单文件，易部署)。
  - **Vector:** Qdrant (本地向量检索)。
- **LLM Framework:** **LlamaIndex**。
  - 理由：比 LangChain 更擅长处理数据索引和 RAG 任务。
