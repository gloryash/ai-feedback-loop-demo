import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage main title shows the TUI verification text', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(html, /<h1>\s*<span class="tui-title-word">TUI<\/span>\s*已验证\s*<\/h1>/);
});

test('homepage styles only the TUI title word green', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.tui-title-word\s*\{[\s\S]*color:\s*#16a34a;/);
});
