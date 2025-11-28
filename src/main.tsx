import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HUDPage } from "./pages";

// 根据 URL hash 判断渲染哪个组件
// 主窗口: index.html (无 hash 或其他 hash)
// HUD 窗口: index.html#/hud
function Root() {
  // window.location.hash: 获取当前 URL 的哈希部分（从 # 开始的部分）
  // HUD URL: "url": "index.html#/hud", 定义在 tauri.conf.json 中
  const hash = window.location.hash;

  if (hash === "#/hud") {
    return <HUDPage />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
