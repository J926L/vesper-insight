---
name: vesper_ops
description: Rules for Vesper Insight (Rust/Python/Tauri)
---

# Vesper Insight Ops

- **SSOT**: `Taskfile.yml`. **Read first**.
- **Execution**: `task <subcommand>` ONLY. **Ban** direct `cargo`/`python` run.

## 1. Stack

- **Backend (🦀 Rust)**: `src/`. `pcap` ingestion. `setcap` required (auto in `task`). **Zero** `unsafe`.
- **AI Engine (🐍 Python)**: `src/brain/`. **Pixi/uv Only**. **Ban** `pip`/`conda`. Use `ic()` for debug.
- **Portal (🖥️ Tauri v2)**: `src/portal/`. **pnpm Only**. **Web Sandbox**: Browser cannot access SQLite. **Use Tauri App window**.

## 2. Infrastructure

- **Broker**: Redpanda @ `localhost:19092`. Managed by Dockge.
- **Storage**: SQLite @ `src/brain/alerts.db`. Hard-linked in `tauri.conf.json`. **Ban** move.
- **API**: FastAPI @ `localhost:8888`. Ref `bruno/`.

## 3. Constraints

- **GPU**: RTX 3060 (6GB). VRAM fraction <= 0.6. **Task** `gpu:check` before big ops.
- **Warmup**: `window_size=50`. No DB persistence for first 50 flows.

## 4. Troubleshooting

- `task check`: First response to any error.
- `task init-py`: Fix `ImportError`.
- **No Data**: Check Tauri Window + Warmup count (>50).
