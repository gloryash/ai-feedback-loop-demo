import { routeAutomation } from './automationRouter.js';
import {
  addIssueLabels as defaultAddIssueLabels,
  buildIssueBody,
  createGitHubIssue as defaultCreateGitHubIssue
} from './githubIssue.js';

const TYPE_LABELS = new Set(['bug', 'feature', 'design', 'change']);

function valueOrDash(value) {
  return value && String(value).trim() ? String(value).trim() : '-';
}

function typeLabelFor(ticket) {
  const label = ticket.classification?.labels?.find((item) => TYPE_LABELS.has(item));
  if (label) {
    return label;
  }

  return TYPE_LABELS.has(ticket.type) ? ticket.type : 'change';
}

function approvalCandidateTicket(ticket, config) {
  if (ticket.classification?.route !== 'human-review') {
    return ticket;
  }

  const typeLabel = typeLabelFor(ticket);
  const labels = config.mode === 'local-pr'
    ? [typeLabel, config.localPr.candidateLabel]
    : [typeLabel, config.cloud.autofixLabel];

  return {
    ...ticket,
    classification: {
      ...(ticket.classification || {}),
      route: 'ai-change',
      labels,
      reason: 'Administrator approved this request for AI code changes.'
    }
  };
}

export function buildReviewedIssueBody(ticket, { labels, status, route, reason } = {}) {
  const issueReport = {
    ...ticket,
    classification: {
      ...(ticket.classification || {}),
      labels,
      ...(route ? { route } : {}),
      ...(reason ? { reason } : {})
    }
  };

  return [
    buildIssueBody(issueReport),
    '',
    '## Administrator review',
    `Status: ${valueOrDash(status)}`,
    `Comment: ${valueOrDash(ticket.review?.adminComment)}`
  ].join('\n');
}

export async function approveTicketForAi({
  ticket,
  config,
  env = process.env,
  createGitHubIssue = defaultCreateGitHubIssue,
  addIssueLabels = defaultAddIssueLabels
}) {
  const reviewStatus = ticket.review?.autoApproved ? 'auto-approved' : 'approved';
  const candidateTicket = approvalCandidateTicket(ticket, config);
  const automation = routeAutomation(candidateTicket, config);
  const labels = automation.labels;
  const issueBody = buildReviewedIssueBody(ticket, {
    labels,
    status: reviewStatus,
    route: candidateTicket.classification?.route,
    reason: candidateTicket.classification?.reason
  });
  const issueReport = {
    ...ticket,
    automation,
    issueBody,
    classification: {
      ...(candidateTicket.classification || {}),
      labels
    }
  };
  const github = await createGitHubIssue(issueReport, env, { labels });

  if (automation.mode === 'local-pr' && github.created) {
    await addIssueLabels(github.number, [config.localPr.approvalLabel], env);
  }

  return {
    automation,
    labels,
    github,
    issueBody
  };
}
