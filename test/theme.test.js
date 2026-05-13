import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('demo pages use a clear green theme', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(css, /--paper:\s*#ecfdf3;/);
  assert.match(css, /--accent:\s*#16a34a;/);
  assert.match(css, /rgba\(22,\s*163,\s*74,\s*0\.08\)/);
  assert.match(css, /\.mark\s*\{[\s\S]*background:\s*var\(--accent-strong\);/);
  assert.match(css, /\.bug-strip\s*\{[\s\S]*background:\s*#bbf7d0;/);

  assert.doesNotMatch(css, /--paper:\s*#f7f4ec;/);
  assert.doesNotMatch(css, /--accent:\s*#2563eb;/);
  assert.doesNotMatch(css, /background:\s*#fffaf0;/);
});
