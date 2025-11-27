import { FormEvent, useState } from "react";

interface QuickCaptureProps {
  onCreateTask: (title: string, description: string) => Promise<void>;
  loading: boolean;
}

export function QuickCapture({ onCreateTask, loading }: QuickCaptureProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    // e.preventDefault(): 阻止表单的默认行为（比如提交、刷新页面等）。
    e.preventDefault();
    if (!title.trim()) return;

    await onCreateTask(title.trim(), description.trim());
    setTitle("");
    setDescription("");
    setExpanded(false);
  };

  return (
    <div className="quick-capture">
      <form onSubmit={handleSubmit}>
        <div className="capture-main">
          <input
            type="text"
            className="capture-input"
            placeholder="新建任务... 按 Enter 快速添加"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
          />
          <button
            type="submit"
            className="capture-btn"
            disabled={loading || !title.trim()}
          >
            {loading ? "..." : "+"}
          </button>
        </div>

        {expanded && (
          <div className="capture-expanded">
            <textarea
              className="capture-desc"
              placeholder="添加描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <div className="capture-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setExpanded(false);
                  setDescription("");
                }}
              >
                收起
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
