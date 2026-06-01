import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SUPPORTED_MODES = new Set(['cloud', 'local-pr']);

const DEFAULT_CONFIG = {
  mode: 'cloud',
  cloud: {
    enabled: true,
    autofixLabel: 'autofix:candidate'
  },
  localPr: {
    enabled: false,
    repoPath: '.',
    baseBranch: 'main',
    worktreeRoot: '.aipr/worktrees',
    branchPrefix: 'ai/local',
    pollIntervalSeconds: 20,
    maxConcurrency: 1,
    codexCommand: 'codex',
    codexArgs: ['exec', '--sandbox', 'workspace-write', '--ephemeral', '-'],
    testCommand: 'npm test',
    approvalLabel: 'local:approved',
    candidateLabel: 'local:candidate',
    runningLabel: 'local:running',
    doneLabel: 'local:pr-created',
    failedLabel: 'local:failed'
  }
};

function mergeConfig(fileConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    cloud: {
      ...DEFAULT_CONFIG.cloud,
      ...(fileConfig.cloud || {})
    },
    localPr: {
      ...DEFAULT_CONFIG.localPr,
      ...(fileConfig.localPr || {})
    }
  };
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function applyEnv(config, env) {
  const next = { ...config, localPr: { ...config.localPr } };

  if (env.AUTOMATION_MODE) {
    next.mode = env.AUTOMATION_MODE;
  }

  if (env.LOCAL_PR_ENABLED) {
    next.localPr.enabled = env.LOCAL_PR_ENABLED === 'true';
  }

  return next;
}

function validateConfig(config) {
  if (!SUPPORTED_MODES.has(config.mode)) {
    throw new Error(`Unsupported automation mode: ${config.mode}`);
  }
}

export async function loadAutomationConfig({ env = process.env, cwd = process.cwd() } = {}) {
  const path = env.AUTOMATION_CONFIG || join(cwd, 'automation.config.json');
  const fileConfig = await readJsonIfPresent(path);
  const config = applyEnv(mergeConfig(fileConfig), env);

  validateConfig(config);

  return config;
}
