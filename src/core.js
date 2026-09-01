/**
 * session-lens 核心数据模型与查询管线。
 *
 * 设计原则：
 * - 只读：绝不写入任何会话文件。
 * - Provider 无关：每种工具实现一个 adapter，输出统一的 SessionData。
 * - 纯函数优先：adapter 与查询逻辑全部可独立单测。
 */

/** @typedef {{role:string, ts:string, text:string}} Message */

/**
 * @typedef {Object} SessionData
 * @property {string} id
 * @property {string} source          adapter 名（codex/pi/zcode/opencode/aionui）
 * @property {string} title
 * @property {string} cwd
 * @property {string} model
 * @property {string} updated         ISO 时间
 * @property {string} file            会话文件路径
 * @property {Message[]} messages     已按时间排序、已提取纯文本
 * @property {Record<string,string>} meta
 */

/**
 * 从 JSONL 文本流中解析 JSON 行，容忍损坏行。
 * @param {string} content
 * @returns {object[]}
 */
export function parseJsonl(content) {
  const out = [];
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* 跳过损坏行 */ }
  }
  return out;
}

/** 纯文本化任意 content 字段（string / 数组 / 对象）。 */
export function flattenContent(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => {
      if (typeof c === 'string') return c;
      if (c && typeof c === 'object') {
        if (typeof c.text === 'string') return c.text;
        if (typeof c.thinking === 'string') return '';
        if (c.type === 'provider_item') return '';
      }
      return '';
    }).filter(Boolean).join('\n');
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
  }
  return '';
}

/**
 * 剥离 AionUi 团队治理样板（## Team Governance ...），保留身份/新消息/任务板等有效部分。
 * 纯样板文本返回 ''。codex（aionui-session 来源）与 aionui adapter 共用。
 */
export function stripGovernanceBoilerplate(text) {
  if (!/^s*## Team Governance/.test(text)) return text;
  const keepFrom = ['## Your Identity', '## New Messages', '## Current Task Board Summary']
    .map((h) => text.indexOf(h)).filter((i) => i >= 0);
  if (!keepFrom.length) return '';
  return text.slice(Math.min(...keepFrom));
}

/** 按更新时间倒序。 */
export function byUpdatedDesc(a, b) {
  return a.updated < b.updated ? 1 : -1;
}

/** 在消息文本中匹配子串（大小写不敏感）。 */
export function textIncludes(msg, needle) {
  return msg.text.toLowerCase().includes(String(needle).toLowerCase());
}

/**
 * 提取“任务板”风格的摘要块（## Current Task Board Summary ... 直到空双换行后的 You are）。
 * 用于 AionUi 团队会话等。
 * @param {string} text
 */
export function extractBoard(text) {
  const m = text.match(/## Current Task Board Summary[\s\S]*?(?=\n\nYou are |\n## |$)/);
  return m ? m[0].trim() : '';
}

/**
 * 从第一条消息中提取会话身份（Name / Role / Team），用于团队类会话。
 */
export function identityOf(session) {
  const first = session.messages[0]?.text || '';
  const name = (first.match(/Name: ([^\n]+)/) || [])[1]
    || (first.match(/You are \*\*([^*]+)\*\*/) || [])[1] || '';
  const role = (first.match(/\nRole: ([^\n]+)/) || [])[1]
    || (first.match(/\(role: ([^)]+)\)/) || [])[1] || '';
  let team = (first.match(/## Your Team\nTeam: ([^\n]+)/) || [])[1] || '';
  if (!team) {
    for (const m of session.messages) {
      const t = m.text.match(/Team: ([^\n]+)/);
      if (t) { team = t[1]; break; }
    }
  }
  return { name: (name || '').trim(), role: (role || '').trim().toLowerCase(), team: (team || '').trim() };
}

/** 截断文本并标注总长。 */
export function clip(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + ` …[截断，共 ${text.length} 字符]`;
}

/**
 * 统一查询入口。
 *
 * @param {object} opts
 * @param {'codex'|'pi'|'zcode'|'opencode'|'aionui'} opts.source
 * @param {string} [opts.team]      团队/标题过滤关键字
 * @param {string} [opts.role]      角色过滤 lead|teammate|any（主要用于 aionui）
 * @param {string} [opts.id]        会话 ID 精确匹配
 * @param {string} [opts.cwd]       cwd 包含匹配
 * @param {number} [opts.limit]     最多列出的会话数
 * @returns {Promise<SessionData[]>} 按 updated 倒序
 */
export async function findSessions(opts) {
  const { source } = opts;
  const mod = await loadAdapter(source);
  let list = await mod.list();
  if (opts.id) {
    const want = String(opts.id).toLowerCase();
    list = list.filter((s) => s.id === opts.id || s.id.toLowerCase().startsWith(want));
  }
  if (opts.cwd) list = list.filter((s) => (s.cwd || '').toLowerCase().includes(String(opts.cwd).toLowerCase()));
  if (opts.team) {
    const needle = String(opts.team).toLowerCase();
    list = list.filter((s) => {
      const id = identityOf(s);
      return (s.title || '').toLowerCase().includes(needle)
        || id.team.toLowerCase().includes(needle)
        || s.messages.some((m) => textIncludes(m, opts.team));
    });
  }
  if (opts.role && opts.role !== 'any') {
    list = list.filter((s) => identityOf(s).role === opts.role);
  }
  list.sort(byUpdatedDesc);
  if (opts.limit) list = list.slice(0, Math.max(1, opts.limit));
  return list;
}

/** 已注册的 adapter。 */
export const SOURCES = ['codex', 'pi', 'zcode', 'opencode', 'aionui'];

async function loadAdapter(source) {
  if (!SOURCES.includes(source)) {
    throw new Error(`未知来源: ${source}（可用: ${SOURCES.join(', ')}）`);
  }
  return import(`./adapters/${source}.js`);
}
