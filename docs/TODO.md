1. ✅ HUD 通过快捷键唤醒（Option + Space），界面模仿 Raycast
2. ✅ Dashboard 中的 QuickCapture 模块 (Gemini 风格，左下角 + 号上传文件)
3. ✅ QuickCapture 使用 quickCapture API
4. ✅ Dashboard 把资源和任务联系的功能（点击资源卡片的 🔗 按钮选择任务关联）
5. ✅ 工作台需要看到和任务关联的资源
6. 工作台使用
   1. ✅ Tiptap + tiptap-markdown 实现富文本编辑
   2. ✅ react-zoom-pan-pinch 实现图片预览
   3. ✅ react-pdf-highlighter-extended 实现 pdf 阅读（支持文本高亮和区域截图）
7. ✅ HUD 粘贴文件/图片
8. ✅ dashboard 中的任务增删
   1. 增加任务：在 智能排序/手动排序的按钮旁边，增加一个 "+"号按钮，点开后用户可以手动创建一个任务：输入标题,描述（可选），优先级，due_date(可选)
   2. 删除任务：当鼠标浮选到某个任务上时，在右边出现一个垃圾桶符号，点击即可删除
9. ✅ workspace 任务资源的删除：在 workspace 左侧当鼠标浮选到某个资源上时，在右边出现一个垃圾桶符号，点击即可删除
10. ✅ Dashboard 中用户点击任务直接跳转到对应的 Workspace,但是悬浮到 TaskCard 上会在垃圾桶的旁边显示三个点，点击之后可以编辑 status, priority, title, description, due_date。请你创建一个 TaskEditCard 组件来实现这个功能，顺便把当前创建任务的功能也使用这个组件完成
11. ✅ 添加一个 Calender Page，用户可以在日历上查看任务，以及任务的完成情况。每个任务出现在对应的 due_date 上,如果完成了就划掉。用户可以点击每个任务来切换 todo/done
12. ✅ 在 Dashboard 的右上角添加一个按钮，点击可以查看今天已完成的任务，用户可以通过点击来重新回到 todo 状态。你可以创建一个新的 Component 来实现这个功能，新的 Component 里面可以包裹 TaskCard
13. Dashboard 中实现这个功能：拖拽资源到某个任务上即可实现绑定
14. ✅ 实现 Sidebar 的自定义大小，用户可以拖拽分界线来控制大小，点击右上角的按钮可以关闭 Sidebar
15. ✅ 实现 Workspace 三块区域的自定义大小，用户可以拖拽分界线来控制大小（就像 Vscode 一样）
