import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Codex prompt allows bug fixes, feature requests, and design changes', async () => {
  const prompt = await readFile(new URL('../.github/codex/prompts/autofix.md', import.meta.url), 'utf8');

  assert.match(prompt, /bug fixes, feature requests, and design changes/i);
  assert.doesNotMatch(prompt, /Do not implement feature requests or design changes/i);
  assert.doesNotMatch(prompt, /Only fix small, reproducible bugs/i);
});

test('merge gate does not block feature and design labels by default', async () => {
  const workflow = await readFile(new URL('../.github/workflows/merge-gate.yml', import.meta.url), 'utf8');

  assert.doesNotMatch(workflow, /feature\|design/);
  assert.match(workflow, /needs:human/);
  assert.match(workflow, /security/);
});

test('repository instructions allow AI to implement feature and design requests', async () => {
  const instructions = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');

  assert.match(instructions, /bug fixes, feature requests, and design changes/i);
  assert.doesNotMatch(instructions, /must not implement feature requests, design changes/i);
});
