/** OpenCode — SQLite: ~/.local/share/opencode/opencode.db（session/message/part） */
import { toIso, home } from '../fsutil.js';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_PATH = () => path.join(home(), '.local/share/opencode/opencode.db');

function openDb() {
  // node:sqlite 是 Node 22.5+ 的内建模块；只读打开
  return new DatabaseSync(DB_PATH(), { readOnly: true });
}

/** 从 message/part 行组装消息（导出以便单测）。 */
export function rowsToMessages(messageRows, partRows) {
  const byMsg = new Map();
  for (const p of partRows) {
    const d = safeJson(p.data);
    if (!d) continue;
    const text = d.type === 'text' ? (d.text || '') : '';
    if (!text) continue;
    const arr = byMsg.get(p.message_id) || [];
    arr.push({ text, time: toIso(p.time_created) });
    byMsg.set(p.message_id, arr);
  }
  const out = [];
  for (const m of messageRows) {
    const d = safeJson(m.data);
    if (!d) continue;
    const role = d.role === 'user' ? 'user' : d.role === 'assistant' ? 'assistant' : null;
    if (!role) continue;
    const parts = (byMsg.get(m.id) || []).sort((a, b) => (a.time < b.time ? -1 : 1));
    const text = parts.map((x) => x.text).join('\n').trim();
    if (!text) continue;
    out.push({ role, ts: parts[0]?.time || toIso(m.time_created), text });
  }
  out.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return out;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/** 从 DB 行组装会话（导出以便单测）。 */
export function rowToSession(row, messages) {
  let model = '';
  try { model = JSON.parse(row.model || '{}').id || ''; } catch { /* noop */ }
  return {
    id: row.id,
    source: 'opencode',
    title: row.title || '',
    cwd: row.directory || '',
    model,
    updated: toIso(row.time_updated),
    file: DB_PATH(),
    messages,
    meta: { projectId: row.project_id || '', tokens: row.tokens_input || 0 },
  };
}

export async function list() {
  let db;
  try { db = openDb(); } catch (e) { throw new Error(`无法打开 opencode 数据库 ${DB_PATH()}: ${e.message}`); }
  try {
    const sessions = db.prepare('select * from session order by time_updated desc').all();
    const msgStmt = db.prepare('select id, data, time_created from message where session_id = ? order by time_created');
    const partStmt = db.prepare('select message_id, data, time_created from part where session_id = ? order by time_created');
    const out = [];
    for (const s of sessions) {
      const messageRows = msgStmt.all(s.id);
      const partRows = partStmt.all(s.id);
      out.push(rowToSession(s, rowsToMessages(messageRows, partRows)));
    }
    return out;
  } finally {
    try { db.close(); } catch { /* noop */ }
  }
}
