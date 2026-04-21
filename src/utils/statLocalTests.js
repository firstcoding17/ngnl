function mean(values = []) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function median(values = []) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function fTailApprox(fValue) {
  if (!Number.isFinite(fValue) || fValue < 0) return 1;
  return Math.max(0, Math.min(1, 1 / (1 + fValue)));
}

export async function runLocalLevene(rows = [], column = '', group = '') {
  const grouped = new Map();
  rows.forEach((row) => {
    const groupValue = String(row?.[group] ?? '').trim();
    const numericValue = Number(row?.[column]);
    if (!groupValue || !Number.isFinite(numericValue)) return;
    const bucket = grouped.get(groupValue) || [];
    bucket.push(numericValue);
    grouped.set(groupValue, bucket);
  });

  const validGroups = Array.from(grouped.entries()).filter(([, values]) => values.length >= 2);
  if (validGroups.length < 2) {
    throw new Error('Levene requires at least two groups with two or more numeric values.');
  }

  const deviations = validGroups.map(([label, values]) => {
    const pivot = median(values);
    const absDeviations = values.map((value) => Math.abs(value - pivot));
    return {
      label,
      n: values.length,
      meanAbsDev: mean(absDeviations),
      medianAbsDev: median(absDeviations),
      values: absDeviations,
    };
  });

  const flattened = deviations.flatMap((item) => item.values);
  const grandMean = mean(flattened);
  const ssBetween = deviations.reduce((sum, item) => sum + item.values.length * ((mean(item.values) - grandMean) ** 2), 0);
  const ssWithin = deviations.reduce(
    (sum, item) => sum + item.values.reduce((local, value) => local + ((value - mean(item.values)) ** 2), 0),
    0
  );
  const df1 = deviations.length - 1;
  const df2 = flattened.length - deviations.length;
  const fStat = df1 > 0 && df2 > 0 && ssWithin > 0 ? (ssBetween / df1) / (ssWithin / df2) : 0;
  const pValue = fTailApprox(fStat);

  return {
    ok: true,
    op: 'levene',
    summary: {
      title: 'Levene (Brown-Forsythe)',
      conclusion: `Checked variance homogeneity across ${deviations.length} groups.`,
      stats: {
        f_stat: Number(fStat.toFixed(6)),
        p_value: Number(pValue.toFixed(6)),
        df1,
        df2,
      },
    },
    warnings: [
      'Used a local approximate Brown-Forsythe fallback for Levene. Install SciPy on the backend for the exact server-side test.',
    ],
    tables: [
      {
        name: 'group_summary',
        columns: ['group', 'n', 'mean_abs_dev', 'median_abs_dev'],
        rows: deviations.map((item) => [
          item.label,
          item.n,
          Number(item.meanAbsDev.toFixed(6)),
          Number(item.medianAbsDev.toFixed(6)),
        ]),
      },
    ],
    figures: [],
  };
}
