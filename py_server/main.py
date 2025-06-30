from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd

app = FastAPI()

class StatsRequest(BaseModel):
    data: List[Dict[str, Any]]
    columns: List[str]
    stats: List[str]

@app.post('/api/basic-stats')
def basic_stats(req: StatsRequest):
    df = pd.DataFrame(req.data)
    results = {}
    for col in req.columns:
        series = pd.to_numeric(df[col], errors='coerce')
        col_res = {}
        if 'mean' in req.stats:
            val = series.mean()
            col_res['mean'] = None if pd.isna(val) else float(val)
        if 'median' in req.stats:
            val = series.median()
            col_res['median'] = None if pd.isna(val) else float(val)
        if 'std' in req.stats:
            val = series.std()
            col_res['std'] = None if pd.isna(val) else float(val)
        if 'min' in req.stats:
            val = series.min()
            col_res['min'] = None if pd.isna(val) else float(val)
        if 'max' in req.stats:
            val = series.max()
            col_res['max'] = None if pd.isna(val) else float(val)
        if 'null_count' in req.stats:
            col_res['null_count'] = int(series.isna().sum())
        results[col] = col_res
    return {'results': results}
