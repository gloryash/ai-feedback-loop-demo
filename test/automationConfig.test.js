import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAutomationConfig } from '../src/automationConfig.js';

test('loadAutomationConfig defaults to cloud mode', async () => {
  const config = await loadAutomationConfig({ env: {}, cwd: '/tmp/no-config' });

  assert.equal(config.mode, 'cloud');
  assert.equal(config.cloud.enabled, true);
  assert.equal(config.cloud.autofixLabel, 'autofix:candidate');
  assert.equal(config.localPr.enabled, false);
  assert.equal(config.localPr.approvalLabel, 'local:approved');
});

test('loadAutomationConfig defaults localPr Codex run mode to internal', async () => {
  const config = await loadAutomationConfig({ env: {}, cwd: '/tmp/no-config' });

  assert.equal(config.localPr.codexRunMode, 'internal');
  assert.equal(config.localPr.terminalApp, 'iterm2');
  assert.equal(config.localPr.terminalCloseOnExit, false);
  assert.equal(config.localPr.terminalRunRoot, '.aipr/runs');
});

test('loadAutomationConfig loads local-pr config from AUTOMATION_CONFIG', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'automation-config-'));
  const path = join(dir, 'automation.config.json');
  await writeFile(path, JSON.stringify({
    mode: 'local-pr',
    localPr: {
      enabled: true,
      repoPath: '/repo'
    }
  }));

  const config = await loadAutomationConfig({
    env: { AUTOMATION_CONFIG: path },
    cwd: dir
  });

  assert.equal(config.mode, 'local-pr');
  assert.equal(config.localPr.enabled, true);
  assert.equal(config.localPr.repoPath, '/repo');
  assert.equal(config.localPr.approvalLabel, 'local:approved');
  assert.deepEqual(config.localPr.codexArgs, ['exec', '--sandbox', 'workspace-write', '--ephemeral', '-']);
});

test('loadAutomationConfig lets AUTOMATION_MODE override file mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'automation-config-'));
  const path = join(dir, 'automation.config.json');
  await writeFile(path, JSON.stringify({ mode: 'cloud' }));

  const config = await loadAutomationConfig({
    env: { AUTOMATION_CONFIG: path, AUTOMATION_MODE: 'local-pr' },
    cwd: dir
  });

  assert.equal(config.mode, 'local-pr');
});

test('loadAutomationConfig enables localPr from LOCAL_PR_ENABLED', async () => {
  const config = await loadAutomationConfig({
    env: { AUTOMATION_MODE: 'local-pr', LOCAL_PR_ENABLED: 'true' },
    cwd: '/tmp/no-config'
  });

  assert.equal(config.mode, 'local-pr');
  assert.equal(config.localPr.enabled, true);
});

test('loadAutomationConfig rejects unsupported modes', async () => {
  await assert.rejects(
    () => loadAutomationConfig({ env: { AUTOMATION_MODE: 'bad' }, cwd: '/tmp' }),
    /Unsupported automation mode/
  );
});

test('loadAutomationConfig rejects unsupported localPr codexRunMode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'automation-config-'));
  const path = join(dir, 'automation.config.json');
  await writeFile(path, JSON.stringify({
    localPr: {
      codexRunMode: 'browser'
    }
  }));

  await assert.rejects(
    () => loadAutomationConfig({ env: { AUTOMATION_CONFIG: path }, cwd: dir }),
    /Unsupported localPr codexRunMode: browser/
  );
});

test('loadAutomationConfig rejects unsupported localPr terminalApp', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'automation-config-'));
  const path = join(dir, 'automation.config.json');
  await writeFile(path, JSON.stringify({
    localPr: {
      codexRunMode: 'terminal',
      terminalApp: 'warp'
    }
  }));

  await assert.rejects(
    () => loadAutomationConfig({ env: { AUTOMATION_CONFIG: path }, cwd: dir }),
    /Unsupported localPr terminalApp: warp/
  );
});
