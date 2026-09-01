import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compilePatterns, searchSessions } from '../src/search.js';

const lines = (arr) => arr.map((j) => JSON.stringify(j)).join('\n');

async function makeFixtureHome(t) {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'session-lens-fix-'));
  process.env.SESSION_LENS_HOME = h;
  t.after(() => { delete process.env.SESSION_LENS_HOME; fs.rmSync(h, { recursive: true, force: true }); });

  // aionui: sessA / sessB
  for (const [id, msgs] of [
    ['sessA', [
      { role: 'user', content: [{ type: 'text', text: 'alpha 内容' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'beta 回复' }] },
    ]],
    ['sessB', [
      { role: 'user', content: [{ type: 'text', text: 'gamma 另一个' }] },
    ]],
  ]) {
    const d = path.join(h, 'AppData/Roaming/AionUi/aionui/aionrs-sessions/sessions', id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({
      id, updated_at: '2026-09-01T11:00:00Z', model: 'm', cwd: 'C:/ws',
      messages: msgs.map((m) => ({ ...m, timestamp: '2026-09-01T11:00:00Z' })),
    }));
  }
  // pi: 01a0xyz
  const d2 = path.join(h, '.pi/agent/sessions/--d--');
  fs.mkdirSync(d2, { recursive: true });
  fs.writeFileSync(path.join(d2, '2026-09-01T10-00-00Z_01a0xyz.jsonl'), lines([
    { type: 'session', version: 3, id: '01a0xyz', timestamp: '2026-09-01T10:00:00Z', cwd: 'D:/p' },
    { type: 'message', id: 'm1', timestamp: '2026-09-01T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'pi 侧 delta' }] } },
  ]));
  return h;
}

test('FIX: 正则 g flag 不应因 lastIndex 跨文本失配', () => {
  const ps = compilePatterns(['re:/FND-\\d{2}/gi']);
  assert.ok(ps[0].test('FND-07 ok'), '第一次命中');
  assert.ok(ps[0].test('FND-08 ok'), '第二次也应命中（g flag 已剥离）');
  assert.ok(ps[0].test('先 FND-09 再说'));
});

test('FIX: 多个 -i 前缀应跨 source 全部生效', async (t) => {
  await makeFixtureHome(t);
  const r1 = await searchSessions({ sources: ['aionui', 'pi'], patterns: compilePatterns(['alpha']), ids: ['sess', '01a0'], jobs: 2 });
  assert.ok(r1.matches.some((m) => m.sessionId === 'sessA'), '前缀 sess 应放行 sessA');
  const r2 = await searchSessions({ sources: ['aionui', 'pi'], patterns: compilePatterns(['delta']), ids: ['01a0', 'zzz'], jobs: 2 });
  assert.ok(r2.matches.some((m) => m.sessionId === '01a0xyz'), '前缀 01a0 应放行 pi 会话（此前被 ids[0] 截断）');
  const r3 = await searchSessions({ sources: ['aionui'], patterns: compilePatterns(['alpha']), ids: ['zzz'], jobs: 1 });
  assert.deepEqual(r3.matches.map((m) => m.sessionId), [], '不匹配的前缀应过滤掉');
});

test('FIX: source 加载失败应记录 errorDetails', async (t) => {
  await makeFixtureHome(t);
  const res = await searchSessions({ sources: ['opencode'], patterns: compilePatterns(['x']), jobs: 1 });
  assert.ok(res.scanned.errorDetails.length >= 1, '应有错误详情');
  assert.ok(res.scanned.errorDetails[0].includes('opencode'));
});

test('FIX: 子串匹配对特殊正则字符安全', () => {
  const ps = compilePatterns(['a.b (c)']);
  assert.ok(ps[0].test('前缀 a.b (c) 后缀'), '字面量匹配');
  assert.ok(!ps[0].test('aXb (c)'), '. 不应作为任意字符');
});

test('FIX: 大写 İ 等Unicode大小写不炸', () => {
  const ps = compilePatterns(['istanbul']);
  assert.ok(ps[0].test('İstanbul 是城市'));
});
