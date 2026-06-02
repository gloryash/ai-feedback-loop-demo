import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { runCommand } from './processRunner.js';

const DEFAULT_STATUS_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_STATUS_POLL_MS = 1000;
const TERMINAL_ENV_KEYS = new Set([
  'CODEX_HOME',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LOGNAME',
  'PATH',
  'SHELL',
  'TMPDIR',
  'USER'
]);

const DEFAULT_DEPS = {
  chmod,
  mkdir,
  readFile,
  writeFile,
  runCommand,
  sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  now: () => Date.now()
};

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function appleScriptString(value) {
  return JSON.stringify(String(value));
}

function runRootFor(local, worktreePath) {
  const runRoot = local.terminalRunRoot || '.aipr/runs';
  if (isAbsolute(runRoot)) {
    return runRoot;
  }

  const repoPath = local.repoPath || resolve(worktreePath, '..', '..', '..');
  return resolve(repoPath, runRoot);
}

function terminalEnvExportLines(env = {}) {
  return Object.entries(env)
    .filter(([key, value]) => TERMINAL_ENV_KEYS.has(key) && value !== undefined)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
}

function buildRunScript({
  local,
  worktreePath,
  promptPath,
  stdoutPath,
  stderrPath,
  statusPath,
  issueRunDir,
  env
}) {
  const command = [local.codexCommand, ...(local.codexArgs || [])]
    .map(shellQuote)
    .join(' ');
  const envLines = terminalEnvExportLines(env).join('\n');
  const closeBehavior = local.terminalCloseOnExit
    ? 'exit "$code"'
    : [
        'printf "\\nTerminal Codex run finished with exit code %s\\n" "$code"',
        `printf "Run artifacts: %s\\n" ${shellQuote(issueRunDir)}`,
        'exec "${SHELL:-/bin/zsh}" -l'
      ].join('\n');

  return [
    '#!/bin/sh',
    'set -u',
    envLines,
    `WORKTREE_PATH=${shellQuote(worktreePath)}`,
    `PROMPT_PATH=${shellQuote(promptPath)}`,
    `STDOUT_PATH=${shellQuote(stdoutPath)}`,
    `STDERR_PATH=${shellQuote(stderrPath)}`,
    `STATUS_PATH=${shellQuote(statusPath)}`,
    '',
    'cd "$WORKTREE_PATH"',
    'set +e',
    `${command} < "$PROMPT_PATH" > "$STDOUT_PATH" 2> "$STDERR_PATH"`,
    'code=$?',
    'node - "$STATUS_PATH" "$code" "$STDOUT_PATH" "$STDERR_PATH" <<\'NODE_STATUS\'',
    'const fs = require("fs");',
    'const [statusPath, code, stdoutPath, stderrPath] = process.argv.slice(2);',
    'fs.writeFileSync(statusPath, JSON.stringify({',
    '  code: Number(code),',
    '  stdoutPath,',
    '  stderrPath',
    '}));',
    'NODE_STATUS',
    closeBehavior,
    ''
  ].filter((line) => line !== '').join('\n');
}

function buildAppleScript({ terminalApp, scriptPath }) {
  const command = shellQuote(scriptPath);
  const commandLiteral = appleScriptString(command);

  if (terminalApp === 'iterm2') {
    return [
      'tell application "iTerm2"',
      'activate',
      'set terminalWindow to (create window with default profile)',
      'tell current session of terminalWindow',
      `write text ${commandLiteral}`,
      'end tell',
      'end tell'
    ].join('\n');
  }

  return [
    'tell application "Terminal"',
    'activate',
    `do script ${commandLiteral}`,
    'end tell'
  ].join('\n');
}

async function readStatusResult({ deps, statusPath, issueRunDir }) {
  let status;
  try {
    status = JSON.parse(await deps.readFile(statusPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const stdout = await deps.readFile(status.stdoutPath, 'utf8');
  const stderr = await deps.readFile(status.stderrPath, 'utf8');
  return {
    code: status.code,
    stdout,
    stderr,
    runDir: issueRunDir
  };
}

export async function runCodexInTerminal({
  local,
  worktreePath,
  issueNumber,
  prompt,
  env,
  deps = DEFAULT_DEPS
}) {
  const runRoot = runRootFor(local, worktreePath);
  const issueRunDir = join(runRoot, `issue-${issueNumber}`);
  const promptPath = join(issueRunDir, 'prompt.txt');
  const scriptPath = join(issueRunDir, 'run.sh');
  const stdoutPath = join(issueRunDir, 'stdout.log');
  const stderrPath = join(issueRunDir, 'stderr.log');
  const statusPath = join(issueRunDir, 'status.json');

  await deps.mkdir(issueRunDir, { recursive: true });
  await deps.writeFile(promptPath, prompt);
  await deps.writeFile(stdoutPath, '');
  await deps.writeFile(stderrPath, '');
  await deps.writeFile(scriptPath, buildRunScript({
    local,
    worktreePath,
    promptPath,
    stdoutPath,
    stderrPath,
    statusPath,
    issueRunDir,
    env
  }));
  await deps.chmod(scriptPath, 0o700);

  const appleScript = buildAppleScript({
    terminalApp: local.terminalApp || 'iterm2',
    scriptPath
  });
  const launchResult = await deps.runCommand('osascript', ['-e', appleScript], {
    env: Object.fromEntries(
      Object.entries(env || {}).filter(([key]) => TERMINAL_ENV_KEYS.has(key))
    )
  });

  if (launchResult.code !== 0) {
    return {
      code: launchResult.code || 1,
      stdout: launchResult.stdout || '',
      stderr: launchResult.stderr || 'Terminal launch failed.',
      runDir: issueRunDir
    };
  }

  const timeoutMs = local.terminalStatusTimeoutMs || DEFAULT_STATUS_TIMEOUT_MS;
  const pollMs = local.terminalStatusPollMs || DEFAULT_STATUS_POLL_MS;
  const deadline = deps.now() + timeoutMs;

  while (deps.now() <= deadline) {
    const result = await readStatusResult({ deps, statusPath, issueRunDir });
    if (result) {
      return result;
    }
    await deps.sleep(pollMs);
  }

  return {
    code: 1,
    stdout: '',
    stderr: `Timed out waiting for terminal Codex run. Run artifacts: ${issueRunDir}`,
    runDir: issueRunDir
  };
}
