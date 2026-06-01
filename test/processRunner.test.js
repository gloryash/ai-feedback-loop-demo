import test from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../src/processRunner.js';

test('runCommand returns stdout, stderr, and exit code', async () => {
  const result = await runCommand(process.execPath, [
    '-e',
    'process.stdout.write("out"); process.stderr.write("err");'
  ]);

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'out');
  assert.equal(result.stderr, 'err');
});

test('runCommand writes stdin to the child process', async () => {
  const result = await runCommand(process.execPath, [
    '-e',
    'process.stdin.pipe(process.stdout);'
  ], {
    input: 'hello'
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'hello');
});

test('runCommand reports non-zero exits without throwing', async () => {
  const result = await runCommand(process.execPath, [
    '-e',
    'process.exit(7);'
  ]);

  assert.equal(result.code, 7);
});
