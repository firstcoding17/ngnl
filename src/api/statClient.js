// src/api/statClient.js
import axios from "axios";

// src/api/statClient.js
import http from './http';

const BASE = '/stat';

export async function statSummary(payload) { return (await http.post(`${BASE}/summary`, payload)).data; }
export async function statCorr(payload)    { return (await http.post(`${BASE}/correlation`, payload)).data; }
export async function statTtest(payload)   { return (await http.post(`${BASE}/ttest`, payload)).data; }
export async function statChi2(payload)    { return (await http.post(`${BASE}/chi2`, payload)).data; }
export async function statLinReg(payload)  { return (await http.post(`${BASE}/linreg`, payload)).data; }

