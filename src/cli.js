import { parseArgs } from '../src/args.js';
import { findSessions, SOURCES, identityOf, extractBoard, clip } from '../src/core.js';
import { compilePatterns, searchSessions, formatBytes } from '../src/search.js';

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
    if (o.search.length) return await runSearch(o, (matches, scanned) => renderSearch(o, matches, scanned));

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

用法:
  会话查看: session-lens --source <name> [选项]
  全文搜索: session-lens --search <pattern> [pattern2 ...] [-s source1 -s source2 ...] [选项]

选项:
  -s, --source <name>   数据来源: ${SOURCES.join(' | ')}；可重复传入多个；--search 模式省略时扫全部
  --search <pattern>    全文搜索；可重复传入多个 pattern，任一命中即算
                        pattern 形式: 纯文本(子串) | 含 * ? 的通配符 | re:/正则/flags
  --context <N>         命中消息前后各显示 N 条 (默认 2)
  --ctx-chars <N>       上下文消息截断长度 (默认 300)
  -j, --jobs <N>        并发线程数 (默认 3)
  --limit <N>           每个会话最多报告命中条数 (默认 20)
  -n, --last <N>        显示最近 N 条文本消息 (默认 6)
  --chars <N>           每条消息最多显示字符数 (默认 4000)
  -t, --team <关键字>   团队/标题/内容过滤关键字
  -r, --role <role>     角色过滤: lead | teammate | any (默认 any)
  -i, --id <sessionId>  会话 ID（支持前缀；搜索模式可重复传多个）
  --cwd <路径>          按 cwd 包含匹配
  -l, --list            只列出匹配会话，不显示消息
  --json                JSON 输出
  --sources             列出支持的来源
  -h, --help            帮助

搜索示例:
  session-lens --search FND-01                          # 全部工具中找 FND-01
  session-lens --search 'FND-*' --search 're:/commit [0-9a-f]{7}/' -s aionui -s pi
  session-lens --search FND-0? -i 54509c90 -s aionui --context 3 --jobs 4

查看示例:
  session-lens -s aionui -t RT-PRE-01 -r lead -n 6
  session-lens -s pi --cwd enki-next-v9 -n 3`);
}

async function runSearch(o, render) {
  const patterns = compilePatterns(o.search);
  const { matches, scanned } = await searchSessions({
    sources: o.sources, patterns,
    ids: o._ids || [], team: o.team, role: o.role, cwd: o.cwd,
    context: o.context, ctxChars: o.ctxChars, jobs: o.jobs, limit: o.limit,
  });
  return render(matches, scanned);
}

function renderSearch(o, matches, scanned) {
  if (o.json) {
    console.log(JSON.stringify({
      query: { patterns: o.search, sources: o.sources, ids: o._ids || [], role: o.role, cwd: o.cwd, context: o.context, jobs: o.jobs },
      scanned,
      matches: matches.map((m) => ({ ...m, hits: m.hits.map((h) => ({ ...h, text: clip(h.text, o.chars) })) })),
    }, null, 2));
    return 0;
  }
  console.log(`搜索 ${o.search.join(' | ')} · 来源 ${o.sources.join(',')} · jobs=${o.jobs} · 扫描 ${scanned.files} 会话/${scanned.durationMs}ms`);
  if (!matches.length) { console.log('无命中。'); return 1; }
  for (const m of matches) {
    const id = identityOf({ messages: [] }); // noop，避免未用告警
    void id;
    console.log(`\n=== [${m.source}] ${m.sessionId}${m.title ? ` | ${m.title}` : ''}${m.role ? ` (${m.role})` : ''} ===`);
    console.log(`cwd=${m.cwd || '?'}  model=${m.model || '?'}  updated=${m.updated}  命中=${m.totalHits} 条`);
    console.log(`文件: ${m.file}`);
    console.log(`  大小: ${m.fileInfo.size} (${m.fileInfo.sizeBytes} B)  修改: ${m.fileInfo.modified}  创建: ${m.fileInfo.created}`);
    for (const h of m.hits) {
      console.log(`\n  -- 命中 #${h.msgIndex} [${h.role}] ${h.ts} · pattern=${h.pattern}(${h.patternKind}) --`);
      console.log('  ' + clip(h.text, o.chars).split('\n').join('\n  '));
      for (const b of h.before) console.log(`   ↑前 [${b.role}] ${clip(b.text, 200).split('\n').join(' ')}`);
      for (const a of h.after) console.log(`   ↓后 [${a.role}] ${clip(a.text, 200).split('\n').join(' ')}`);
    }
  }
  return 0;
}
