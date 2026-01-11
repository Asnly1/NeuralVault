Everything is a Node: 
    1. Resource
    2. Topic
    3. Task

转换：
Resource -> Topic:
    1. 新建一个Topic Node，继承Resource的title和summary
    2. 新建contains edge: Topic contains resource
    3. 把原来指向Resource的Edge都指向Topic
Resource -> Task:
    1. 新建一个Task Node，继承Resource的title和summary
    2. 新建contains edge: Topic contains resource
    3. 把原来指向Resource的Edge都指向Topic
Topic -> Task:
    1. 直接把node_type改为task
Task -> Topic: 
    1. 直接把node_type改为topic

Edge采用DAG模式，即一个Node可以有多个Parent Node，每次插入Edge时要检测有无环

技术栈（尽量轻量化）：
    1. 前端： React + Typescript
    2. 后端： Tauri(Rust) + FastAPI(Python)（处理AI相关，无状态微服务）+ Llamaindex + FastEmbed
    3. 数据库：SQLite + Qdrant

平台依赖（只考虑MacOS + Windows）：
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
        "qdrant-client>=1.16.2",
        "uvicorn[standard]>=0.38.0",
        "xai-sdk>=1.5.0",
    ]

页面：
    1. HUD：一键唤醒（类似Raycast）+ 捕获Resource。同时捕获 Window Title 和 Process Name (如 "Chrome") 和 当前时间 作为 Context
    2. Dashboard：上传Resource + 显示未完成Task + 显示临时Chat
        Dashboard和HUD共用一个捕获逻辑，使用Tab切换Chat Mode / Capture Mode，使用不同颜色提醒用户
            1. Chat Mode: 弹出ChatPanel进行AI Chat:把文字/图片/文件发送给AI,默认不进行本地RAG。图片/文件只进行解析，不进行Summary / Embedding /分类。把Chat归类为临时Session，放到Dashboard中显示。在Dashboard中提供一个按钮把这个Session转成Persistent Session：图片/文件进行Summary / Embedding /分类，并把Session关联到对应的Node(Resource/Topic/Task)
            2. Capture Mode: 
                1. 默认创建Resource：如果输入框内容是纯文本，直接存入content；如果输入框内容是文本+图片/文件，把文本存入user_note，图片/文本解析内容存入content
                2. 如果检测到@time/@todo，创建Task，附上同时在UI显示Toast：Task Created: [Title] Due: [Date] Priority: [Priority]
    3. Workspace（参考Cursor,三个部分都支持折叠）：
        - 左侧：相关资源：显示当前Node contains 的Nodes
        - 中间：文本编辑
        - 右侧：对话框。可以上传图片/文件/文字。如果上传了图片/文件，自动添加到左侧的Contains Nodes。添加一个“Pin to Context”按钮：如果 AI 说了一段很好的解释，可以一键把它转成一个 Resource 固定在左侧。插入时在 nodes.source_meta 中存入：
        {
        "source_type": "chat_message",
        "session_id": 10,
        "message_id": 42,
        "original_prompt": "解释一下 Rust 的生命周期"
        }
    4. Sidebar：搜索框（用户选择不同搜索模式） + 跳转到不同页面 + Favourite Node
        1. 语义匹配（99%情况）：使用Hybrid Search
        2. 精确匹配（1%情况）： SQL LIKE（不需要FTS5, 个人知识库数据量不大，且FTS5对中文分词支持不好）
    5. Warehouse：显示所有Node
    6. Calendar：显示日程，即每个Task的DDL
    7. Settings：颜色/语言/ API Key/ 快捷键/ 归类模式

使用：
    资源捕获+自动分类（乐观 UI + 后台异步队列）：
        1. 用户上传Resource
        2. 对Resource进行分析
            1. 提取，解析内容
                1. 文字：无需处理
                2. 图片：rust-paddle-ocr
                3. PDF：pdf_oxide + pdfium-render + rust-paddle-ocr
                4. EPUB：epub + html2text（暂时不做）
                5. 网页：
                    1. 在剪贴板里用正则匹配出SourceURL
                    2. 使用active-win获取当前Window Title（Google Chrome: Rust 语言圣经 - Google Chrome）
                    3. 构造https://example.com/page.html#:~:text=复制的文字（"Scroll to Text Fragment" (滚动到文本片段)）
                    4. 在前端渲染时点击url就可以打开浏览器并跳转到对应位置
                6.. Word/Excel/PowerPoint：extractous（暂时不做）
            2. 调用LLM，分析Resource内容，生成Summary(少于100字)
                1. 输入：Resource的Content + Resource的User Note（如果有）
                2. 逻辑： 如果存在 User Note，Prompt 必须强制 LLM 围绕 User Note 的意图来生成 Summary。
                3. 输出：Summary
            3. FastEmbed向量化存入Qdrant（Payload注意区分type:"summary"和type:"content"）
            4. 调用使用 LlamaIndex 的 PropertyGraphIndex提取知识图谱（暂时不做）
        3. AI 智能归类与知识图谱构建（Refined Logic）：
            1. **检索上下文**：
                1. 使用新 Resource 的 Summary Embedding，在 Qdrant 搜索 Top-10 （相似度大于0.7，如果相似度大于0.7的小于10个，可以允许小于10个）相似的 Resource。
                2. 获取这些 Resource 所属的 Topic（Candidate Topics）。
                3. 同时获取这些 Topic 目前的父级 Topic（Parent Context）。
            2. **LLM 决策**（Structured Output）：
                输入：Resource Summary + Candidate Topics (包含 ID, Title, Summary, Existing Parent)。
                要求 LLM 返回 JSON 指令，执行以下逻辑之一：
                * **Assign**: 资源属于现有 Topic -> 返回 Topic node_id。
                * **Create New**: 现有 Topic 都不匹配 -> 返回新 Topic 的 Title/Summary。
                * **Restructure**：发现现有 Topic 定义不准确或层级缺失。
                    * 指令 A: 修改现有 Topic 的 Title/Summary（慎用，仅当语义发生漂移时）。
                    * 指令 B: 创建一个新的 Parent Topic。
                    * 指令 C: 将新 Resource、现有 Topic (及其它相关 Topic) 移动到该 Parent Topic 下，建立 `contains` 边。
            3. **执行与反馈**：
                * **去重检查**：在创建新 Topic (尤其是 Parent Topic) 前，先在该用户的 Topic 库中进行 Exact Match 或 Fuzzy Match，防止生成 "Programming" 和 "Coding" 这种相似节点。
                * **复用机制**：如果出现相似节点，直接复用已有 Topic，避免重复创建。
                * **修改记录**：置信度 >= 0.8 时允许修改 Topic title/summary，并写入 `node_revision_logs` 供追溯。
            4. **Inbox**（使用review_status） ：
                * 激进模式：
                    1. 如果置信度低于0.8，先把Resource关联到LLM提出的topic_name，但是要加上一个视觉标记（提示用户“AI 不确定，请复核”）
                    2. 保留AI关联的记录，用户可以手动撤回
                * 手动模式：
                    1. 在Warehouse Page中引入 Inbox 区域： 所有 AI 处理过的、未被用户确认的 Resource，先进入 Inbox，并带上 AI 建议的 Tag/Topic。
                    2. 用户进入 Warehouse Page，看到 Inbox 区域和 AI 的建议，点击“Approve All”或者手动拖拽微调。
           5. **JSON回复格式**
            {
                "action": "assign",
                "payload": {
                    "target_topic_id": 12
                },
                "confidence_score": 0.95,
            }
            {
                "action": "create_new",
                "payload": {
                    "new_topic": {
                        "title": "New Topic Name",
                        "summary": "Summary of the new topic..."
                    },
                    // 可选：如果 LLM 觉得这个新 Topic 应该归属于某个已存在的爷爷节点
                    "parent_topic_id": 3
                },
                "confidence_score": 0.90,
            }
            {
                "action": "restructure", 
                "payload": {
                // 1. 指令 A: 修改现有 Topic (Optional)
                "topics_to_revise": [
                    {
                    "topic_id": 12,
                    "new_title": "Rust Ownership",
                    "new_summary": "Focus specifically on ownership rules."
                    }
                ],

                // 2. 指令 B: 创建新父节点
                "new_parent_topic": {
                    "title": "Rust Memory Management",
                    "summary": "Core concepts regarding ownership, borrowing, and lifetimes in Rust."
                },

                // 3. 指令 C: 移动现有 Topic/Resource 到新父节点下
                "reparent_target_ids": [
                    12,
                    56
                ],
                
                // 标记：新上传的资源是否也属于这个新父节点？
                "assign_current_resource_to_parent": true
                },
                "confidence_score": 0.85
            }
        4. 对于每一个Topic/Task，当Contains的资源发生变化时，AI自动生成一个Summary，基于每个Resource的Summary: Topic Summary (New) = LLM( Current Topic Summary + New Resource Summary )
    
    AI Chat：
    1. 在开始对话时，自动把Node的Summary添加到聊天记录
    2. 用户可以手动上传图片/文件，同样会添加到聊天记录（这个时候上传完整图片/文件）
    3. 除了Summary和用户上传的图片/文件，使用RAG在全局搜索相关Resource Chunk（Qdrant），添加到聊天记录（除了正常的语义分析，还要构建知识图谱，通过图谱搜索相关Resource Chunk。知识图谱暂时不做）
        1. Scoping:在Chat输入框上方，显示胶囊标签：[Scope: Current Node] 或 [Scope: Global]，用户可以通过Cmd+S切换Scope
            1. Local： 仅检索当前 Node 下的 Resource。
            2. Global： 检索所有Node下的Resource
        2.  启动时的Context组装逻辑：
            1. System Prompt: 设定 Agent 人格。
            2. Active Node Metadata: 当前所在的 Node 名字，描述
            3. Retrieval Context (动态填充，并向用户显示):
                1. 用户提问后，先去 Qdrant 搜。
                2. Scope Local (当前 Node): 权重 x 1.5。
                3. Scope Global (全局，如果需要): 权重 x 1.0。
                4. 取 Top-5 Chunks。
        3. 每次用户发起对话时的Context组装逻辑：
            1. 用户的文字/图片/文件
            2. Retrieval Context
        4. 在本地手动管理聊天记录，用户可以（暂时不做）
            1. 删除之前的某一点聊天记录
            2. 把之前的聊天记录发给不同的LLM
    
