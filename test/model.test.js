import test from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseCodex } from '../src/adapters/codex.js';
import { parse as parsePi } from '../src/adapters/pi.js';

// pi: model 来自 model_change 行
const PI_WITH_MODEL = [
  { type: 'session', version: 3, id: '01a05c73', timestamp: '2026-09-01T10:11:17Z', cwd: 'D:/x' },
  { type: 'model_change', id: 'e1', provider: 'codex-local', modelId: 'gpt-5.6-terra' },
  { type: 'message', id: 'm1', timestamp: '2026-09-01T10:11:36Z', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } },
].map((j) => JSON.stringify(j)).join('\n');

test('pi parse: 从 model_change 提取 model', () => {
  const s = parsePi(PI_WITH_MODEL, 'C:/f/a.jsonl');
  assert.equal(s.model, 'codex-local/gpt-5.6-terra');
});

// codex: model 来自 thread_settings_applied（event_msg）
const CODEX_WITH_SETTINGS = [
  { timestamp: '2026-08-31T11:04:01Z', type: 'session_meta', payload: { id: '01a0577d', cwd: 'C:/w', model_provider: 'ChatGPT' } },
  { timestamp: '2026-08-31T11:04:04Z', type: 'event_msg', payload: { type: 'thread_settings_applied', thread_settings: { model: 'gpt-5.6-terra' } } },
  { timestamp: '2026-08-31T11:04:06Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'q' }] } },
].map((j) => JSON.stringify(j)).join('\n');

test('codex parse: 从 thread_settings_applied 提取 model', () => {
  const s = parseCodex(CODEX_WITH_SETTINGS, 'C:/f/r.jsonl');
  assert.equal(s.model, 'gpt-5.6-terra (ChatGPT)');
});
