const TYPE_LABELS = new Set(['bug', 'feature', 'design', 'change']);

function typeLabelFor(report) {
  const label = report.classification?.labels?.find((item) => TYPE_LABELS.has(item));
  if (label) {
    return label;
  }

  return TYPE_LABELS.has(report.type) ? report.type : 'change';
}

export function routeAutomation(report, config) {
  if (report.classification?.route === 'human-review') {
    return {
      mode: 'human-review',
      labels: report.classification.labels,
      requiresApproval: true,
      reason: report.classification.reason
    };
  }

  if (config.mode === 'local-pr') {
    return {
      mode: 'local-pr',
      labels: [typeLabelFor(report), config.localPr.candidateLabel],
      requiresApproval: true,
      reason: 'Report will wait for local worker approval before Codex runs.'
    };
  }

  return {
    mode: 'cloud',
    labels: report.classification.labels,
    requiresApproval: false,
    reason: report.classification.reason
  };
}
