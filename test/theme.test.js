import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('demo pages use a gray theme while keeping title text color unchanged', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(css, /--paper:\s*#d1d5db;/);
  assert.match(css, /--ink:\s*#1f2937;/);
  assert.match(css, /--muted:\s*#4b5563;/);
  assert.match(css, /--line:\s*#6b7280;/);
  assert.match(css, /--panel:\s*#f3f4f6;/);
  assert.match(css, /--accent:\s*#6b7280;/);
  assert.match(css, /--accent-strong:\s*#374151;/);
  assert.match(css, /--signal:\s*#9ca3af;/);
  assert.match(css, /--shadow:\s*0 18px 40px rgba\(31,\s*41,\s*55,\s*0\.18\);/);
  assert.match(css, /rgba\(243,\s*244,\s*246,\s*0\.42\)/);
  assert.match(css, /\.hero h1,\s*[\s\S]*\.report-title h1,\s*[\s\S]*\.admin-header h1\s*\{[\s\S]*color:\s*var\(--ink\);/);
  assert.match(css, /\.mark\s*\{[\s\S]*background:\s*var\(--accent-strong\);/);
  assert.match(css, /\.bug-strip\s*\{[\s\S]*background:\s*#e5e7eb;/);

  assert.doesNotMatch(css, /--paper:\s*#b91c1c;/);
  assert.doesNotMatch(css, /--accent:\s*#dc2626;/);
  assert.doesNotMatch(css, /--accent-strong:\s*#991b1b;/);
  assert.doesNotMatch(css, /--paper:\s*#f7f4ec;/);
  assert.doesNotMatch(css, /--accent:\s*#2563eb;/);
  assert.doesNotMatch(css, /background:\s*#fffaf0;/);
});

test('admin review navigation label stays in place for the gray button-style link', async () => {
  const html = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');

  assert.match(html, /<a href="\/admin\.html">管理员审核<\/a>/);
});
