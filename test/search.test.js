import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compilePatterns, searchSessions, formatBytes } from '../src/search.js';
import { runCli } from '../src/cli.js';

const lines = (arr) => arr.map((j) => JSON.stringify(j)).join('\n');

// ---------- compilePatterns ----------

test('compilePatterns: 子串匹配大小写不敏感', () => {
  const ps = compilePatterns(['FND-01']);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].kind, 'substring');
  assert.ok(ps[0].test('当前 FND-01 已完成实现'));
  assert.ok(!ps[0].test('无关内容'));
});

test('compilePatterns: 通配符 * 与 ?', () => {
  const ps = compilePatterns(['FND-* 已*成']);
  assert.equal(ps[0].kind, 'glob');
  assert.ok(ps[0].test('FND-01 已完成'));
  assert.ok(!ps[0].test('FND-01 进行中'));
  const q = compilePatterns(['msg-?1']);
  assert.ok(q[0].test('msg-a1'));
  assert.ok(!q[0].test('msg-ab1'));
});

test('compilePatterns: re:/正则/flags', () => {
  const ps = compilePatterns(['re:/FND-\\d{2}/i']);
  assert.equal(ps[0].kind, 'regex');
  assert.ok(ps[0].test('先做 fnd-07 再说'));
  const m = ps[0].test('先做 FND-07 再说');
  assert.equal(m.matched, 'FND-07');
});

test('compilePatterns: 非法正则报清晰错误', () => {
  assert.throws(() => compilePatterns(['re:/FND-(/']), /无效正则/);
});

test('compilePatterns: 空列表报错', () => {
  assert.throws(() => compilePatterns([]), /至少一个/);
});

// ---------- searchSessions (fake home) ----------

async function makeFixtureHome(t) {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'session-lens-search-'));
  process.env.SESSION_LENS_HOME = h;
  t.after(() => { delete process.env.SESSION_LENS_HOME; fs.rmSync(h, { recursive: true, force: true }); });

  // aionui 会话：3 条消息，FND-01 在中间
  const d1 = path.join(h, 'AppData/Roaming/AionUi/aionui/aionrs-sessions/sessions/sessA');
  fs.mkdirSync(d1, { recursive: true });
  const stateA = {
    id: 'sessA', updated_at: '2026-09-01T11:00:00Z', model: 'grok-4.5', cwd: 'C:/ws/alpha',
    messages: [
      { role: 'user', content: [{ type: 'text', text: '## Your Identity\nName: Aion CLI\nRole: lead\n\n## Your Team\nTeam: RT-PRE-01 Task demo' }] },
      { role: 'user', content: [{ type: 'text', text: '开始 FND-01 Runtime Contract 开发' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'FND-01 已提交 commit 4b0c755' }] },
      { role: 'assistant', content: [{ type: 'text', text: '等待验证' }] },
    ],
  };
  fs.writeFileSync(path.join(d1, 'state.json'), JSON.stringify(stateA));

  // pi 会话：含通配符目标 FND-07
  const d2 = path.join(h, '.pi/agent/sessions/--D--proj--');
  fs.mkdirSync(d2, { recursive: true });
  fs.writeFileSync(path.join(d2, '2026-09-01T10-00-00Z_01a0aaa.jsonl'), lines([
    { type: 'session', version: 3, id: '01a0aaa', timestamp: '2026-09-01T10:00:00Z', cwd: 'D:/proj' },
    { type: 'message', id: 'm1', timestamp: '2026-09-01T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: '规划 FND-07 QA' }] } },
    { type: 'message', id: 'm2', timestamp: '2026-09-01T10:02:00Z', message: { role: 'assistant', content: [{ type: 'text', text: 'FND-07 需要 fixture' }] } },
  ]));

  // 无关 aionui 会话
  const d3 = path.join(h, 'AppData/Roaming/AionUi/aionui/aionrs-sessions/sessions/sessB');
  fs.mkdirSync(d3, { recursive: true });
  fs.writeFileSync(path.join(d3, 'state.json'), JSON.stringify({
    id: 'sessB', updated_at: '2026-09-02T09:00:00Z', model: 'm', cwd: 'C:/other',
    messages: [{ role: 'user', content: [{ type: 'text', text: '随便聊聊' }] }],
  }));
  return h;
}

test('searchSessions: 多 source + 子串 + 上下文 + 文件信息', async (t) => {
  await makeFixtureHome(t);
  const res = await searchSessions({
    sources: ['aionui', 'pi'], patterns: compilePatterns(['FND-01']),
    context: 1, ctxChars: 100, jobs: 2,
  });
  assert.equal(res.scanned.durationMs >= 0, true);
  assert.equal(res.matches.length, 1); // FND-01 只在 sessA（按会话聚合）
  const top = res.matches[0];
  assert.equal(top.source, 'aionui');
  assert.equal(top.sessionId, 'sessA');
  assert.ok(top.file.endsWith('state.json'));
  assert.ok(top.fileInfo.sizeBytes > 0);
  assert.ok(top.fileInfo.modified);
  assert.equal(top.hits.length, 2); // 两条消息命中，聚合在同一会话下
  const hit = top.hits[0];
  assert.equal(hit.msgIndex, 1);
  assert.ok(hit.text.includes('FND-01'));
  assert.equal(hit.before.length, 1); // context=1 → 身份消息
  assert.equal(hit.after.length, 1);
  assert.ok(hit.after[0].text.includes('4b0c755'));
});

test('searchSessions: 正则 + 单 source + ids 过滤', async (t) => {
  await makeFixtureHome(t);
  const res = await searchSessions({
    sources: ['aionui'], patterns: compilePatterns(['re:/commit [0-9a-f]{7}/i']),
    ids: ['sessA'], context: 0, ctxChars: 100, jobs: 1,
  });
  assert.equal(res.matches.length, 1);
  assert.equal(res.matches[0].hits.length, 1);
  assert.ok(res.matches[0].hits[0].text.includes('4b0c755'));
  assert.equal(res.matches[0].hits[0].before.length, 0);
});

test('searchSessions: 通配符跨 source 命中 pi', async (t) => {
  await makeFixtureHome(t);
  const res = await searchSessions({
    sources: ['aionui', 'pi'], patterns: compilePatterns(['FND-0?']),
    context: 0, ctxChars: 80, jobs: 3,
  });
  const piMatch = res.matches.find((m) => m.source === 'pi');
  assert.ok(piMatch, 'pi 会话应命中');
  assert.equal(piMatch.sessionId, '01a0aaa');
  assert.equal(piMatch.hits.length, 2);
});

test('searchSessions: 无命中返回空 matches 但带扫描统计', async (t) => {
  await makeFixtureHome(t);
  const res = await searchSessions({ sources: ['aionui'], patterns: compilePatterns(['zzz-not-exist']), jobs: 1 });
  assert.deepEqual(res.matches, []);
  assert.ok(res.scanned.files >= 2);
});

test('searchSessions: role 过滤在搜索模式生效', async (t) => {
  await makeFixtureHome(t);
  const res = await searchSessions({
    sources: ['aionui'], patterns: compilePatterns(['FND-01']), role: 'teammate', jobs: 1,
  });
  assert.deepEqual(res.matches, []); // fixture 是 lead
});

// ---------- CLI 集成 ----------

test('CLI --search 渲染文件信息与上下文', async (t) => {
  await makeFixtureHome(t);
  const chunks = [];
  const orig = console.log; console.log = (...a) => chunks.push(a.join(' '));
  let code;
  try { code = await runCli(['--search', 'FND-01', '-s', 'aionui', '-s', 'pi', '--context', '1', '--jobs', '2']); } finally { console.log = orig; }
  const out = chunks.join('\n');
  assert.equal(code, 0);
  assert.ok(out.includes('FND-01'));
  assert.ok(out.includes('state.json'));
  assert.ok(/大小|size/i.test(out));
  assert.ok(out.includes('sessA'));
});

test('CLI --search --json 结构完整', async (t) => {
  await makeFixtureHome(t);
  const chunks = [];
  const orig = console.log; console.log = (...a) => chunks.push(a.join(' '));
  let code;
  try { code = await runCli(['--search', 'FND-0?', '--json', '-s', 'aionui', '-s', 'pi']); } finally { console.log = orig; }
  assert.equal(code, 0);
  const doc = JSON.parse(chunks.join('\n'));
  assert.equal(doc.query.patterns.length, 1);
  assert.equal(doc.query.jobs, 3);
  assert.ok(doc.matches.length >= 2);
  const m = doc.matches[0];
  assert.ok(m.fileInfo.sizeBytes > 0);
  assert.ok(Array.isArray(m.hits[0].before) && Array.isArray(m.hits[0].after));
});

test('CLI --search 无 --source 时扫全部来源', async (t) => {
  await makeFixtureHome(t);
  const chunks = [];
  const orig = console.log; console.log = (...a) => chunks.push(a.join(' '));
  let code;
  try { code = await runCli(['--search', '随便', '--json']); } finally { console.log = orig; }
  assert.equal(code, 0);
  const doc = JSON.parse(chunks.join('\n'));
  assert.ok(doc.query.sources.includes('aionui'));
  assert.ok(doc.matches.length === 1 && doc.matches[0].sessionId === 'sessB');
});

// ---------- utils ----------

test('formatBytes 人类可读', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.ok(formatBytes(2048).endsWith('KB'));
  assert.ok(formatBytes(5 * 1024 * 1024).endsWith('MB'));
});
