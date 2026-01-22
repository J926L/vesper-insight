---
description: dev 合并 main
---

# Workflow: Squash Release to Main

此工作流用于将 `dev` 的所有变更压合为一个整洁的提交并发布到 `main`。

## Steps

1. **同步分支**
   // turbo
   `git checkout main && git pull origin main && git checkout dev && git pull origin dev`

2. **执行压合合并**
   // turbo
   `git checkout main && git merge --squash dev`

3. **提交变更**
   使用如下模板进行提交补充（由 Agent 根据 commit history 自动生成）：

   ```text
   feat: release vX.Y.Z

   [功能 A] - 描述内容
   [修复 B] - 描述内容
   [优化 C] - 描述内容
   ```

4. **推送与清理**
   // turbo
   `git push origin main && git checkout dev`
