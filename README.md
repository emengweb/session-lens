# session-lens

**只读** 快速查询本地 AI 编码工具聊天记录的 CLI + Skill。一条命令查看某工具最近会话的进展摘要、任务板与最近消息，无需打开应用翻聊天记录。

支持：**Codex CLI**、**pi**、**ZCode CLI**、**OpenCode**、**AionUi**（团队会话含任务板/角色提取）。

## 设计原则

- **只读**：只读取会话文件/数据库（SQLite 只读连接），绝不写入、不发送消息。
- **本地**：所有数据来自本机 `~/.codex`、`~/.pi`、`~/.zcode`、`~/.local/share/opencode`、`%APPDATA%/AionUi`，无网络请求。
- **容错**：损坏的会话文件/行自动跳过，不影响其他会话。

## 安装

无依赖，只需 Node.js ≥ 22.5（用了内建 `node:sqlite`；不用 OpenCode 时 Node ≥ 18 即可，运行时会按需加载 adapter）。

```bash
git clone https://github.com/emengweb/session-lens.git
# 作为 skill 使用时，把整个目录链接/拷贝到各工具的 skill 目录（见下文"作为 Skill 安装"）
```

## 使用

```bash
node bin/session-lens.mjs -s <source> [选项]
# 或
npm link && session-lens -s <source>
```

| 选项 | 说明 | 默认 |
|------|------|------|
| `-s, --source` | 数据来源: `codex` `pi` `zcode` `opencode` `aionui` | 必填 |
| `-n, --last` | 显示最近 N 条文本消息 | 6 |
| `--chars` | 每条消息截断长度 | 4000 |
| `-t, --team` | 团队/标题/内容过滤关键字（大小写不敏感） | — |
| `-r, --role` | 角色过滤 `lead`/`teammate`/`any` | any |
| `-i, --id` | 会话 ID | — |
| `--cwd` | 按 cwd 包含匹配 | — |
| `-l, --list` | 只列会话（ID/时间/标题/路径），不显示消息 | — |
| `--json` | JSON 输出（任务板 + 最近消息） | — |
| `--sources` | 列出支持的来源 | — |

### 示例

```bash
# AionUi 团队任务 RT-PRE-01 的 primary(lead) 最新进展 + 任务板
session-lens -s aionui -t RT-PRE-01 -r lead -n 6

# pi 在 enki-next-v9 项目下的最近会话
session-lens -s pi --cwd enki-next-v9 -n 3

# Codex 最近会话列表
session-lens -s codex -l

# OpenCode 指定会话 JSON 输出
session-lens -s opencode --json -i ses_fc43...
```

## 作为 Skill 安装

每个工具一个 SKILL.md 入口，同一份脚本，指向仓库安装位置：

```bash
REPO=~/tools/session-lens   # 换成你的实际克隆路径
mkdir -p ~/.codex/skills ~/.zcode/skills ~/.config/opencode/skills ~/.pi/agent/skills

for tool in codex zcode opencode pi; do
  case $tool in
    codex)    dir=~/.codex/skills/session-lens ;;
    zcode)    dir=~/.zcode/skills/session-lens ;;
    opencode) dir=~/.config/opencode/skills/session-lens ;;
    pi)       dir=~/.pi/agent/skills/session-lens ;;
  esac
  mkdir -p "$dir"
  cp SKILL.md "$dir/SKILL.md"
done
```

SKILL.md 中的路径 `~/tools/session-lens` 需要改成你的仓库位置。

## 数据源位置

| source | 位置 | 格式 |
|--------|------|------|
| codex | `~/.codex/sessions/**` 与 `~/.codex/archived_sessions/` | JSONL（session_meta + response_item/message） |
| pi | `~/.pi/agent/sessions/<cwd-slug>/*.jsonl` | JSONL（session 头 + message 行） |
| zcode | `~/.zcode/cli/agents/sess_*/agent_*/` | `metadata.json` + `transcript.jsonl` |
| opencode | `~/.local/share/opencode/opencode.db` | SQLite（session/message/part 表） |
| aionui | `%APPDATA%/AionUi/aionui/aionrs-sessions/sessions/<id>/state.json` | JSON（messages 数组） |

## 架构

```
bin/session-lens.mjs   # 入口
src/
  args.js              # CLI 参数解析
  cli.js               # 输出渲染
  core.js              # 统一数据模型 + 查询管线
  fsutil.js            # 安全文件读取
  adapters/
    codex.js  pi.js  zcode.js  opencode.js  aionui.js   # 各工具格式 → SessionData
test/                 # node:test，24 个单测（纯函数 fixture 驱动）
```

新增一个工具 = 在 `src/adapters/` 加一个文件（实现 `parse()` + `list()`）+ fixture 单测，`core.js` 与 CLI 无需改动。

## 测试

```bash
npm test        # node --test
```

## License

MIT
