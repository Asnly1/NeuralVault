import { useState } from "react";

export function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [enableLocal, setEnableLocal] = useState(false);
  const shortcut = "Alt + Space";

  return (
    <div className="page-settings">
      <header className="page-header">
        <div className="header-title">
          <h1>设置</h1>
          <p className="header-subtitle">配置你的 NeuralVault</p>
        </div>
      </header>

      <div className="settings-content">
        {/* API 配置 */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <span className="section-icon">🔑</span>
            API 配置
          </h2>

          <div className="settings-group">
            <div className="setting-item">
              <label className="setting-label">OpenAI API Key</label>
              <input
                type="password"
                className="setting-input"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="setting-hint">用于云端 AI 模型调用</p>
            </div>
          </div>
        </section>

        {/* 本地模型 */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <span className="section-icon">🖥️</span>
            本地模型
          </h2>

          <div className="settings-group">
            <div className="setting-item">
              <div className="setting-row">
                <label className="setting-label">启用本地模型</label>
                <button
                  className={`toggle ${enableLocal ? "active" : ""}`}
                  onClick={() => setEnableLocal(!enableLocal)}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
              <p className="setting-hint">使用 Ollama 运行本地 LLM</p>
            </div>

            <div className="setting-item">
              <label className="setting-label">Ollama URL</label>
              <input
                type="text"
                className="setting-input"
                placeholder="http://127.0.0.1:11434"
                value={modelPath}
                onChange={(e) => setModelPath(e.target.value)}
                disabled={!enableLocal}
              />
            </div>
          </div>
        </section>

        {/* 快捷键 */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <span className="section-icon">⌨️</span>
            快捷键
          </h2>

          <div className="settings-group">
            <div className="setting-item">
              <label className="setting-label">快速捕获</label>
              <div className="shortcut-display">
                <kbd>{shortcut}</kbd>
              </div>
              <p className="setting-hint">呼出悬浮输入窗</p>
            </div>
          </div>
        </section>

        {/* 关于 */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <span className="section-icon">ℹ️</span>
            关于
          </h2>

          <div className="about-info">
            <p>
              <strong>NeuralVault</strong>
            </p>
            <p className="about-version">Version 0.1.0 (MVP)</p>
            <p className="about-desc">
              本地优先的智能第二大脑，基于 RAG 的个人助理。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

