/**
 * 全文搜索：多 pattern（子串/通配符/正则）、上下文窗口、文件信息、
 * 多 source 并发（有界并发池）。
 */
import { findSessions, SOURCES, identityOf } from './core.js';
import fs from 'node:fs';

/**
 * 编译 pattern 列表：
 * - `re:/.../flags` 正则（默认 flags ''）
 * - 含 `*` 或 `?` 按通配符（转成 ^...$ 正则，大小写不敏感）
 * - 其余子串匹配（大小写不敏感）
 * @param {string[]} patterns
 */
export function compilePatterns(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error('至少一个查询 pattern（--search）');
  }
  return patterns.map((raw) => {
    const p = String(raw);
    const reMatch = p.match(/^re:\/(.*)\/([gimsuy]*)$/s);
    if (reMatch) {
      // 兼容单反斜杠（shell 直传）与双反斜杠（JSON/JS 字面量）两种写法：
      // 先按原文编译；命中不了/编译失败再把 \\ 归一为 \ 重试。
      const build = (body) => {
        try { return new RegExp(body, reMatch[2] || ''); } catch { return null; }
      };
      const BS = String.fromCharCode(92); // 一个反斜杠字符（避免转义歧义）
      const re = build(reMatch[1]) || build(reMatch[1].split(BS + BS).join(BS));
      if (!re) throw new Error(`无效正则 ${p}`);
      return { kind: 'regex', raw: p, re, test: (text) => { const m = re.exec(text); return m ? { matched: m[0] } : null; } };
    }
    if (p.includes('*') || p.includes('?')) {
      // 不锚定：搜索语义是“文本中包含匹配”，* / ? 作为段内通配符
      const esc = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]');
      const re = new RegExp(esc, 'i');
      return { kind: 'glob', raw: p, re, test: (text) => { const m = re.exec(text); return m ? { matched: m[0] } : null; } };
    }
    const needle = p.toLowerCase();
    return {
      kind: 'substring', raw: p,
      test: (text) => {
        const i = text.toLowerCase().indexOf(needle);
        return i >= 0 ? { matched: text.slice(i, i + p.length + 20) } : null;
      },
    };
  });
}

/**
 * 会话级搜索：任一 pattern 命中即记录该消息。
 *
 * @param {object} opts
 * @param {string[]} opts.sources         参与搜索的 source 列表
 * @param {object[]} opts.patterns        compilePatterns 的产物
 * @param {string[]} [opts.ids]           会话 ID（含前缀）过滤
 * @param {string}   [opts.team]          团队/内容过滤（复用 findSessions）
 * @param {string}   [opts.role]          角色过滤
 * @param {string}   [opts.cwd]           cwd 过滤
 * @param {number}   [opts.context=2]     命中消息前后各取 N 条
 * @param {number}   [opts.ctxChars=300]  上下文消息截断长度
 * @param {number}   [opts.jobs=3]        并发度
 * @param {number}   [opts.limit]         每个会话最多报告的命中条数
 * @returns {Promise<{matches: object[], scanned: object}>}
 */
export async function searchSessions(opts) {
  const {
    sources = [...SOURCES], patterns, ids = [], team = '', role = 'any', cwd = '',
    context = 2, ctxChars = 300, jobs = 3, limit = 20,
  } = opts;
  const t0 = Date.now();
  const scanned = { files: 0, sessions: 0, durationMs: 0, errors: 0 };

  // 1) 每个source独立过滤出目标会话（串行遍历，会话解析本身是本地IO）
  const perSource = [];
  for (const src of sources) {
    try {
      const list = await findSessions({
        source: src,
        ...(ids.length ? { id: ids[0] } : {}), // findSessions 单 id 语义
        ...(team ? { team } : {}),
        ...(role && role !== 'any' ? { role } : {}),
        ...(cwd ? { cwd } : {}),
      });
      scanned.sessions += list.length;
      perSource.push(...list.map((s) => ({ ...s, _src: src })));
    } catch { scanned.errors++; }
  }

  // 多 id：逐个前缀展开
  let targets = perSource;
  if (ids.length > 1) {
    const want = ids.map((i) => String(i).toLowerCase());
    targets = perSource.filter((s) => want.some((w) => s.id === w || s.id.toLowerCase().startsWith(w)));
  } else if (ids.length === 1) {
    const w = String(ids[0]).toLowerCase();
    targets = perSource.filter((s) => s.id === w || s.id.toLowerCase().startsWith(w));
  }

  // 2) 有界并发池执行会话级搜索
  const matches = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const sess = targets[cursor++];
      scanned.files++;
      try {
        const m = searchOneSession(sess, patterns, { context, ctxChars, limit });
        if (m) matches.push(m);
      } catch { scanned.errors++; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, targets.length || 1)) }, worker));

  matches.sort((a, b) => (a.fileInfo.modified < b.fileInfo.modified ? 1 : -1));
  scanned.durationMs = Date.now() - t0;
  return { matches, scanned };
}

/** 单会话搜索。无命中返回 null。 */
function searchOneSession(sess, patterns, { context, ctxChars, limit }) {
  const hits = [];
  sess.messages.forEach((msg, idx) => {
    for (const p of patterns) {
      const r = p.test(msg.text);
      if (r) {
        hits.push({
          msgIndex: idx,
          role: msg.role,
          ts: msg.ts,
          text: msg.text,
          matched: typeof r?.matched === 'string' ? r.matched : p.raw,
          pattern: p.raw,
          patternKind: p.kind,
          before: idx > 0 ? sess.messages.slice(Math.max(0, idx - context), idx)
            .map((m) => ({ role: m.role, ts: m.ts, text: clip(m.text, ctxChars) })) : [],
          after: sess.messages.slice(idx + 1, idx + 1 + context)
            .map((m) => ({ role: m.role, ts: m.ts, text: clip(m.text, ctxChars) })),
        });
        break; // 一条消息只报告第一个命中的 pattern
      }
    }
  });
  if (!hits.length) return null;
  const shown = hits.slice(0, limit);
  const fi = fileInfo(sess.file);
  const id = identityOf(sess);
  return {
    source: sess.source,
    sessionId: sess.id,
    title: id.name || sess.title || '',
    role: id.role || '',
    team: id.team || '',
    cwd: sess.cwd,
    model: sess.model,
    updated: sess.updated,
    messageCount: sess.messages.length,
    totalHits: hits.length,
    hits: shown,
    file: sess.file,
    fileInfo: fi,
  };
}

function clip(text, n) {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

/** 文件信息：大小/日期。 */
export function fileInfo(file) {
  const out = { sizeBytes: 0, size: '0 B', modified: '', created: '' };
  try {
    const st = fs.statSync(file);
    out.sizeBytes = st.size;
    out.size = formatBytes(st.size);
    out.modified = st.mtime.toISOString();
    out.created = st.birthtime && !Number.isNaN(st.birthtime.getTime()) ? st.birthtime.toISOString() : out.modified;
  } catch { /* DB 源用固定路径，同样报告 */ }
  return out;
}

/** 人类可读字节。 */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = -1;
  do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`;
}
