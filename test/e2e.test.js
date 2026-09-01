/**
 * 端到端集成测试：构造 fake HOME（SESSION_LENS_HOME），对每个 source
 * 落盘最小 fixture，跑真实 list() → findSessions() → CLI 渲染。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli.js';

function makeFakeHome(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-lens-e2e-'));
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}

const lines = (arr) => arr.map((j) => JSON.stringify(j)).join('\n');

test('e2e: aionui 团队会话 lead 过滤 + 任务板 + 最近消息', async (t) => {
  const h = makeFakeHome(t);
  process.env.SESSION_LENS_HOME = h;
  t.after(() => { delete process.env.SESSION_LENS_HOME; });

  const sessDir = path.join(h, 'AppData/Roaming/AionUi/aionui/aionrs-sessions/sessions/abc123');
  fs.mkdirSync(sessDir, { recursive: true });
  fs.writeFileSync(path.join(sessDir, 'state.json'), JSON.stringify({
    id: 'abc123', updated_at: '2026-09-01T11:00:00Z', provider: 'openai', model: 'grok-4.5', cwd: 'C:/ws',
    messages: [
      { role: 'user', content: [{ type: 'text', text: '## Team Governance\n\n## Your Identity\nName: Aion CLI\nRole: lead\n\n## Your Team\nTeam: RT-PRE-01 Task demo' }] },
      { role: 'user', content: [{ type: 'text', text: '## New Messages\n\n- task assigned\n\n## Current Task Board Summary\n\nShowing 1 of 1 tasks.\n\n| ID | Subject | Status |\n|---|---|---|\n| t1 | FND-01 | in_progress |' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'FND-01 已提交，等待验证。' }] },
    ],
  }));

  // 真实查找
  const { findSessions } = await import('../src/core.js');
  const list = await findSessions({ source: 'aionui', team: 'RT-PRE-01', role: 'lead' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'abc123');
  // 身份消息（剥离样板后）+ 任务板消息 + assistant 回复
  assert.equal(list[0].messages.length, 3);
  assert.ok(list[0].messages[0].text.includes('Name: Aion CLI'));

  // CLI 渲染（stdout 捕获）
  const chunks = [];
  const orig = console.log;
  console.log = (...a) => chunks.push(a.join(' '));
  try {
    const code = await runCli(['-s', 'aionui', '-t', 'RT-PRE-01', '-r', 'lead', '-n', '2', '--chars', '500']);
    assert.equal(code, 0);
  } finally {
    console.log = orig;
  }
  const out = chunks.join('\n');
  assert.ok(out.includes('Aion CLI (role: lead)'));
  assert.ok(out.includes('| t1 | FND-01 | in_progress |'));
  assert.ok(out.includes('FND-01 已提交，等待验证。'));
});

test('e2e: codex fixture 过滤注入消息', async (t) => {
  const h = makeFakeHome(t);
  process.env.SESSION_LENS_HOME = h;
  t.after(() => { delete process.env.SESSION_LENS_HOME; });

  const d = path.join(h, '.codex/sessions/2026/08/31');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'rollout-2026-08-31T19-04-01-01a0577d.jsonl'), lines([
    { timestamp: '2026-08-31T11:04:01Z', type: 'session_meta', payload: { id: '01a0577d', cwd: 'C:/w', originator: 'aionui-session' } },
    { timestamp: '2026-08-31T11:04:06Z', type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: '<skills_instructions>inject</skills_instructions>' }] } },
    { timestamp: '2026-08-31T11:05:00Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'real question' }] } },
  ]));

  const { findSessions } = await import('../src/core.js');
  const list = await findSessions({ source: 'codex', id: '01a0577d' });
  assert.equal(list.length, 1);
  assert.equal(list[0].messages.length, 1);
  assert.equal(list[0].messages[0].text, 'real question');
});

test('e2e: opencode 空库/缺库给出可读错误', async (t) => {
  const h = makeFakeHome(t);
  process.env.SESSION_LENS_HOME = h;
  t.after(() => { delete process.env.SESSION_LENS_HOME; });

  const chunks = [];
  const origErr = console.error;
  console.error = (...a) => chunks.push(a.join(' '));
  try {
    const code = await runCli(['-s', 'opencode', '-l']);
    assert.equal(code, 1);
  } finally {
    console.error = origErr;
  }
  assert.ok(chunks.join('\n').includes('opencode'));
});
