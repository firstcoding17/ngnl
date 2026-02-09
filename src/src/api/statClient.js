import http from './http';

const BASE = '/stat/run';

export async function statSummary(payload) {
  return (await http.post(BASE, { ...(payload || {}), op: 'describe' })).data;
}
export async function statCorr(payload) {
  return (await http.post(BASE, { ...(payload || {}), op: 'corr' })).data;
}
export async function statTtest(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'ttest',
    args: {
      value: p.value ?? p.valueCol ?? p.args?.value,
      group: p.group ?? p.groupCol ?? p.args?.group,
    },
  })).data;
}
export async function statChi2(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'chisq',
    args: {
      a: p.a ?? p.colA ?? p.args?.a,
      b: p.b ?? p.colB ?? p.args?.b,
    },
  })).data;
}
export async function statLinReg(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'ols',
    args: {
      y: p.y ?? p.target ?? p.args?.y,
      x: p.x ?? p.features ?? p.args?.x,
    },
    options: {
      ...(p.options || {}),
      ...(p.addIntercept !== undefined ? { addIntercept: p.addIntercept } : {}),
      ...(p.dummy !== undefined ? { dummy: p.dummy } : {}),
      ...(p.dropFirst !== undefined ? { dropFirst: p.dropFirst } : {}),
      ...(p.robust !== undefined ? { robust: p.robust } : {}),
    },
  })).data;
}
