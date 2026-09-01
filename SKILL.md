---
name: session-lens
description: >-
  Read-only quick lookup of local chat histories for AI coding tools (codex,
  pi, zcode, opencode, aionui). Use when the user asks to check conversation
  progress, find a task's latest status, view a team task board, or inspect
  recent messages in any of these tools — e.g. "查一下 RT-PRE-01 的进展",
  "看看 pi 里最近的会话", "codex 上次聊到哪了", "查 codex/pi/zcode/opencode/aionui
  的聊天记录".
---

# session-lens — AI 工具聊天记录快速查询

只读查询本机 AI 编码工具（codex / pi / zcode / opencode / aionui）的聊天记录。仓库位置：`~/tools/session-lens`（若不同，以实际克隆路径为准，下同）。

## 用法

```bash
node ~/tools/session-lens/bin/session-lens.mjs -s <codex|pi|zcode|opencode|aionui> [选项]
```

常用选项：

- `-n <N>` 最近 N 条消息（默认 6）
- `--chars <N>` 每条消息截断长度（默认 4000）
- `-t <关键字>` 团队/标题/内容过滤
- `-r <lead|teammate|any>` 角色过滤（AionUi 团队会话用 `-r lead` 取 primary 角色）
- `-i <id>` 会话 ID；`--cwd <路径>` 按项目路径过滤
- `-l` 只列会话；`--json` 结构化输出

## 典型场景

```bash
# 1. 查 AionUi 团队任务进展（primary 角色 + 任务板）
node ~/tools/session-lens/bin/session-lens.mjs -s aionui -t RT-PRE-01 -r lead -n 6

# 2. 某项目下 pi 的最近会话
node ~/tools/session-lens/bin/session-lens.mjs -s pi --cwd enki-next-v9 -n 3

# 3. codex/zcode/opencode 最近会话列表，再挑一个看详情
node ~/tools/session-lens/bin/session-lens.mjs -s codex -l
node ~/tools/session-lens/bin/session-lens.mjs -s zcode -t 关键字 -n 4
node ~/tools/session-lens/bin/session-lens.mjs -s opencode -i ses_xxx --json
```

## 注意

- **只读**：工具绝不写入会话数据、不发送消息。
- 输出中的 `任务板` 块是 AionUi 团队会话的 task board 快照，可直接回报给用户。
- 若提示"未找到匹配的会话"，先用 `-l` 加 `-t` 缩小范围确认会话存在。
- 无依赖；opencode 数据源需 Node ≥ 22.5（内建 `node:sqlite`），其余来源 Node ≥ 18 即可。
