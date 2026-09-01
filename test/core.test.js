import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJsonl, flattenContent, byUpdatedDesc, textIncludes,
  extractBoard, identityOf, clip, findSessions, SOURCES,
} from '../src/core.js';

test('parseJsonl 解析合法行并跳过损坏行', () => {
  const rows = parseJsonl('{"a":1}\nbroken\n\n{"a":2}');
  assert.deepEqual(rows, [{ a: 1 }, { a: 2 }]);
});

test('flattenContent 支持字符串/数组/嵌套对象', () => {
  assert.equal(flattenContent('hi'), 'hi');
  assert.equal(flattenContent([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'a\nb');
  assert.equal(flattenContent([{ type: 'thinking', thinking: 'secret' }]), '');
  assert.equal(flattenContent([{ type: 'provider_item', item: {} }]), '');
  assert.equal(flattenContent({ text: 'x' }), 'x');
  assert.equal(flattenContent(null), '');
});

test('byUpdatedDesc 按 updated 倒序', () => {
  const arr = [{ updated: '2026-01-01' }, { updated: '2026-03-01' }, { updated: '2026-02-01' }];
  assert.deepEqual(arr.sort(byUpdatedDesc).map((x) => x.updated), ['2026-03-01', '2026-02-01', '2026-01-01']);
});

test('textIncludes 大小写不敏感', () => {
  assert.ok(textIncludes({ text: 'Hello RT-pre-01' }, 'rt-pre-01'));
  assert.ok(!textIncludes({ text: 'nope' }, 'rt-pre-01'));
});

test('extractBoard 提取任务板块并在 You are 前停止', () => {
  const text = '前文\n## Current Task Board Summary\n\nShowing 2 of 2 tasks.\n\n| ID |\n|---|\n| a | pending |\n\nYou are **X** (role: lead).';
  const board = extractBoard(text);
  assert.ok(board.includes('| a | pending |'));
  assert.ok(!board.includes('You are **X**'));
});

test('identityOf 提取 Name/Role/Team', () => {
  const s = {
    messages: [{
      text: '## Identity\nName: Aion CLI\nSlot ID: x\nRole: lead\n\n## Your Team\nTeam: RT-PRE-01 Task 水质检\nLeader: y',
    }],
  };
  const id = identityOf(s);
  assert.equal(id.name, 'Aion CLI');
  assert.equal(id.role, 'lead');
  assert.equal(id.team, 'RT-PRE-01 Task 水质检');
});

test('clip 截断并标注总长', () => {
  assert.equal(clip('short', 10), 'short');
  const c = clip('x'.repeat(30), 10);
  assert.ok(c.startsWith('xxxxxxxxxx'));
  assert.ok(c.includes('共 30 字符'));
});

test('findSessions 校验未知来源', async () => {
  await assert.rejects(() => findSessions({ source: 'nope' }), /未知来源/);
});

test('SOURCES 完整', () => {
  assert.deepEqual([...SOURCES].sort(), ['aionui', 'codex', 'opencode', 'pi', 'zcode']);
});
