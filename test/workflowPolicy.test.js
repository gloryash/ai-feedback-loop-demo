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

test('auto-merge uses automation token so merged AI PRs can trigger deployment', async () => {
  const workflow = await readFile(new URL('../.github/workflows/auto-merge-bugfix.yml', import.meta.url), 'utf8');

  assert.match(workflow, /REPO_AUTOMATION_TOKEN/);
  assert.doesNotMatch(workflow, /GH_TOKEN: \\$\\{\\{ secrets\\.GITHUB_TOKEN \\}\\}/);
});

test('auto-merge also covers local worker pull requests', async () => {
  const workflow = await readFile(new URL('../.github/workflows/auto-merge-bugfix.yml', import.meta.url), 'utf8');

  assert.match(workflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'ai\/local\/'\)/);
  assert.match(workflow, /ai:autofix/);
  assert.match(workflow, /gh pr merge "\$PR_NUMBER" --squash --auto/);
});

test('Render deploy workflow writes deployment status back to the source issue', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-render.yml', import.meta.url), 'utf8');

  assert.match(workflow, /issueNumber/);
  assert.match(workflow, /HEAD_COMMIT_MESSAGE/);
  assert.match(workflow, /api\.render\.com\/v1\/services\/\$\{RENDER_SERVICE_ID\}\/deploys\/\$\{DEPLOY_ID\}/);
  assert.match(workflow, /local:deploying/);
  assert.match(workflow, /local:deployed/);
  assert.match(workflow, /local:deploy-failed/);
  assert.match(workflow, /GH_REPO: \$\{\{ github\.repository \}\}/);
  assert.match(workflow, /gh issue comment "\$ISSUE_NUMBER"/);
  assert.match(workflow, /gh issue edit "\$ISSUE_NUMBER"/);
});
