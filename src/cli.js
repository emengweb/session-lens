import { parseArgs } from '../src/args.js';
import { findSessions, SOURCES, identityOf, extractBoard, clip } from '../src/core.js';

/**
 * CLI 入口。返回进程退出码。
 * @param {string[]} argv
 */
export async function runCli(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }

  if (o.help) {
    printHelp();
    return 0;
  }
  if (o.listSources) {
    console.log(SOURCES.join('\n'));
    return 0;
  }

  try {
    const sessions = await findSessions(o);
    if (!sessions.length) {
      console.error(`未找到匹配的会话（source=${o.source}${o.team ? ` team~"${o.team}"` : ''}${o.id ? ` id=${o.id}` : ''}）。`);
      return 1;
    }

    if (o.list) {
      for (const s of sessions) {
        const id = identityOf(s);
        console.log(`${s.id}\t${s.updated}\t${s.source}\t${id.name || s.title}\t(role:${id.role || '?'})\t${s.file}`);
      }
      return 0;
    }

    const s = sessions[0]; // findSessions 已按 updated 倒序
    if (o.json) {
      const out = {
        sessionId: s.id, source: s.source, name: identityOf(s).name || s.title,
        role: identityOf(s).role, team: identityOf(s).team,
        model: s.model, cwd: s.cwd, updated: s.updated, file: s.file,
        messageCount: s.messages.length,
        taskBoard: s.messages.length ? extractBoard(s.messages[s.messages.length - 1].text) : '',
        recent: s.messages.slice(-o.last).map((m) => ({ role: m.role, ts: m.ts, text: clip(m.text, o.chars) })),
      };
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }

    const id = identityOf(s);
    console.log(`== 会话 ${s.id} | ${id.name || s.title || '?'} (role: ${id.role || '?'}) [${s.source}] ==`);
    console.log(`cwd=${s.cwd || '?'}  model=${s.model || '?'}`);
    console.log(`updated=${s.updated}  消息数=${s.messages.length}  file=${s.file}`);
    const board = s.messages.length ? extractBoard(s.messages[s.messages.length - 1].text) : '';
    if (board) { console.log('\n---- 任务板 ----'); console.log(board); }
    console.log(`\n---- 最近 ${Math.min(o.last, s.messages.length)} 条文本消息 ----`);
    for (const m of s.messages.slice(-o.last)) {
      console.log(`\n--- ${m.role} ${m.ts} ---`);
      console.log(clip(m.text, o.chars));
    }
    return 0;
  } catch (e) {
    console.error(e.message);
    return 1;
  }
}

function printHelp() {
  console.log(`session-lens — 只读查询 AI 编码工具的本地聊天记录

用法: session-lens --source <codex|pi|zcode|opencode|aionui> [选项]

选项:
  -s, --source <name>   数据来源 (必填): ${SOURCES.join(' | ')}
  -n, --last <N>        显示最近 N 条文本消息 (默认 6)
  --chars <N>           每条消息最多显示字符数 (默认 4000)
  -t, --team <关键字>   团队/标题/内容过滤关键字
  -r, --role <role>     角色过滤: lead | teammate | any (默认 any)
  -i, --id <sessionId>  会话 ID（前缀亦可）
  --cwd <路径>          按 cwd 包含匹配
  -l, --list            只列出匹配会话，不显示消息
  --json                JSON 输出
  --sources             列出支持的来源
  -h, --help            帮助

示例:
  session-lens -s aionui -t RT-PRE-01 -r lead -n 6
  session-lens -s pi --cwd enki-next-v9 -n 3
  session-lens -s codex -l
  session-lens -s opencode --json -n 4`);
}
