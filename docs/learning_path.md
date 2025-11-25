鉴于你 **“熟悉 Python，不熟悉 Rust”** 的背景，我为你量身定制了一份**“实用主义学习路线”**。

**核心原则：不要试图精通 Rust。** 你是做产品，不是做语言研究。只学 Tauri 需要的那 20% Rust 即可。

---

### 第一阶段：Rust & Tauri 基础（攻坚期，预计 1-1.5 个月）

_这是最痛苦的阶段，因为 Rust 的语法和 Python 差异巨大。_

#### 1. Rust 语言（只学这些就够了）

不要去看《Rust 程序设计语言》那本厚书的所有章节！只看前 6-8 章，重点理解以下概念：

- **所有权 (Ownership) & 借用 (Borrowing):** 必须懂，否则代码编译不过。
- **Structs & Enums:** Rust 的枚举非常强大，用于处理状态。
- **Result & Option:** 彻底告别 `try-catch` 和 `None` 的旧思维，学会处理“可能出错”和“可能为空”的情况。
- **Cargo 包管理:** 学会怎么引入第三方库（Crates）。
- **推荐资源：** `Rustlings` (GitHub 上的练习题) 或 Microsoft 的 "Take your first steps with Rust" 教程。

#### 2. Tauri v2 框架

- **Tauri 核心通信 (IPC):** 搞懂 Frontend (JS) 如何调用 Backend (Rust)。学习 `#[tauri::command]`。
- **System Tray (托盘):** 如何让程序最小化到右下角，而不是直接关闭。
- **Global Shortcut (快捷键):** 学习如何注册全局快捷键（如 `Alt+Space`）。
- **State Management (状态管理):** 学习 `Mutex` 和 `Arc`，如何在 Rust 里安全地保存全局变量（比如当前的数据库连接）。
- **实战目标：** 写出一个只有托盘图标的应用，按下快捷键能弹出一个 React 窗口，窗口里输入文字，Rust 后端能打印出来。

---

### 第二阶段：Python Sidecar 与 进程通信（核心难点，预计 1 个月）

_这是项目成败的关键。很多项目死在“打包后 Python 跑不起来”。_

#### 1. Python 打包工程

- **PyInstaller / Nuitka:** 学习如何将你的 Python FastAPI 代码打包成**单个**可执行文件（`.exe` 或 Unix binary）。
- **虚拟环境管理 (Poetry/Conda):** 确保你的开发环境纯净，不要把系统里的垃圾包打进去。

#### 2. Tauri Sidecar 机制

- **Tauri Configuration:** 学习如何在 `tauri.conf.json` 里配置 `externalBin`。
- **Subprocess Control:** 学习如何在 Rust 里启动、杀死 Python 子进程，以及如何读取 Python 的 `stdout`（标准输出）。

#### 3. API 接口设计

- **FastAPI:** 你需要非常熟练。
- **HTTP 交互:** 前端 (React) -> (Rust 代理) -> Python。或者 前端 -> Python (如果允许直连)。建议通过 Rust 中转以解决跨域和鉴权问题。
- **实战目标：** 打包后的 App，双击运行，无需安装 Python 环境，前端能从 Python 后端获取到 "Hello World"。

---

### 第三阶段：RAG 与 向量数据库（业务核心，预计 1.5 - 2 个月）

_这是你简历上最值钱的部分。_

#### 1. 现代 RAG 架构 (LlamaIndex)

- **Embeddings:** 理解文本如何变成向量（OpenAI API 或 HuggingFace Local Models）。
- **Chunking (切片):** 学习如何优雅地切割 PDF 和长文本（按段落？按语义？）。
- **Retrieval:** 学习“混合检索”（关键词搜索 + 向量搜索）。

#### 2. 向量数据库 (ChromaDB / SQLite-vec)

- 推荐 **ChromaDB** (Python 原生，易上手)。
- 学习 CRUD 操作：存入向量、删除向量、根据 Metadata 过滤。

#### 3. 本地大模型 (Ollama)

- 学会如何在代码中调用 Ollama 的 API。
- 学习 Prompt Engineering：如何写 Prompt 让模型根据检索到的内容生成回答，而不是瞎编。

---

### 第四阶段：前端工程化 (穿插进行)

_不要在 UI 上花太多时间，用现成的组件库。_

- **React + TypeScript:** 必须用 TS，类型安全能救命。
- **Tailwind CSS:** 写样式最快的方式。
- **UI 组件库:** 推荐 **Shadcn/ui**。它不是一个 npm 包，而是直接把代码复制到你项目里，非常适合高度定制，且设计感极佳（很像 Notion/Vercel 的风格）。

---

### 推荐的学习时间表 (倒推法)

假设现在是 11 月中旬，你的目标是暑假（6 月）完工：

- **11 月 - 12 月 (期末季):** **只学 Rust 基础 + Tauri Hello World**。
  - _目标:_ 寒假开始前，你本地能跑起一个空的 Tauri 窗口。
- **1 月 - 2 月 (寒假 - 黄金时间):** **攻克 Sidecar + Python 打包 + 剪贴板监听**。
  - _目标:_ 寒假结束时，你的 App 能监听剪贴板，并把内容传给 Python 后端保存到 SQLite。这是 MVP。
- **3 月 - 4 月 (大三下学期):** **RAG 系统开发**。
  - _目标:_ 引入 LlamaIndex，实现“复制一段话，自动推荐相关笔记”。
- **5 月:** **UI 美化 & 3D 尝试 (可选)**。
  - _目标:_ 这时候再引入 Three.js。如果来不及，直接砍掉，只做 2D 列表。
- **6 月:** **修 Bug & 写 Readme & 录 Demo 视频**。

---

你现在的首要任务是：**不被 Rust 劝退。** 只要熬过第一周的借用检查器（Borrow Checker），后面就是坦途。
