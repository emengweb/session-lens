import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('默认参数', () => {
  const o = parseArgs(['-s', 'aionui']);
  assert.equal(o.source, 'aionui');
  assert.equal(o.last, 6);
  assert.equal(o.chars, 4000);
  assert.equal(o.role, 'any');
  assert.equal(o.list, false);
});

test('全量参数', () => {
  const o = parseArgs(['--source', 'pi', '-n', '3', '--chars', '800', '-t', 'RT-PRE-01', '-r', 'lead', '-i', 'abc', '--cwd', 'D:/x', '-l', '--json']);
  assert.equal(o.source, 'pi');
  assert.equal(o.last, 3);
  assert.equal(o.chars, 800);
  assert.equal(o.team, 'RT-PRE-01');
  assert.equal(o.role, 'lead');
  assert.equal(o.id, 'abc');
  assert.equal(o.cwd, 'D:/x');
  assert.equal(o.list, true);
  assert.equal(o.json, true);
});

test('缺少 --source 报错', () => {
  assert.throws(() => parseArgs([]), /--source/);
});

test('非法来源报错', () => {
  assert.throws(() => parseArgs(['-s', 'chatgpt']), /--source/);
});

test('-n 非正整数报错', () => {
  assert.throws(() => parseArgs(['-s', 'pi', '-n', '0']), /正整数/);
  assert.throws(() => parseArgs(['-s', 'pi', '-n', 'x']), /正整数/);
});

test('未知参数报错', () => {
  assert.throws(() => parseArgs(['-s', 'pi', '--wat']), /未知参数/);
});

test('缺值报错', () => {
  assert.throws(() => parseArgs(['-s']), /缺少值/);
});

test('--help 与 --sources 不要求 source', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['--sources']).listSources, true);
});
