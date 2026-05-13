import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultCopy } from '../public/report.js';

test('explains human-review submissions in plain Chinese', () => {
  const copy = buildResultCopy({
    ticket: {
      id: 'T-20260513145714-LT8UY',
      saved: true
    },
    classification: {
      route: 'human-review',
      labels: ['needs:triage', 'needs:human'],
      reason: 'The report is missing enough reproduction detail for safe automation.'
    },
    github: {
      created: true,
      number: 7,
      url: 'https://github.com/gloryash/ai-feedback-loop-demo/issues/7'
    }
  });

  const text = [copy.title, ...copy.lines, copy.issueText].join('\n');

  assert.match(text, /我们已经收到你的反馈/);
  assert.match(text, /需要人工确认/);
  assert.match(text, /不用重复提交/);
  assert.match(text, /反馈编号：T-20260513145714-LT8UY/);
  assert.equal(copy.issueUrl, 'https://github.com/gloryash/ai-feedback-loop-demo/issues/7');
  assert.doesNotMatch(text, /human-review|needs:triage|classification|route/);
});

test('explains AI change submissions in plain Chinese', () => {
  const copy = buildResultCopy({
    ticket: {
      id: 'T-20260513150000-AUTOF',
      saved: true
    },
    classification: {
      route: 'ai-change',
      labels: ['design', 'autofix:candidate'],
      reason: 'Request includes enough detail for an AI change attempt.'
    },
    github: {
      created: true,
      number: 8,
      url: 'https://github.com/gloryash/ai-feedback-loop-demo/issues/8'
    }
  });

  const text = [copy.title, ...copy.lines, copy.issueText].join('\n');

  assert.match(text, /我们已经收到你的反馈/);
  assert.match(text, /会尝试让 AI 自动处理/);
  assert.match(text, /修复完成后会出现在演示应用里/);
  assert.doesNotMatch(text, /ai-change|autofix:candidate|classification|route/);
});
