import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('demo pages use a clear blue theme instead of the old paper and green palette', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(css, /--paper:\s*#eaf4ff;/);
  assert.match(css, /--accent:\s*#2563eb;/);
  assert.match(css, /\.mark\s*\{[\s\S]*background:\s*var\(--accent-strong\);/);
  assert.match(css, /\.bug-strip\s*\{[\s\S]*background:\s*#dbeafe;/);

  assert.doesNotMatch(css, /--paper:\s*#f7f4ec;/);
  assert.doesNotMatch(css, /--accent:\s*#0f766e;/);
  assert.doesNotMatch(css, /background:\s*#fffaf0;/);
});
