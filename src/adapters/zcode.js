/** ZCode CLI — ~/.zcode/cli/agents 下的 sess 与 agent 子目录（transcript.jsonl + metadata.json） */
import path from 'node:path';
import { readFileSafe, listDirs, home } from '../fsutil.js';

const isReminder = (s) => s.startsWith('<system-reminder>') || s.startsWith('<system-reminder ');

/** 从 transcript 事件行提取 user/assistant 消息。导出以便单测。 */
export function fromTranscriptRows(lines) {
  const messages = [];
  let updated = '';
  const seenUser = new Set();
  for (const l of lines) {
    const t = l.type || '';
    if (t === 'model_request') {
      for (const m of (l.payload?.messages || [])) {
        if (m.role !== 'user') continue;
        const text = typeof m.content === 'string' ? m.content : flatten(m.content);
        if (!text || isReminder(text)) continue; // 跳过平台注入的 system-reminder
        // model_request 携带全量历史，同一 user 文本在多轮请求中重发；按文本去重，保留首次出现位置
        const key = text.length > 200 ? text.slice(0, 200) : text;
        if (seenUser.has(key)) continue;
        seenUser.add(key);
        messages.push({ role: 'user', ts: l.timestamp || '', text });
      }
    }
    if (t === 'model_complete' && l.payload?.content) {
      const text = String(l.payload.content);
      if (text && !text.startsWith('<thinking>')) {
        messages.push({ role: 'assistant', ts: l.timestamp || '', text });
      }
    }
    if (l.timestamp) updated = l.timestamp;
  }
  return { messages, updated };
}

function flatten(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).filter(Boolean).join('\n');
  }
  return '';
}

/** 从 metadata 对象 + transcript 事件行组装会话。导出以便单测。 */
export function parseSession(meta, lines, transcriptFile) {
  const { messages, updated } = fromTranscriptRows(lines);
  return {
    id: meta.agentId || path.basename(transcriptFile || '', '.jsonl'),
    source: 'zcode',
    title: meta.description || '',
    cwd: meta.cwd || '',
    model: meta.profileId || '',
    updated: updated || meta.createdAt || '',
    file: transcriptFile || '',
    messages,
    meta: { parentSessionId: meta.parentSessionId || '', profileId: meta.profileId || '' },
  };
}

export async function list() {
  const root = path.join(home(), '.zcode/cli/agents');
  const out = [];
  for (const sess of listDirs(root)) {
    const sessDir = path.join(root, sess);
    for (const agent of listDirs(sessDir)) {
      const agentDir = path.join(sessDir, agent);
      const meta = (() => {
        try { return JSON.parse(readFileSafe(path.join(agentDir, 'metadata.json')) || '{}'); } catch { return {}; }
      })();
      const content = readFileSafe(path.join(agentDir, 'transcript.jsonl'));
      if (!content) continue;
      const lines = content.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const s = parseSession(meta, lines, path.join(agentDir, 'transcript.jsonl'));
      if (s && s.messages.length) out.push(s);
    }
  }
  return out;
}
