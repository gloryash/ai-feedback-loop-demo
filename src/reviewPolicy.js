function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasStructuredBugFields(report) {
  return hasText(report.steps) && hasText(report.expected) && hasText(report.actual);
}

function pendingReviewDecision() {
  return {
    status: 'pending-review',
    autoApproved: false,
    requiresAdminReview: true,
    reason: 'Request needs administrator review before AI changes code.'
  };
}

export function reviewDecisionForReport(report) {
  if (!report || typeof report !== 'object') {
    return pendingReviewDecision();
  }

  if (report.classification?.labels !== undefined && !Array.isArray(report.classification.labels)) {
    return pendingReviewDecision();
  }

  const route = report.classification?.route;
  const labels = Array.isArray(report.classification?.labels) ? report.classification.labels : [];
  const isRisky = route === 'human-review' || labels.includes('needs:human') || labels.includes('risk:review');
  const isClearBug = report.type === 'bug' && route === 'bug-autofix';

  if (!isRisky && isClearBug && (hasStructuredBugFields(report) || hasText(report.details))) {
    return {
      status: 'auto-approved',
      autoApproved: true,
      requiresAdminReview: false,
      reason: 'Clear low-risk bug can be sent to AI automatically.'
    };
  }

  return pendingReviewDecision();
}
