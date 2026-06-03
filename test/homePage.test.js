import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage main title shows the TUI verification text', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(html, /<h1>\s*TUI 已验证\s*<\/h1>/);
});
