import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('demo pages use a red theme while keeping title text color unchanged', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(css, /--paper:\s*#b91c1c;/);
  assert.match(css, /--ink:\s*#1f2937;/);
  assert.match(css, /--panel:\s*#fee2e2;/);
  assert.match(css, /--accent:\s*#dc2626;/);
  assert.match(css, /--accent-strong:\s*#991b1b;/);
  assert.match(css, /--shadow:\s*0 18px 40px rgba\(127,\s*29,\s*29,\s*0\.24\);/);
  assert.match(css, /rgba\(254,\s*202,\s*202,\s*0\.38\)/);
  assert.match(css, /\.hero h1,\s*[\s\S]*\.report-title h1,\s*[\s\S]*\.admin-header h1\s*\{[\s\S]*color:\s*var\(--ink\);/);
  assert.match(css, /\.mark\s*\{[\s\S]*background:\s*var\(--accent-strong\);/);
  assert.match(css, /\.bug-strip\s*\{[\s\S]*background:\s*#fecaca;/);

  assert.doesNotMatch(css, /--paper:\s*#f3f4f6;/);
  assert.doesNotMatch(css, /--accent:\s*#6b7280;/);
  assert.doesNotMatch(css, /rgba\(31,\s*41,\s*55,\s*0\.08\)/);
  assert.doesNotMatch(css, /--paper:\s*#f7f4ec;/);
  assert.doesNotMatch(css, /--accent:\s*#2563eb;/);
  assert.doesNotMatch(css, /background:\s*#fffaf0;/);
});
