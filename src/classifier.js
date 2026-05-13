const RISKY_KEYWORDS = [
  'auth',
  'authentication',
  'authorization',
  'billing',
  'payment',
  'privacy',
  'pii',
  'security',
  'secret',
  'token',
  'database migration',
  'migration',
  'permission'
];

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsefulDetails(value) {
  return typeof value === 'string' && value.trim().length >= 20;
}

function reportType(value) {
  const type = String(value || '').toLowerCase();
  return ['bug', 'feature', 'design'].includes(type) ? type : 'change';
}

export function classifyReport(report) {
  const type = reportType(report.type);
  const text = [
    report.title,
    report.details,
    report.steps,
    report.expected,
    report.actual,
    report.environment
  ].join('\n').toLowerCase();

  if (RISKY_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return {
      route: 'human-review',
      labels: [type, 'needs:human', 'risk:review'],
      reason: 'The report touches security, auth, billing, privacy, permissions, or migrations.'
    };
  }

  if (
    type === 'bug' &&
    hasText(report.steps) &&
    hasText(report.expected) &&
    hasText(report.actual)
  ) {
    return {
      route: 'bug-autofix',
      labels: ['bug', 'autofix:candidate'],
      reason: 'Reproducible bug with expected and actual results.'
    };
  }

  if (type === 'bug' && hasUsefulDetails(report.details)) {
    return {
      route: 'bug-autofix',
      labels: ['bug', 'autofix:candidate'],
      reason: 'Bug report includes enough combined detail for an autofix attempt.'
    };
  }

  if (hasUsefulDetails(report.details)) {
    return {
      route: 'ai-change',
      labels: [type, 'autofix:candidate'],
      reason: 'Request includes enough detail for an AI change attempt.'
    };
  }

  return {
    route: 'human-review',
    labels: ['needs:triage', 'needs:human'],
    reason: 'The report is missing enough reproduction detail for safe automation.'
  };
}
