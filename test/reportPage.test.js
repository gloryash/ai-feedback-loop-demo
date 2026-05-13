import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('report page uses Chinese copy while preserving backend form values', async () => {
  const html = await readFile(new URL('../public/report.html', import.meta.url), 'utf8');

  for (const text of [
    '提交问题',
    '问题类型',
    '标题',
    '复现步骤',
    '预期结果',
    '实际结果',
    '运行环境',
    '联系方式',
    '截图或日志',
    '提交报告',
    '等待提交问题'
  ]) {
    assert.match(html, new RegExp(text));
  }

  for (const fieldName of [
    'type',
    'title',
    'steps',
    'expected',
    'actual',
    'environment',
    'contact',
    'attachments'
  ]) {
    assert.match(html, new RegExp(`name="${fieldName}"`));
  }

  assert.match(html, /<option value="bug">/);
  assert.match(html, /<option value="feature">/);
  assert.match(html, /<option value="design">/);
});
