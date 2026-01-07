Resource：文字/PDF/EPUB/图片/网页链接（最好效果是用户直接从网页复制一段话，就能解析出对应的网址和网址内容）
Resource不会单一存在，一定会至少关联到某一个Topic/Task（Many to Many）。通过HUD/Dashboard上传Resource时，AI会自动关联到Topic。只有在ChatPanel临时上传的Resource，才会直接关联到Task
Topic：多个Resource + title
Task：Option(多个Resource) + Option(多个Topic) + title + DDL。允许Task不关联Resource，不关联Topic,单纯作为一个Todo List

技术栈（尽量轻量化）：
    1. 前端： React + Typescript
    2. 后端： Tauri(Rust) + FastAPI(Python)（处理AI相关，无状态微服务）+ Llamaindex + FastEmbed
    3. 数据库：SQLite + Qdrant

平台依赖：
    1. pdfium
    2. libc

Python依赖：
    requires-python = ">=3.12"
    dependencies = [
        "anthropic>=0.75.0",
        "fastapi>=0.125.0",
        "fastembed>=0.7.4",
        "google-genai>=1.56.0",
        "llama-index-core>=0.14.10",
        "openai>=2.14.0",
        "pydantic-settings>=2.12.0",
        "pyinstaller>=6.17.0",
        "pymupdf>=1.26.7",
        "qdrant-client>=1.16.2",
        "uvicorn[standard]>=0.38.0",
        "xai-sdk>=1.5.0",
    ]

    
页面：
    1. HUD：一键唤醒+捕获Resource。同时捕获 Window Title 和 Process Name (如 "Chrome") 作为 Context
    2. Dashboard：上传Resource + 显示未完成Task + 未分类 Resource + 添加一个AI对话框，用户可以问一些General的问题（上个月做了什么？）
    3. Workspace（参考Cursor）：
        - 左侧：Task模式（即点击Task进入）：显示当前Task关联Topic + Resource / Topic模式（点击Topic进入）：显示当前Topic关联Resource
        - 中间：文本编辑
        - 右侧：对话框。可以上传图片/文件/文字。如果上传了图片/文件，自动添加到左侧的关联Resource。添加一个“Pin to Context”按钮，如果 AI 说了一段很好的解释，可以一键把它转成一个 Resource 固定在左侧
    4. Sidebar：搜索框 + 跳转到不同页面。
        1. 语义匹配（99%情况）：使用Hybrid Search，优先显示精确匹配的 Topic/Task，然后显示语义相关的 Resource Chunk（Qdrant完成）
        2. 精确匹配（1%情况）： SQL LIKE
    5. Warehouse：显示所有Topic / Task
    6. Calendar：显示日程，即每个Task的DDL
    7. Settings：颜色/语言/ API Key/ 快捷键

使用：
    资源捕获+自动分类（乐观 UI + 后台异步队列）：
        1. 用户上传Resource
        2. 对Resource进行分析
            1. 提取，解析内容
                1. 图片：rust-paddle-ocr
                2. PDF：pdf_oxide + pdfium-render + rust-paddle-ocr
                3. EPUB：epub + html2text（暂时不做）
                4. 网页：
                    1. 在剪贴板里用正则匹配出SourceURL
                    2. 使用active-win获取当前Window Title（Google Chrome: Rust 语言圣经 - Google Chrome）
                    3. 构造https://example.com/page.html#:~:text=复制的文字（"Scroll to Text Fragment" (滚动到文本片段)）
                    4. 在前端渲染时点击url就可以打开浏览器并跳转到对应位置
                5. Word/Excel/PowerPoint：extractous（暂时不做）
            2. FastEmbed向量化存入Qdrant ; 调用使用 LlamaIndex 的 PropertyGraphIndex提取知识图谱（暂时不做）
            3. 调用LLM，分析Resource内容，生成Summary（暂时不做）
        3. AI根据分析结果，查找过去已存在的相关的Resource，把新Resource关联到一起，加入原有Topic。如果没有找到合适的Topic，就新建一个Topic。保留记录，用户可以手动撤回
            1. 调用LLM：”这是新文章，这是用户现有的 50 个 Topic 列表，它属于哪一个？如果都不属于，请生成一个新的 Topic 名称。请返回 JSON 格式：{"topic_name": "New Topic Name", "confidence_score": 0.9}“
            2. "Inbox" (收件箱) ： 任何 LLM 拿不准（Confidence Score < 0.8）的 Resource，不要新建 Topic，而是直接扔进一个叫 Unsorted (未分类) 的默认 Topic。
            3. 定期“园丁”模式： 每周提醒用户一次：“你 Unsorted 里有 10 个新资源，AI 建议将它们归档到 A, B, C，是否同意？”
            4. 强制模糊匹配： 在让 LLM 新建 Topic 之前，必须先用 Embedding 检索现有的 Topic Title。只有相似度极低时，才允许新建。
        4. 对于每一个Topic/Task，AI自动生成一个Summary，基于每个Resource的Summary(Topic Summary (New) = LLM( Topic Summary (Old) + New Resource Summary ))（暂时不做）
        5. 用户手动创建Task，AI建议/手动关联Resource / Topic
    
    AI Chat：
    1. 在开始对话时，自动把Topic/Task的Summary添加到聊天记录（暂时不做）
    2. 用户可以手动上传图片/文件，同样会添加到聊天记录（这个时候上传完整图片/文件）
    3. 除了Summary和用户上传的图片/文件，使用RAG在全局搜索相关Resource Chunk（Qdrant），添加到聊天记录（除了正常的语义分析，还要构建知识图谱，通过图谱搜索相关Resource Chunk。知识图谱暂时不做）
        1. Scoping:
            1. Level 1： 如果用户在 Workspace 里打开了 "Topic: React"，那么 RAG 优先且仅 检索该 Topic 下的 Resource。
            2. Level 2： 只有当用户问的问题在当前 Topic 找不到答案，或者用户明确说“搜索一下我的知识库”，才触发 Global Search
        2.  启动时的Context组装逻辑：
            1. System Prompt: 设定 Agent 人格。
            2. Active Task/Topic Metadata: 当前所在的 Topic/Task 名字，描述
            3. Retrieval Context (动态填充):
                1. 用户提问后，先去 Qdrant 搜。
                2. Scope Level 1 (当前 Topic): 权重 x 1.5。
                3. Scope Level 2 (全局，如果需要): 权重 x 1.0。
                4. 取 Top-5 Chunks。
        3. 每次用户发起对话时的Context组装逻辑：
            1. 用户的文字/图片/文件
            2. Retrieval Context
            
    4. 在本地手动管理聊天记录，用户可以
        1. 删除之前的某一点聊天记录
        2. 把之前的聊天记录发给不同的LLM
    