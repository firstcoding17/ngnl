function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function level4(absV, s, m, l) {
  if (absV < s) return 'negligible';
  if (absV < m) return 'small';
  if (absV < l) return 'medium';
  return 'large';
}

function pushBadge(list, key, label, val, level) {
  if (val == null) return;
  list.push({
    key,
    label,
    value: Number(val).toFixed(3),
    level,
  });
}

export function effectBadgesFromStats(stats) {
  const s = stats || {};
  const out = [];

  const d = toNum(s.cohen_d);
  if (d != null) pushBadge(out, 'cohen_d', "Cohen's d", d, level4(Math.abs(d), 0.2, 0.5, 0.8));

  const eta = toNum(s.eta_sq);
  if (eta != null) pushBadge(out, 'eta_sq', 'Eta-squared', eta, level4(Math.abs(eta), 0.01, 0.06, 0.14));

  const cv = toNum(s.cramers_v);
  if (cv != null) pushBadge(out, 'cramers_v', "Cramer's V", cv, level4(Math.abs(cv), 0.1, 0.3, 0.5));

  const eps = toNum(s.epsilon_sq);
  if (eps != null) pushBadge(out, 'epsilon_sq', 'Epsilon-squared', eps, level4(Math.abs(eps), 0.01, 0.08, 0.26));

  const cles = toNum(s.cles);
  if (cles != null) {
    const score = Math.abs((cles - 0.5) * 2);
    pushBadge(out, 'cles', 'CLES', cles, level4(score, 0.1, 0.3, 0.5));
  }

  const r = toNum(s.r_approx);
  if (r != null) pushBadge(out, 'r_approx', 'r (approx)', r, level4(Math.abs(r), 0.1, 0.3, 0.5));

  return out;
}

export function effectBadgeClass(level) {
  if (level === 'large') return 'badge-large';
  if (level === 'medium') return 'badge-medium';
  if (level === 'small') return 'badge-small';
  return 'badge-negligible';
}
