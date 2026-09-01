/** Codex CLI — ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl（及 archived_sessions） */
import { parseJsonl, flattenContent, stripGovernanceBoilerplate } from '../core.js';
import { walkFiles, readFileSafe, home } from '../fsutil.js';
import path from 'node:path';

/** 从 JSONL 内容解析一个 codex 会话。 */
export function parse(content, file) {
  const lines = parseJsonl(content);
  const meta = lines.find((l) => l.type === 'session_meta')?.payload || {};
  const ts = lines.find((l) => l.type === 'event_msg' && l.payload?.type === 'thread_settings_applied')?.payload?.thread_settings;
  const modelParts = [ts?.model, meta.model_provider].filter(Boolean);
  const model = modelParts.length > 1 ? `${modelParts[0]} (${modelParts[1]})` : (modelParts[0] || '');
  const messages = [];
  for (const l of lines) {
    if (l.type !== 'response_item') continue;
    const p = l.payload || {};
    if (p.type !== 'message') continue;
    if (!['user', 'assistant', 'developer', 'system'].includes(p.role)) continue;
    // 跳过纯注入类 developer/system 长指令，保留用户可见消息
    const text = flattenContent(p.content);
    if (!text) continue;
    // 平台注入也以 user 角色出现（<recommended_plugins> 等）；对所有角色统一过滤
    if (/^<(recommended_plugins|skills_instructions|environment_context|permissions|user_instructions|turn_context|app_context|collaboration_mode|apps_instructions|plugins_instructions)/.test(text.trim().slice(0, 60))) continue;
    const cleaned = p.role === 'user' ? stripGovernanceBoilerplate(text) : text;
    if (!cleaned) continue;
    // developer/system 注入过滤：完整以 <tag> 开头，正文内嵌平台块，或多 agent 协作指令头
    if (p.role === 'developer' || p.role === 'system') {
      if (/^<[^>]+>/.test(text.trim().slice(0, 40))) continue;
      if (/<(skills_instructions|environment_context|permissions|user_instructions|turn_context|app_context|collaboration_mode|apps_instructions|plugins_instructions)[> ]/.test(text)) continue;
      if (/<(recipient|sender|author)>/.test(text.slice(0, 2000))) continue; // 团队 agent 分发指令
    }
    messages.push({ role: p.role, ts: l.timestamp || '', text: cleaned });
  }
  return {
    id: meta.id || path.basename(file || '', '.jsonl'),
    source: 'codex',
    title: meta.originator || meta.source || 'codex session',
    cwd: meta.cwd || '',
    model,
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
