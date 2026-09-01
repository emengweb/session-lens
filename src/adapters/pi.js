/** pi — ~/.pi/agent/sessions/<cwd-slug>/<timestamp>_<uuid>.jsonl */
import { parseJsonl, flattenContent } from '../core.js';
import { walkFiles, readFileSafe, home } from '../fsutil.js';
import path from 'node:path';

/** 从 JSONL 内容解析一个 pi 会话。 */
export function parse(content, file) {
  const lines = parseJsonl(content);
  const head = lines.find((l) => l.type === 'session') || {};
  const mc = [...lines].reverse().find((l) => l.type === 'model_change');
  const model = mc ? [mc.provider, mc.modelId].filter(Boolean).join('/') : '';
  const messages = [];
  let lastTs = head.timestamp || '';
  for (const l of lines) {
    if (l.type !== 'message' || !l.message) continue;
    const m = l.message;
    if (!['user', 'assistant'].includes(m.role)) continue;
    const text = flattenContent(m.content);
    if (!text) continue;
    const ts = l.timestamp || '';
    if (ts) lastTs = ts;
    messages.push({ role: m.role, ts, text });
  }
  const title = messages.find((m) => m.role === 'user')?.text?.slice(0, 60)?.replace(/\s+/g, ' ').trim() || head.id || '';
  return {
    id: head.id || path.basename(file || '', '.jsonl'),
    source: 'pi',
    title,
    cwd: head.cwd || '',
    model,
    updated: (lastTs || '').replace(/-/g, (c, i) => (i === 4 || i === 7 ? '-' : c)),
    file: file || '',
    messages,
    meta: {},
  };
}

export async function list() {
  const h = home();
  const files = walkFiles(path.join(h, '.pi/agent/sessions'), { maxDepth: 2 })
    .filter((f) => f.endsWith('.jsonl'));
  const out = [];
  for (const f of files) {
    const c = readFileSafe(f);
    if (!c) continue;
    try { out.push(parse(c, f)); } catch { /* 忽略损坏文件 */ }
  }
  return out;
}
