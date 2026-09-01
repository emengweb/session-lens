/** Codex CLI — ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl（及 archived_sessions） */
import { parseJsonl, flattenContent } from '../core.js';
import { walkFiles, readFileSafe, home } from '../fsutil.js';
import path from 'node:path';

/** 从 JSONL 内容解析一个 codex 会话。 */
export function parse(content, file) {
  const lines = parseJsonl(content);
  const meta = lines.find((l) => l.type === 'session_meta')?.payload || {};
  const messages = [];
  for (const l of lines) {
    if (l.type !== 'response_item') continue;
    const p = l.payload || {};
    if (p.type !== 'message') continue;
    if (!['user', 'assistant', 'developer', 'system'].includes(p.role)) continue;
    // 跳过纯注入类 developer/system 长指令，保留用户可见消息
    const text = flattenContent(p.content);
    if (!text) continue;
    if ((p.role === 'developer' || p.role === 'system') && /^<[^>]+>/.test(text.trim().slice(0, 40))) continue;
    messages.push({ role: p.role, ts: l.timestamp || '', text });
  }
  return {
    id: meta.id || path.basename(file || '', '.jsonl'),
    source: 'codex',
    title: meta.originator || meta.source || 'codex session',
    cwd: meta.cwd || '',
    model: meta.model_provider || '',
    updated: lines.filter((l) => l.timestamp).map((l) => l.timestamp).sort().pop() || meta.timestamp || '',
    file: file || '',
    messages,
    meta: { cliVersion: meta.cli_version || '', originator: meta.originator || '' },
  };
}

export async function list() {
  const h = home();
  const files = [
    ...walkFiles(path.join(h, '.codex/sessions'), { maxDepth: 4 }),
    ...walkFiles(path.join(h, '.codex/archived_sessions'), { maxDepth: 1 }),
  ].filter((f) => f.endsWith('.jsonl'));
  const out = [];
  for (const f of files) {
    const c = readFileSafe(f);
    if (!c) continue;
    try { out.push(parse(c, f)); } catch { /* 忽略损坏文件 */ }
  }
  return out;
}
