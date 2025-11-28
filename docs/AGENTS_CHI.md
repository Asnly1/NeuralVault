# 仓库指南

## 项目结构与模块组织
- `src/`：React 前端入口在 `main.tsx`，根组件 `App.tsx`，样式在 `App.css`，资源在 `src/assets/`；静态文件放在 `public/`。
- `src-tauri/`：Rust 侧代码（`src/lib.rs` 初始化状态与插件，`db.rs` 存放 SQLx 模型/查询，`main.rs` 启动应用），SQLite 迁移位于 `src-tauri/migrations/`（由 `sqlx::migrate!` 打包），配置与图标在 `tauri.conf.json`、`icons/`。
- `docs/`：设计说明与数据库参考；构建产物位于 `dist/`（Vite）与 `src-tauri/target/`（Rust）。

## 构建、测试与开发命令
- `npm install`：在仓库根目录安装前端依赖。
- `npm run dev` 启动 Vite 开发服务器；`npm run tauri dev` 运行桌面外壳并联动 Rust 后端。
- `npm run build` 先跑 `tsc` 类型检查再打包前端；`npm run preview` 本地预览打包结果。
- `cargo test --manifest-path src-tauri/Cargo.toml` 运行 Rust/单元测试（数据库辅助与迁移）；提交前执行 `cargo fmt` 格式化 Rust。
- `npm run tauri build` 按 `tauri.conf.json` 打包桌面应用。

## 代码风格与命名约定
- TypeScript：函数式 React 组件，组件/Hook 用 PascalCase，变量/函数用 camelCase，缩进 2 空格；副作用放在 Hook 中，避免无上下文的全局状态。
- Rust：函数/变量用 snake_case，结构体/枚举用 PascalCase；异步数据库函数集中在 `db.rs`，显式传入状态/优先级，避免依赖隐式默认值。
- SQL 迁移：`src-tauri/migrations/` 下使用 `YYYYMMDDHHMMSS_description.sql` 时间戳命名；优先追加式变更，并同步更新查询以匹配新枚举值。

## 测试指南
- Rust 测试紧邻模块并置于 `#[cfg(test)]`（示例见 `db.rs`）；使用临时目录作为 SQLite 路径，验证 WAL/约束行为。
- 前端测试未配置；如需加入 Vitest/RTL，放在 `src/**/__tests__/`，优先覆盖数据流逻辑而非快照。
- 保持测试可重复（无网络依赖），用例间重置数据库初始数据。

## 提交与 PR 指南
- Git 历史使用简短单行摘要（中英文皆可），无需前缀，建议 50 字符内，描述改动而非仅写 issue 编号。
- PR 需概述变更范围，标注是否影响前端或 Tauri/数据库，关联相关文档/issue，UI 变更附截图或 GIF。
- 若包含迁移或破坏性 schema 变更，在描述中列出执行过的命令（构建、测试、打包）。

## 数据与配置注意事项
- SQLite 文件由 `AppState` 在操作系统应用数据目录创建；避免硬编码绝对路径，不要将用户数据提交到仓库。
- 机密与配置不要写入 `tauri.conf.json` 或源码；如需敏感配置，优先使用环境变量或系统密钥链集成。
