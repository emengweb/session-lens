import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';
import { home } from '../src/fsutil.js';

test('fsutil home: SESSION_LENS_HOME 覆盖默认主目录', () => {
  const orig = process.env.SESSION_LENS_HOME;
  try {
    process.env.SESSION_LENS_HOME = 'D:/fake-home';
    assert.equal(home(), 'D:/fake-home');
  } finally {
    if (orig === undefined) delete process.env.SESSION_LENS_HOME; else process.env.SESSION_LENS_HOME = orig;
  }
});
