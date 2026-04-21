function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

export function collectArtifactWarnings(artifact = null) {
  return uniqueStrings([
    ...(Array.isArray(artifact?.warnings) ? artifact.warnings : []),
    ...(Array.isArray(artifact?.result?.warnings) ? artifact.result.warnings : []),
  ]);
}

export function collectArtifactRequirements(artifact = null) {
  return uniqueStrings([
    ...(Array.isArray(artifact?.requirements) ? artifact.requirements : []),
    ...(Array.isArray(artifact?.result?.requirements) ? artifact.result.requirements : []),
  ]);
}

export function inferArtifactRuntimeState(artifact = null) {
  const explicit = String(
    artifact?.availability
    || artifact?.status
    || ''
  ).trim().toLowerCase();

  if (explicit === 'blocked') return 'blocked';
  if (explicit === 'fallback') return 'fallback';
  if (explicit === 'warning') return 'warning';
  if (['direct', 'runnable', 'ready', 'success'].includes(explicit)) return 'direct';

  const warnings = collectArtifactWarnings(artifact);
  if (warnings.some((warning) => /\b(fallback|approx(?:imation)?|local)\b/i.test(warning))) {
    return 'fallback';
  }
  if (warnings.length) return 'warning';
  return 'direct';
}

export function resolveArtifactRuntimeReason(artifact = null) {
  return String(
    artifact?.availabilityReason
    || artifact?.reason
    || artifact?.error
    || artifact?.result?.reason
    || ''
  ).trim();
}

export function buildRuntimeStatusDisplay(artifact = null, options = {}) {
  const badges = Array.isArray(options?.badges)
    ? options.badges
        .map((item) => ({
          label: String(item?.label || '').trim(),
          value: String(item?.value || '').trim(),
        }))
        .filter((item) => item.label && item.value)
    : [];

  const state = inferArtifactRuntimeState(artifact);
  const warnings = collectArtifactWarnings(artifact);
  const requirements = collectArtifactRequirements(artifact);
  let reason = String(options?.reason || resolveArtifactRuntimeReason(artifact) || '').trim();
  let extraWarnings = warnings.slice();

  if (!reason && (state === 'fallback' || state === 'warning') && warnings.length) {
    [reason] = warnings;
    extraWarnings = warnings.slice(1);
  }

  return {
    state,
    label: state,
    reason,
    requirements,
    warnings: extraWarnings,
    badges,
    show: !!artifact,
  };
}
