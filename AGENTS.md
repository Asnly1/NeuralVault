# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the React front end (`main.tsx` entry, `App.tsx` root, `App.css` styles, assets in `src/assets/`); static files live in `public/`.
- `src-tauri/` contains the Rust side (`src/lib.rs` sets up state and plugins, `db.rs` hosts SQLx models/queries, `main.rs` launches the app), SQLite migrations in `src-tauri/migrations/` (packed by `sqlx::migrate!`), and configuration/icons such as `tauri.conf.json` and `icons/`.
- `docs/` keeps design notes and database references; build outputs land in `dist/` (Vite) and `src-tauri/target/` (Rust).

## Build, Test, and Development Commands
- `npm install` to sync JS deps; run from the repo root.
- `npm run dev` starts the Vite dev server; `npm run tauri dev` opens the desktop shell with the Rust backend.
- `npm run build` runs `tsc` type checks then bundles the frontend; `npm run preview` serves the built assets.
- `cargo test --manifest-path src-tauri/Cargo.toml` executes Rust/unit tests (DB helpers, migrations); `cargo fmt` before committing Rust changes.
- `npm run tauri build` packages the desktop app using `tauri.conf.json`.

## Coding Style & Naming Conventions
- TypeScript: functional React components, PascalCase for components/hooks, camelCase for vars/functions, 2-space indent; keep effects in hooks and avoid global state without context/providers.
- Rust: snake_case for functions/vars, PascalCase for structs/enums; keep async DB helpers in `db.rs` with explicit status/priority args to avoid hidden defaults.
- SQL migrations: timestamped files under `src-tauri/migrations/` named `YYYYMMDDHHMMSS_description.sql`; prefer additive changes and update queries to match new enums.

## Testing Guidelines
- Add Rust tests next to modules under `#[cfg(test)]` (see `db.rs`); use temp directories for SQLite paths and assert WAL/constraint behavior.
- Frontend tests are not configured; if adding Vitest/RTL, colocate under `src/**/__tests__/` and cover data flows over snapshots.
- Keep tests deterministic (no network), and reset DB fixtures between cases.

## Commit & Pull Request Guidelines
- Git history uses short, single-line summaries (English or Chinese) without prefixes; keep messages under ~50 chars and describe the change, not the issue number alone.
- PRs should summarize scope, call out whether changes touch frontend vs. Tauri/DB, link relevant docs/issues, and include screenshots/GIFs for UI updates.
- Note any migrations or breaking schema changes and list the commands run (build, tests, packaging) in the PR description.

## Data & Configuration Notes
- SQLite files are created in the OS app data dir via `AppState`; avoid hardcoded absolute paths and keep user data out of the repo.
- Keep secrets/config out of `tauri.conf.json` and source; prefer env vars or OS keychain integrations when added.
