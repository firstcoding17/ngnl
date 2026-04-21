function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugify(value) {
  const text = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || 'report';
}

function timestampForFilename(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().replace(/[:.]/g, '-');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function formatValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '-';
  if (value && typeof value === 'object') return JSON.stringify(value);
  const text = normalizeText(value);
  return text || '-';
}

function buildSectionLines(title, entries = {}) {
  const lines = [`## ${title}`];
  Object.entries(entries || {}).forEach(([label, value]) => {
    lines.push(`- ${label}: ${formatValue(value)}`);
  });
  return lines;
}

function buildSectionMarkdown(title, entries = {}) {
  const lines = [`## ${title}`];
  Object.entries(entries || {}).forEach(([label, value]) => {
    lines.push(`- **${label}:** ${formatValue(value)}`);
  });
  return lines;
}

export function buildReportFilename(report, extension = 'txt') {
  const titleSlug = slugify(report?.title || '').replace(/-report$/, '') || 'report';
  const typeSlug = slugify(report?.type || '');
  const stamp = timestampForFilename(report?.generatedAt);
  return `ngnl-${typeSlug}-${titleSlug}-${stamp}.${extension.replace(/^\./, '')}`;
}

export function serializeReportAsPlainText(report) {
  if (!report) return '';
  const sections = report.sections || {};
  const lines = [
    '# Analysis Report',
    '',
    `Title: ${formatValue(report.title)}`,
    `Type: ${formatValue(report.type)}`,
    `Status: ${formatValue(report.status)}`,
    `Generated at: ${formatValue(report.generatedAt)}`,
    '',
    ...buildSectionLines('Overview', sections.overview || {}),
    '',
    ...buildSectionLines('Inputs', sections.inputs || {}),
    '',
    ...buildSectionLines('Key Results', sections.results || {}),
    '',
    ...buildSectionLines('Interpretation', sections.interpretation || {}),
    '',
    '## Recommended Next Steps',
  ];

  const nextSteps = Array.isArray(sections.nextSteps) ? sections.nextSteps : [];
  if (nextSteps.length) {
    nextSteps.forEach((step) => lines.push(`- ${formatValue(step)}`));
  } else {
    lines.push('- -');
  }

  lines.push('', ...buildSectionLines('Runtime / Environment', sections.runtime || {}));
  return `${lines.join('\n').trim()}\n`;
}

export function serializeReportAsMarkdown(report) {
  if (!report) return '';
  const sections = report.sections || {};
  const lines = [
    '# Analysis Report',
    '',
    `## Meta`,
    `- **Title:** ${formatValue(report.title)}`,
    `- **Type:** ${formatValue(report.type)}`,
    `- **Status:** ${formatValue(report.status)}`,
    `- **Generated at:** ${formatValue(report.generatedAt)}`,
    '',
    ...buildSectionMarkdown('Overview', sections.overview || {}),
    '',
    ...buildSectionMarkdown('Inputs', sections.inputs || {}),
    '',
    ...buildSectionMarkdown('Key Results', sections.results || {}),
    '',
    ...buildSectionMarkdown('Interpretation', sections.interpretation || {}),
    '',
    '## Recommended Next Steps',
  ];

  const nextSteps = Array.isArray(sections.nextSteps) ? sections.nextSteps : [];
  if (nextSteps.length) {
    nextSteps.forEach((step) => lines.push(`- ${formatValue(step)}`));
  } else {
    lines.push('- -');
  }

  lines.push('', ...buildSectionMarkdown('Runtime / Environment', sections.runtime || {}));
  return `${lines.join('\n').trim()}\n`;
}

export async function copyTextToClipboard(text) {
  const payload = String(text || '');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload);
    return true;
  }
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = payload;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!ok) throw new Error('Clipboard copy failed.');
    return true;
  }
  throw new Error('Clipboard API is unavailable.');
}

export function downloadTextFile(filename, text, mimeType = 'text/plain;charset=utf-8') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('File download is unavailable in this environment.');
  }
  const blob = new Blob([String(text || '')], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
