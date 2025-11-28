import { useState, useEffect, useRef, FormEvent } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { quickCapture } from "../api";
import "./HUD.css";

export function HUDPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // useRef: 创建一个可变的引用，可以用来存储任何类型的值，包括 DOM 元素
  // HTMLInputElement: 表示 HTML 中的 <input> 元素
  // null: 初始值为 null，表示还没有关联任何 DOM 元素
  const inputRef = useRef<HTMLInputElement>(null);

  // 监听 hud-focus 事件，聚焦输入框
  // 方向：后端 -> 前端。
  // 场景：当用户在系统层面按下快捷键唤起窗口时，Rust 后端会发送 hud-focus 信号。
  useEffect(() => {
    // 第一个参数是事件名称
    // 第二个参数是回调函数
    // 每当 Rust 后端（或者其他地方）发送了一个名为 "hud-focus" 的消息，前端就会立即运行这个回调函数
    const unlisten = listen("hud-focus", () => {
      inputRef.current?.focus();
      setInput("");
      setSuccess(false);
    });

    // 初始聚焦
    inputRef.current?.focus();

    // useEffect的return在
    // 1. 组件卸载时执行
    // 2. 依赖项变化时执行
    return () => {
      // 当listen 函数被调用时，会返回一个函数，这个函数可以用来取消监听
      // 这个函数就是 unlisten，用来取消监听
      // fn 是 unlisten 函数返回的函数
      // fn() 调用这个函数，取消监听
      unlisten.then((fn) => fn());
    };
  }, []);

  // 监听 Escape 键隐藏窗口
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 方向：前端 -> 后端。
      // 场景：用户按了 ESC，或者点击了窗口外部，或者提交成功了。
      if (e.key === "Escape") {
        emit("hud-blur");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 窗口失焦时隐藏
  useEffect(() => {
    const handleBlur = () => {
      // 延迟一下，避免点击窗口内元素时触发
      // setTimeout(要做的事情, 等待的毫秒数);
      setTimeout(() => {
        // document.hasFocus(): 检查当前窗口是否是焦点窗口
        // 如果当前窗口不是焦点窗口，则发送 hud-blur 信号
        if (!document.hasFocus()) {
          emit("hud-blur");
        }
      }, 100);
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    try {
      // TODO: 添加文件上传功能
      await quickCapture({
        content: input.trim(),
        file_type: "text",
      });
      setSuccess(true);
      setInput("");

      // 成功后短暂显示，然后隐藏窗口
      setTimeout(() => {
        emit("hud-blur");
        setSuccess(false);
      }, 600);
    } catch (err) {
      console.error("Capture failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hud-container">
      <form onSubmit={handleSubmit} className="hud-form">
        <div className="hud-icon">
          {loading ? (
            <span className="hud-spinner">◌</span>
          ) : success ? (
            <span className="hud-success">✓</span>
          ) : (
            <span className="hud-logo">◆</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          className="hud-input"
          placeholder="快速捕获... 按 Enter 保存，Esc 关闭"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          autoFocus
        />
        {input.trim() && !loading && (
          <button type="submit" className="hud-submit">
            ↵
          </button>
        )}
      </form>
    </div>
  );
}
