import test from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseCodex } from '../src/adapters/codex.js';
import { parse as parsePi } from '../src/adapters/pi.js';
import { parse as parseAionui } from '../src/adapters/aionui.js';
import { fromTranscriptRows, parseSession } from '../src/adapters/zcode.js';
import { rowsToMessages, rowToSession } from '../src/adapters/opencode.js';
import { flattenContent } from '../src/core.js';

// ---------- codex ----------

const CODEX_FIXTURE = [
  { timestamp: '2026-08-31T11:04:01Z', type: 'session_meta', payload: { id: '01a0577d', cwd: 'C:/w', originator: 'aionui-session', cli_version: '0.151.0', model_provider: 'ChatGPT' } },
  { timestamp: '2026-08-31T11:04:05Z', type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: '<skills_instructions>...' }] } },
  { timestamp: '2026-08-31T11:04:06Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '你好，查一下任务' }] } },
  { timestamp: '2026-08-31T11:05:10Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '好的' }] } },
  { type: 'response_item', payload: { type: 'reasoning', summary: [] } },
].map((j) => JSON.stringify(j)).join('\n');

test('codex parse: meta + 过滤注入 + 消息顺序', () => {
  const s = parseCodex(CODEX_FIXTURE, 'C:/f/rollout-x.jsonl');
  assert.equal(s.id, '01a0577d');
  assert.equal(s.cwd, 'C:/w');
  assert.equal(s.model, 'ChatGPT');
  assert.equal(s.messages.length, 2);
  assert.equal(s.messages[0].role, 'user');
  assert.equal(s.messages[0].text, '你好，查一下任务');
  assert.equal(s.messages[1].text, '好的');
  assert.equal(s.updated, '2026-08-31T11:05:10Z');
});

// ---------- pi ----------

const PI_FIXTURE = [
  { type: 'session', version: 3, id: '01a05c73', timestamp: '2026-09-01T10-11-17Z', cwd: 'D:/Project/x' },
  { type: 'model_change', id: 'e1', provider: 'nube', modelId: 'deepseek-v4-flash' },
  { type: 'message', id: 'm1', timestamp: '2026-09-01T10:11:36.500Z', message: { role: 'user', content: [{ type: 'text', text: 'aionui有一个RT-PRE-01的团队级任务' }] } },
  { type: 'message', id: 'm2', timestamp: '2026-09-01T10:13:46.826Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: '**inspecting**' }, { type: 'text', text: '开始查询' }] } },
  { type: 'message', id: 'm3', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash' }] } },
].map((j) => JSON.stringify(j)).join('\n');

test('pi parse: session 头 + 文本提取 + 跳过纯 toolCall', () => {
  const s = parsePi(PI_FIXTURE, 'C:/f/a.jsonl');
  assert.equal(s.id, '01a05c73');
  assert.equal(s.cwd, 'D:/Project/x');
  assert.equal(s.messages.length, 2);
  assert.equal(s.messages[0].text, 'aionui有一个RT-PRE-01的团队级任务');
  assert.equal(s.messages[1].text, '开始查询');
  assert.equal(s.updated, '2026-09-01T10:13:46.826Z');
});

// ---------- zcode ----------

const ZC_LINES = [
  { type: 'turn_started', timestamp: '2026-08-31T06:08:50Z', payload: { input: 'Inspect config' } },
  { type: 'model_request', timestamp: '2026-08-31T06:08:51Z', payload: { messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Inspect config' }] } },
  { type: 'model_complete', timestamp: '2026-08-31T06:09:01Z', payload: { content: '结论：不支持。', stopReason: 'tool-calls' } },
];

test('zcode transcript rows: user/assistant 提取', () => {
  const { messages } = fromTranscriptRows(ZC_LINES);
  assert.deepEqual(messages.map((m) => [m.role, m.text]), [
    ['user', 'Inspect config'],
    ['assistant', '结论：不支持。'],
  ]);
});

test('zcode: system-reminder 剔除 + 多轮重发去重', () => {
  const rows = [
    { type: 'model_request', timestamp: 'T1', payload: { messages: [
      { role: 'user', content: '<system-reminder>\nskills…' },
      { role: 'user', content: '第一问' },
    ] } },
    { type: 'model_complete', timestamp: 'T2', payload: { content: '答一' } },
    { type: 'model_complete', timestamp: 'T2b', payload: { content: '<thinking>内部推理不应进入聊天记录' } },
    { type: 'model_request', timestamp: 'T3', payload: { messages: [
      { role: 'user', content: '<system-reminder>\nskills…' },
      { role: 'user', content: '第一问' }, // 重发
      { role: 'user', content: '<system-reminder>TodoWrite…' },
      { role: 'user', content: '第二问' },
    ] } },
    { type: 'model_complete', timestamp: 'T4', payload: { content: '答二' } },
  ];
  const { messages } = fromTranscriptRows(rows);
  assert.deepEqual(messages.map((m) => [m.role, m.text]), [
    ['user', '第一问'],
    ['assistant', '答一'],
    ['user', '第二问'],
    ['assistant', '答二'],
  ]);
});

test('zcode parseSession: metadata + transcript 合成', () => {
  const meta = { agentId: 'agent_1', description: 'Locate retry config', cwd: 'C:/ws', profileId: 'general-purpose', createdAt: '2026-08-31T06:08:50Z', parentSessionId: 'sess_p' };
  const s = parseSession(meta, ZC_LINES, 'C:/t/transcript.jsonl');
  assert.equal(s.id, 'agent_1');
  assert.equal(s.title, 'Locate retry config');
  assert.equal(s.cwd, 'C:/ws');
  assert.equal(s.messages.length, 2);
  assert.equal(s.source, 'zcode');
});

// ---------- opencode ----------

test('opencode rowsToMessages: part 聚合 + 排序', () => {
  const msgs = [
    { id: 'msg_1', data: JSON.stringify({ role: 'user' }), time_created: 1000 },
    { id: 'msg_2', data: JSON.stringify({ role: 'assistant' }), time_created: 2000 },
  ];
  const parts = [
    { message_id: 'msg_1', data: JSON.stringify({ type: 'text', text: '问题A' }), time_created: 1001 },
    { message_id: 'msg_2', data: JSON.stringify({ type: 'text', text: '答案B' }), time_created: 2001 },
    { message_id: 'msg_2', data: JSON.stringify({ type: 'step-finish' }), time_created: 2002 },
  ];
  const out = rowsToMessages(msgs, parts);
  assert.deepEqual(out.map((m) => [m.role, m.text]), [['user', '问题A'], ['assistant', '答案B']]);
});

test('opencode rowToSession: title/model/directory', () => {
  const row = { id: 'ses_x', title: 'mcp服务角色权限分级实现', directory: 'C:/Users/x/Documents/Default Project', model: '{"id":"glm-5.2","providerID":"llm-k3s"}', time_updated: 1787710813470, project_id: 'proj:local' };
  const s = rowToSession(row, []);
  assert.equal(s.title, 'mcp服务角色权限分级实现');
  assert.equal(s.model, 'glm-5.2');
  assert.equal(s.cwd, 'C:/Users/x/Documents/Default Project');
  assert.equal(s.source, 'opencode');
  assert.ok(s.updated.includes('T'));
});

// ---------- aionui ----------

const AIONUI_STATE = JSON.stringify({
  id: '54509c90',
  updated_at: '2026-09-01T11:59:17Z',
  provider: 'openai', model: 'grok-4.5', cwd: 'C:/ws/feature-zdw',
  messages: [
    { role: 'user', content: [{ type: 'text', text: '## Team Governance\n...system...' }] },
    { role: 'user', content: [{ type: 'text', text: '## New Messages\n\n- Task assigned: G0-05\n\n## Current Task Board Summary\n\nShowing 1 of 8 tasks.\n\n| ID | Subject | Status |\n|---|---|---|\n| a | G0-05 | pending |\n\nYou are **工程师** (role: teammate). Proceed.' }] },
    { role: 'assistant', content: [{ type: 'provider_item', item: {} }, { type: 'text', text: 'FND-01 已完成实现。' }] },
  ],
});

test('aionui parse: 跳过系统注入 + 任务板在最后消息中', () => {
  const s = parseAionui(AIONUI_STATE, 'C:/state.json');
  assert.equal(s.id, '54509c90');
  assert.equal(s.model, 'grok-4.5');
  assert.equal(s.messages.length, 2);
  assert.equal(s.messages[0].role, 'user');
  assert.ok(s.messages[0].text.includes('Task assigned'));
  assert.equal(s.messages[1].text, 'FND-01 已完成实现。');
  assert.equal(s.updated, '2026-09-01T11:59:17Z');
});
