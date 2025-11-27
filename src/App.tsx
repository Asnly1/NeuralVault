import { FormEvent, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import "./App.css";

// as const: 这个数组里的值是固定死的，永远不会变，也不允许被修改，请把它当作字面量处理，而不是普通的字符串
const taskStatusValues = [
  "inbox",
  "todo",
  "doing",
  "done",
  "archived",
] as const;
const taskPriorityValues = ["high", "medium", "low"] as const;
const resourceTypeValues = [
  "text",
  "image",
  "pdf",
  "url",
  "epub",
  "other",
] as const;
const classificationValues = [
  "unclassified",
  "suggested",
  "linked",
  "ignored",
] as const;

const taskSchema = z.object({
  task_id: z.number(),
  uuid: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(taskStatusValues),
  priority: z.enum(taskPriorityValues),
  // z.coerce: 它是 Zod 的“宽容模式”。它会先尝试把输入的数据（可能是字符串、数字）强行转换为 Date 对象，然后再进行校验。
  due_date: z.coerce.date().nullable(),
  created_at: z.coerce.date().nullable(),
});

const resourceSchema = z.object({
  resource_id: z.number(),
  uuid: z.string(),
  display_name: z.string().nullable(),
  file_type: z.enum(resourceTypeValues),
  classification_status: z.enum(classificationValues),
  created_at: z.coerce.date().nullable(),
});

const dashboardSchema = z.object({
  tasks: z.array(taskSchema).default([]),
  resources: z.array(resourceSchema).default([]),
});

type Task = z.infer<typeof taskSchema>;
type Resource = z.infer<typeof resourceSchema>;
type DashboardData = z.infer<typeof dashboardSchema>;

// typeof taskStatusValues: 获取这个 JavaScript 变量在 TypeScript 层面对应的类型
// 因为加了 as const，所以它的类型是： readonly ["inbox", "todo", "doing", ...]
// [number]: 请给我这个数组里任意数字索引位置上的元素的类型
// 因为数组的索引是数字（0, 1, 2...），所以这就相当于把数组里所有的值拿出来，拼成一个联合类型
// 结果：type TaskStatus = "inbox" | "todo" | "doing" | "done" | "archived";
type TaskStatus = (typeof taskStatusValues)[number];
type TaskPriority = (typeof taskPriorityValues)[number];
type ResourceType = (typeof resourceTypeValues)[number];

const columns: { key: TaskStatus; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "todo", label: "Todo" },
  { key: "doing", label: "Doing" },
];

const priorityLabel: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const resourceTypeLabel: Record<ResourceType, string> = {
  text: "Text",
  image: "Image",
  pdf: "PDF",
  url: "URL",
  epub: "EPUB",
  other: "Other",
};

// Promise：代表这是一个异步操作。调用这个函数时，你拿不到现成的数据，只能拿到一个“取货凭证”。
// 你需要用 await 等待它完成，或者用 .then() 来处理结果。
// <DashboardData>：它告诉 TypeScript：“这个承诺兑现后，包在里面的数据绝对是符合 DashboardData 结构的对象。”
const fetchDashboardData = async (): Promise<DashboardData> => {
  const raw = await invoke("get_dashboard");
  // 1. 自动转换: 把日期转换成标准 JS Date 对象
  // 2. 检查类型
  return dashboardSchema.parse(raw);
};

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("inbox");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");

  // useMemo: 只有当 tasks 这个数据发生变化时，才重新运行里面的分组逻辑；否则，请直接给我上次算好的结果。
  const groupedTasks = useMemo(() => {
    // 1. 先初始化好所有桶，防止某些列没有任务时导致 undefined
    const acc: Record<string, Task[]> = {
      inbox: [],
      todo: [],
      doing: [],
      done: [],
      archived: [],
    };

    tasks.forEach((task) => {
      const statusKey = task.status.toLowerCase();
      if (acc[statusKey]) {
        acc[statusKey].push(task);
      } else {
        // 遇到未知状态，建议归档到 inbox 或者 ignored，防止丢失
        acc["inbox"].push(task);
      }
    });

    return acc;
  }, [tasks]);

  const reloadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardData();
      setTasks(data.tasks);
      setResources(data.resources);
    } catch (err) {
      console.error(err);
      if (err instanceof z.ZodError) {
        setError("数据格式校验失败，请联系开发者");
      } else {
        setError("加载数据失败");
      }
    } finally {
      setLoading(false);
    }
  };

  // 监听用户点击“创建任务”按钮的动作，收集表单数据，发给后端，然后更新界面
  const handleCreateTask = async (e: FormEvent) => {
    // 在 HTML 标准中，<form> 提交时默认会刷新整个页面。
    // 这是在阻止默认行为
    e.preventDefault();
    if (!title.trim()) {
      setError("请输入任务标题");
      return;
    }
    setError(null);
    try {
      await invoke("create_task", {
        payload: {
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        },
      });
      setTitle("");
      setDescription("");
      setStatus("inbox");
      setPriority("medium");
      setDueDate("");
      // 创建成功后刷新列表
      await reloadData();
    } catch (err) {
      console.error(err);
      setError("创建任务失败");
    }
  };

  useEffect(() => {
    let ignore = false; // 标志位：是否忽略本次结果

    const initLoad = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDashboardData();
        // 只有当组件没有卸载/重渲染时，才更新 State
        if (!ignore) {
          setTasks(data.tasks);
          setResources(data.resources);
        }
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError("初始化数据失败");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    initLoad();

    // 清理函数：组件卸载或下次 useEffect 执行前调用
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">NeuralVault</p>
          <h1>Dashboard / Page A</h1>
          <p className="muted">查看当前任务与未分类资源，创建新的入口任务。</p>
        </div>
        <div className="loader-area">
          {loading ? (
            <span className="pill">同步中…</span>
          ) : (
            <span className="pill ok">最新</span>
          )}
        </div>
      </header>

      <section className="create-card">
        <form onSubmit={handleCreateTask} className="create-form">
          <div className="field">
            <label>任务标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：整理会议纪要"
            />
          </div>
          <div className="field">
            <label>描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充上下文、来源或预期输出"
            />
          </div>
          <div className="field">
            <label>状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              <option value="inbox">Inbox</option>
              <option value="todo">Todo</option>
              <option value="doing">Doing</option>
            </select>
          </div>
          <div className="field">
            <label>优先级</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="field">
            <label>截止日期</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              placeholder="可选"
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "处理中..." : "创建任务"}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="grid">
        {columns.map((col) => (
          <div key={col.key} className="column">
            <div className="column-head">
              <h2>{col.label}</h2>
              <span className="count">
                {groupedTasks[col.key]?.length ?? 0}
              </span>
            </div>
            <div className="cards">
              {groupedTasks[col.key]?.length ? (
                groupedTasks[col.key].map((task) => (
                  <article key={task.task_id} className="card">
                    <div className="card-title">
                      {task.title || "未命名任务"}
                    </div>
                    {task.description ? (
                      <p className="card-desc">{task.description}</p>
                    ) : null}
                    <div className="meta">
                      <span className="pill subtle">
                        {priorityLabel[task.priority] || "Medium"}
                      </span>
                      {task.due_date ? (
                        <span className="pill warn">
                          Due: {task.due_date.toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty">暂无任务</div>
              )}
            </div>
          </div>
        ))}

        <div className="column resources">
          <div className="column-head">
            <h2>未分类资源</h2>
            <span className="count">{resources.length}</span>
          </div>
          <div className="cards">
            {resources.length ? (
              resources.map((res) => (
                <article key={res.resource_id} className="card">
                  <div className="card-title">
                    {res.display_name || "未命名文件"}
                  </div>
                  <div className="meta">
                    <span className="pill subtle">
                      {resourceTypeLabel[res.file_type] ?? res.file_type}
                    </span>
                    {res.created_at ? (
                      <span className="pill subtle">
                        {res.created_at.toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty">暂无未分类资源</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
