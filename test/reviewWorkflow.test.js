import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveTicketForAi,
  buildReviewedIssueBody
} from '../src/reviewWorkflow.js';

const baseTicket = {
  id: 'T-100',
  title: 'SAVE10 coupon does not work',
  type: 'bug',
  details: 'Coupon stays at full price.',
  steps: 'Choose Pro and enter SAVE10.',
  expected: 'Total becomes 90.',
  actual: 'Total stays 100.',
  environment: 'Chrome 124 on macOS',
  contact: 'user@example.com',
  classification: {
    route: 'bug-autofix',
    labels: ['bug', 'autofix:candidate'],
    reason: 'Reproducible bug with expected and actual results.'
  },
  review: {
    adminComment: 'Approved after checking the repro.'
  }
};

test('buildReviewedIssueBody includes admin review and original problem details', () => {
  const body = buildReviewedIssueBody(baseTicket, {
    labels: ['bug', 'local:candidate'],
    status: 'approved'
  });

  assert.match(body, /## Problem details/);
  assert.match(body, /Coupon stays at full price\./);
  assert.match(body, /## Administrator review/);
  assert.match(body, /Status: approved/);
  assert.match(body, /Approved after checking the repro\./);
  assert.match(body, /Labels: bug, local:candidate/);
});

test('approveTicketForAi creates a cloud issue with admin comment and expected labels', async () => {
  const calls = [];
  const githubResult = {
    created: true,
    number: 12,
    url: 'https://github.com/acme/demo/issues/12'
  };

  const result = await approveTicketForAi({
    ticket: baseTicket,
    config: {
      mode: 'cloud',
      cloud: { autofixLabel: 'autofix:candidate' }
    },
    env: { GITHUB_OWNER: 'acme' },
    createGitHubIssue: async (report, env, options) => {
      calls.push(['createGitHubIssue', report, env, options]);
      return githubResult;
    },
    addIssueLabels: async (...args) => {
      calls.push(['addIssueLabels', ...args]);
    }
  });

  assert.equal(result.automation.mode, 'cloud');
  assert.deepEqual(result.labels, ['bug', 'autofix:candidate']);
  assert.equal(result.github, githubResult);
  assert.match(result.issueBody, /## Administrator review/);
  assert.match(result.issueBody, /Approved after checking the repro\./);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'createGitHubIssue');
  assert.deepEqual(calls[0][3], { labels: ['bug', 'autofix:candidate'] });
  assert.equal(calls[0][1].issueBody, result.issueBody);
  assert.deepEqual(calls[0][1].classification.labels, ['bug', 'autofix:candidate']);
});

test('approveTicketForAi adds local approval label in local-pr mode and uses candidate labels', async () => {
  const calls = [];

  const result = await approveTicketForAi({
    ticket: baseTicket,
    config: {
      mode: 'local-pr',
      localPr: {
        candidateLabel: 'local:candidate',
        approvalLabel: 'local:approved'
      }
    },
    env: { GITHUB_OWNER: 'acme' },
    createGitHubIssue: async (report, env, options) => {
      calls.push(['createGitHubIssue', report, env, options]);
      return {
        created: true,
        number: 45,
        url: 'https://github.com/acme/demo/issues/45'
      };
    },
    addIssueLabels: async (issueNumber, labels, env) => {
      calls.push(['addIssueLabels', issueNumber, labels, env]);
      return [{ name: labels[0] }];
    }
  });

  assert.equal(result.automation.mode, 'local-pr');
  assert.deepEqual(result.labels, ['bug', 'local:candidate']);
  assert.deepEqual(calls[0][3], { labels: ['bug', 'local:candidate'] });
  assert.deepEqual(calls[1], [
    'addIssueLabels',
    45,
    ['local:approved'],
    { GITHUB_OWNER: 'acme' }
  ]);
});

test('blank admin comment becomes dash in administrator review', () => {
  const body = buildReviewedIssueBody({
    ...baseTicket,
    review: { adminComment: '   ' }
  }, {
    labels: ['bug', 'autofix:candidate'],
    status: 'approved'
  });

  assert.match(body, /## Administrator review\nStatus: approved\nComment: -/);
});

test('local-pr does not add approval label when GitHub issue creation returns created false', async () => {
  const calls = [];

  const result = await approveTicketForAi({
    ticket: baseTicket,
    config: {
      mode: 'local-pr',
      localPr: {
        candidateLabel: 'local:candidate',
        approvalLabel: 'local:approved'
      }
    },
    env: { GITHUB_OWNER: 'acme' },
    createGitHubIssue: async (report, env, options) => {
      calls.push(['createGitHubIssue', report, env, options]);
      return {
        created: false,
        reason: 'GitHub is not configured.'
      };
    },
    addIssueLabels: async (...args) => {
      calls.push(['addIssueLabels', ...args]);
    }
  });

  assert.equal(result.github.created, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'createGitHubIssue');
});

test('admin approval writes approved status for pending review tickets', async () => {
  const result = await approveTicketForAi({
    ticket: {
      ...baseTicket,
      review: {
        status: 'pending-review',
        adminComment: 'Approved from admin panel.'
      }
    },
    config: {
      mode: 'cloud',
      cloud: { autofixLabel: 'autofix:candidate' }
    },
    createGitHubIssue: async () => ({
      created: true,
      number: 46,
      url: 'https://github.com/acme/demo/issues/46'
    })
  });

  assert.match(result.issueBody, /Status: approved/);
  assert.doesNotMatch(result.issueBody, /Status: pending-review/);
});

test('admin approval sends human-review tickets to cloud AI labels', async () => {
  let issueOptions;
  const result = await approveTicketForAi({
    ticket: {
      ...baseTicket,
      type: 'change',
      classification: {
        route: 'human-review',
        labels: ['change', 'needs:human', 'risk:review'],
        reason: 'Risky report.'
      },
      review: {
        status: 'pending-review',
        adminComment: 'Approved with admin scope.'
      }
    },
    config: {
      mode: 'cloud',
      cloud: { autofixLabel: 'autofix:candidate' }
    },
    createGitHubIssue: async (report, env, options) => {
      issueOptions = options;
      return {
        created: true,
        number: 47,
        url: 'https://github.com/acme/demo/issues/47'
      };
    }
  });

  assert.equal(result.automation.mode, 'cloud');
  assert.deepEqual(result.labels, ['change', 'autofix:candidate']);
  assert.deepEqual(issueOptions.labels, ['change', 'autofix:candidate']);
  assert.doesNotMatch(result.issueBody, /needs:human/);
  assert.doesNotMatch(result.issueBody, /risk:review/);
});

test('admin approval sends human-review tickets to local-pr labels and adds approval', async () => {
  const calls = [];
  const result = await approveTicketForAi({
    ticket: {
      ...baseTicket,
      type: 'change',
      classification: {
        route: 'human-review',
        labels: ['change', 'needs:human', 'risk:review'],
        reason: 'Risky report.'
      },
      review: {
        status: 'pending-review',
        adminComment: 'Approved for local worker.'
      }
    },
    config: {
      mode: 'local-pr',
      localPr: {
        candidateLabel: 'local:candidate',
        approvalLabel: 'local:approved'
      }
    },
    createGitHubIssue: async (report, env, options) => {
      calls.push(['createGitHubIssue', options.labels]);
      return {
        created: true,
        number: 48,
        url: 'https://github.com/acme/demo/issues/48'
      };
    },
    addIssueLabels: async (issueNumber, labels) => {
      calls.push(['addIssueLabels', issueNumber, labels]);
    }
  });

  assert.equal(result.automation.mode, 'local-pr');
  assert.deepEqual(result.labels, ['change', 'local:candidate']);
  assert.deepEqual(calls, [
    ['createGitHubIssue', ['change', 'local:candidate']],
    ['addIssueLabels', 48, ['local:approved']]
  ]);
});
