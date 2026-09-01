#!/usr/bin/env node
/** session-lens — 只读查询 AI 编码工具的本地聊天记录（codex / pi / zcode / opencode / aionui） */
import { runCli } from '../src/cli.js';

const code = await runCli(process.argv.slice(2));
process.exit(code);
