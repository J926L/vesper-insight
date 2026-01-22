---
name: vesper_ops
description: Agentic rules and workflows for Vesper Insight (Rust/Python/Tauri)
---

# Agent Guidelines: Vesper Insight

This skill defines the **strict operational overrides** you must follow when working on the `vesper-insight` project.
These are NOT suggestions; they are constraints to ensure system stability and consistency.

## 1. 🔍 Context Awareness (Read First)

- **Root of Trust**: `Taskfile.yml` is the Source of Truth for all build/run commands. **Read it** before proposing any shell commands.
- **Architecture**:
  - `src/` (Root): Rust Backend (Data Ingestion).
  - `src/brain/`: Python AI Engine (Anomaly Detection).
  - `src/portal/`: Tauri v2 Frontend (Visualization).

## 2. ⚡ Execution Rules (Command Line)

所有核心操作必须通过 `task` 命令执行。

- **推荐**: 使用 `/dev` 工作流一键启动。
- **强制**: 禁止直接使用 `cargo run` 或 `python main.py` 进行常规开发。调试特定模块时请确保已执行 `task sync`。

## 3. 🐍 Python Development Rules (`src/brain`)

- **Package Manager**: **STRICTLY** use `uv`.
  - **BANNED**: `pip install`, `conda`, `poetry`.
  - **Add Package**: `uv pip install <package>` (active venv required) or propose adding to `Taskfile.yml`.
  - **Env Init**: Always suggest `task init-py` if `ImportError` occurs.
- **Code Style**:
  - Use `icecream` (`ic()`) for debugging instead of `print()`.
  - Type hints are **MANDATORY**.

## 4. 🦀 Rust Development Rules (`src/`)

- **Safety**: **NO** `unsafe` blocks allowed unless you explicitly explain why RAII cannot handle the case.
- **Verification**:
  - `cargo check` 已集成在 `task build-rust` 中。
- **Networking**: 后端使用 `pcap` 原始套接字。权限由 `task run-ingestion` 自动通过 `setcap` 处理，若报错请检查系统权限。

## 5. 🖥️ Frontend Rules (`src/portal`)

- **Package Manager**: **STRICTLY** `pnpm` (Corepack).
  - **BANNED**: `npm`, `yarn`, `bun`.
  - **Install**: `pnpm install`.
- **Platform**: Tauri v2 + React.
- **Data Access**:
  - **WARNING**: The web browser (`localhost:5173`) **CANNOT** access the SQLite database due to sandbox restrictions.
  - **Agent Action**: If debugging "no data" or "empty charts", verify if the user is checking the **Tauri App Window**, not Chrome/Edge.

## 6. 🐼 Infrastructure Rules (Redpanda)

- **Role**: High-performance Kafka-compatible broker.
- **Endpoint**: `localhost:19092` (No Auth/SASL by default in dev).
- **Diagnostics**:
  - **Connection Refused**: First action -> Run `task check`.
  - **Topic Missing**: Brain auto-creates topics, but Ingestion might fail if broker is down.
  - **Docker/Container**: Managed externally (see `/home/j/dockge/`). Do NOT try to `docker run` manually; assume `dockge` manages it.
- **Environment**: **Must** set `KAFKA_BROKER` if not using `localhost:19092`.

## 7. 🧪 AI Model & GPU Rules

- **VRAM Limit**:
  - Hardcoded to 60% fraction in `model.py` to protect the RTX 3060 (6GB).
  - **Agent Action**: If OOM occurs, DO NOT increase the fraction without checking `nvidia-smi`.
- **Warmup Phase**:
  - Model has a `window_size=50`. No alerts will be saved to SQLite during the first 50 flows.
  - **Agent Action**: If "no data in DB", first check if >50 flows have been processed in the `task run-brain` console.

## 7. 🧪 API Testing Rules (Bruno)

- **Source**: Collection files in `bruno/`.
- **Command**: `task run-api` (FastAPI/Uvicorn).
- **Endpoint**: `localhost:8888`.
- **Agent Action**:
  - Before testing, always ensure `task check` passes.
  - If API is down, suggest `task run-api`.
  - Prefer using Bruno files for exploring endpoints over manual `curl`.

## 9. 🛑 Common Pitfalls (Troubleshooting)

- **Redpanda**: If Kafka connection fails, check `task check`. Port `19092` MUST be open.
- **Database Path**: Tauri `tauri.conf.json` maps directly to `src/brain/alerts.db`. **DO NOT** move this file without updating the Tauri config.
- **Paths**:
  - Python root is `src/brain`. Do not run `python` from project root.
  - Frontend root is `src/portal`.
