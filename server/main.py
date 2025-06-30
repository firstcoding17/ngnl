from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Any, Dict
import pandas as pd

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TableData(BaseModel):
    columns: List[str]
    rows: List[List[Any]]

class BasicStatsRequest(BaseModel):
    data: TableData
    columns: List[str]
    metrics: List[str]

@app.post("/api/basic-stats")
def basic_stats(req: BasicStatsRequest):
    try:
        df = pd.DataFrame(req.data.rows, columns=req.data.columns)
        df = df.apply(pd.to_numeric, errors='coerce')
        selected = [c for c in req.columns if c in df.columns]
        if not selected:
            raise HTTPException(status_code=400, detail="No valid columns provided")
        if not req.metrics:
            raise HTTPException(status_code=400, detail="No metrics provided")

        result: Dict[str, Dict[str, float]] = {}
        for metric in req.metrics:
            if metric == "mean":
                result[metric] = df[selected].mean().to_dict()
            elif metric == "median":
                result[metric] = df[selected].median().to_dict()
            elif metric == "std":
                result[metric] = df[selected].std().to_dict()
            elif metric == "min":
                result[metric] = df[selected].min().to_dict()
            elif metric == "max":
                result[metric] = df[selected].max().to_dict()
            elif metric == "null_count":
                result[metric] = df[selected].isna().sum().to_dict()
        return {"results": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)

