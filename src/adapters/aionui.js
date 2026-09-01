/** AionUi — aionrs 会话: ~/AppData/Roaming/AionUi/aionui/aionrs-sessions/sessions/<id>/state.json */
import fs from 'node:fs';
import path from 'node:path';
import { flattenContent, parseJsonl } from '../core.js';
import { listDirs, readFileSafe, home } from '../fsutil.js';

/** 解析 state.json（messages 数组或 JSONL 文本）。 */
export function parse(content, file) {
  let doc;
  try { doc = JSON.parse(content); } catch { return null; }
  const raw = doc.messages || [];
  const messages = [];
  for (const m of raw) {
    let role = m.role || '?';
    let ts = m.timestamp || '';
    let text = '';
    if (Array.isArray(m.content)) {
      text = flattenContent(m.content);
    } else if (typeof m.content === 'string') {
      text = m.content;
    } else if (m.content && typeof m.content === 'object' && m.content.text) {
      text = String(m.content.text);
    }
    if (!text) continue;
    if (/^\s*## Team Governance/.test(text)) {
      // 剥离治理样板，保留身份/新消息/任务板等有效部分；纯样板则丢弃
      const keepFrom = ['## Your Identity', '## New Messages', '## Current Task Board Summary']
        .map((h) => text.indexOf(h)).filter((i) => i >= 0);
      if (!keepFrom.length) continue;
      text = text.slice(Math.min(...keepFrom));
    }
    messages.push({ role, ts, text });
  }
  return {
    id: doc.id || path.basename(path.dirname(file || '')),
    source: 'aionui',
    title: doc.title || '',
    cwd: doc.cwd || '',
    model: doc.model || '',
    updated: doc.updated_at || doc.updated || '',
    file: file || '',
    messages,
    meta: { provider: doc.provider || '' },
  };
}

export async function list() {
  const root = path.join(home(), 'AppData/Roaming/AionUi/aionui/aionrs-sessions/sessions');
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const id of listDirs(root)) {
    const f = path.join(root, id, 'state.json');
    const c = readFileSafe(f);
    if (!c) continue;
    const s = parse(c, f);
    if (s) out.push(s);
  }
  return out;
}
