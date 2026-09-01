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

只读查询本机 AI 编码工具（codex / pi / zcode / opencode / aionui）的聊天记录。

## 定位仓库

仓库约定安装在 `D:/Project/session-lens`。若该路径不存在，按顺序探测：

```bash
for p in "D:/Project/session-lens" "$HOME/tools/session-lens"; do [ -f "$p/bin/session-lens.mjs" ] && REPO="$p" && break; done
echo "${REPO:-未找到，请克隆 https://github.com/emengweb/session-lens}"
```

## 用法

推荐 bun（实测快约 2 倍），无 bun 自动用 node。二进制可用时直接 `session-lens`（npm link 过）。

```bash
REPO=D:/Project/session-lens
bun "$REPO/bin/session-lens.mjs" -s <codex|pi|zcode|opencode|aionui> [选项]
# 或: node "$REPO/bin/session-lens.mjs" … 或: session-lens …
```

常用选项：

- `-n <N>` 最近 N 条消息（默认 6）；`--chars <N>` 每条截断（默认 4000）
- `-t <关键字>` 团队/标题/内容过滤；`-r <lead|teammate|any>` 角色过滤（AionUi 团队会话 `-r lead` 取 primary 角色）
- `-i <id>` 会话 ID（前缀即可，可重复传多个）；`--cwd <路径>` 按项目路径过滤
- `-l` 只列会话；`--json` 结构化输出
- **全文搜索**（定位任务进展最快方式）：
  - `--search <pattern>` 可重复传多个（OR）：纯文本子串 / `*``?` 通配符 / `re:/正则/flags`
  - `--context <N>` 命中前后各 N 条上下文（默认 2）；`--ctx-chars` 上下文截断（默认 300）
  - `-j <N>` 并发线程（默认 3）；`--limit <N>` 每会话最多报命中数（默认 20）
  - 省略 `-s` 时扫全部 5 个工具；结果含会话文件路径、大小、修改/创建时间

## 典型场景

```bash
# 1. 查 AionUi 团队任务进展（primary 角色 + 任务板）
bun "$REPO/bin/session-lens.mjs" -s aionui -t RT-PRE-01 -r lead -n 6

# 2. 某项目下 pi 的最近会话
bun "$REPO/bin/session-lens.mjs" -s pi --cwd enki-next-v9 -n 3

# 3. codex/zcode/opencode 最近会话列表，再挑一个看详情
bun "$REPO/bin/session-lens.mjs" -s codex -l
bun "$REPO/bin/session-lens.mjs" -s zcode -t 关键字 -n 4
bun "$REPO/bin/session-lens.mjs" -s opencode -i ses_xxx --json

# 4. 全文搜索：全工具扫关键字，带上下文与文件信息（快速定位首选）
bun "$REPO/bin/session-lens.mjs" --search FND-01 --search 're:/commit [0-9a-f]{7}/' -j 4
```

## 注意

- **只读**：工具绝不写入会话数据、不发送消息。
- 输出中的 `任务板` 块是 AionUi 团队会话的 task board 快照，可直接回报给用户。
- 若提示"未找到匹配的会话"，先用 `-l` 加 `-t` 缩小范围确认会话存在；或改用 `--search` 全文定位。
- 运行环境：优先 `bun`，其次 `node`（opencode 数据源需 Node ≥ 22.5 内建 `node:sqlite`；bun ≥ 1.1 内建兼容）。**零第三方依赖**，无需安装任何包；如确需临时工具，全局安装（`bun add -g` / `npm i -g`），不要写入本 skill。
