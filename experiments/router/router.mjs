export function chooseRoute(signal = {}) {
  const reasons = [];

  const fullSignals = [
    ['materialAmbiguity', 'material ambiguity'],
    ['destructiveMigration', 'destructive/irreversible migration'],
    ['securityBoundary', 'security/trust boundary'],
    ['sharedContract', 'shared/public contract'],
    ['architectureDecision', 'costly architecture decision'],
    ['crossDomainCoordination', 'cross-domain coordination'],
  ];

  for (const [key, reason] of fullSignals) if (signal[key]) reasons.push(reason);
  if (reasons.length >= 2 || signal.destructiveMigration || signal.securityBoundary) {
    return { route: 'full', reasons };
  }

  const compactSignals = [
    ['needsContinuity', 'cross-session continuity'],
    ['scopeNotLocal', 'non-local scope'],
    ['durableDecision', 'durable decision'],
    ['multipleSlices', 'multiple execution slices'],
    ['moderateRisk', 'moderate risk'],
  ];
  for (const [key, reason] of compactSignals) if (signal[key]) reasons.push(reason);
  if (reasons.length > 0) return { route: 'compact', reasons };

  if (signal.clear === false) return { route: 'compact', reasons: ['request not clear enough for direct'] };
  return { route: 'direct', reasons: ['clear/local/reversible by available evidence'] };
}

export function shouldEscalate(currentRoute, discovery = {}) {
  const next = chooseRoute({ ...discovery, clear: true });
  const rank = { direct: 0, compact: 1, full: 2 };
  return rank[next.route] > rank[currentRoute] ? next : null;
}
