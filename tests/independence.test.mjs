import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// This repository stands alone: nothing may depend on, import from or name the retired weezy-ios project,
// and the app service is named in exactly one place (extensions/app-images/src/app-service.mjs).
const root = new URL('../', import.meta.url).pathname;
const files = execFileSync('git', ['ls-files'], {cwd: root, encoding: 'utf8'}).split('\n').filter(Boolean)
  .filter(f => /\.(mjs|js|ts|tsx|json|toml|md|yml)$/.test(f) && f !== 'package-lock.json' && f !== 'docs/EXTRACTION.json' && f !== 'tests/independence.test.mjs');

test('no file depends on or names weezy-ios (docs/EXTRACTION.json keeps the history)', () => {
  const hits = files.filter(f => /weezy-ios|weezy ios/i.test(readFileSync(root + f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('the app service URL lives only in app-service.mjs', () => {
  const hits = files.filter(f => f !== 'extensions/app-images/src/app-service.mjs' && /\.fly\.dev/.test(readFileSync(root + f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('every dependency comes from the npm registry', () => {
  const lock = JSON.parse(readFileSync(root + 'package-lock.json', 'utf8'));
  const odd = Object.entries(lock.packages || {}).filter(([k, v]) => k && !v.link && v.resolved && !v.resolved.startsWith('https://registry.npmjs.org/')).map(([k]) => k);
  assert.deepEqual(odd, []);
});
