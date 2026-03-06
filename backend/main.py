from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np

import sys
import os

# Add src to path to import environment and pomdp_agent
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from simulate import run_simulation, step_simulation

app = FastAPI(title="POMDP Geologic Hydrogen Exploration API")

# Allow CORS for local Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://chasing-fairy-circles.vercel.app",
        "https://chasing-fairy-circles.valeriacartagena.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load data at startup
DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'gee_features_pca.csv')
print(f"Loading data from {DATA_PATH}")

try:
    from sklearn.cluster import KMeans
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} rows. Columns: {df.columns.tolist()}")

    # Compute KMeans clusters (same logic as FCEnvironment) and attach as a column
    pca_cols = [c for c in df.columns if c.startswith('pca_feature')]
    if pca_cols:
        _km = KMeans(n_clusters=2, random_state=42, n_init=10)
        df['cluster'] = _km.fit_predict(df[pca_cols].values)
        # Ensure cluster 1 = hydrogen-bearing (lower mean NDVI)
        if 'current_NDVI' in df.columns:
            ndvi0 = df.loc[df['cluster'] == 0, 'current_NDVI'].mean()
            ndvi1 = df.loc[df['cluster'] == 1, 'current_NDVI'].mean()
            if ndvi0 < ndvi1:  # cluster 0 has lower NDVI → it's hydrogen, swap labels
                df['cluster'] = df['cluster'].map({0: 1, 1: 0})

    # Stable zero-based index within each location group for array indexing
    df['cell_idx'] = df.groupby('location').cumcount()

except Exception as e:
    print(f"Error loading data: {e}")
    df = None


class SimulateRequest(BaseModel):
    region: str
    policy: str
    budget: float = 5000.0
    n_trials: int = 10
    exploration_constant: float = 1.0

class StepRequest(BaseModel):
    region: str
    policy: str
    budget: float = 5000.0
    exploration_constant: float = 1.0
    state_token: str | None = None
    cost_survey: float = 50.0
    cost_drill_success: float = 200.0
    cost_drill_fail: float = 400.0


@app.get("/features")
def get_features(region: str | None = None):
    if df is None:
        raise HTTPException(status_code=500, detail="Data not loaded")
    
    filtered_df = df
    if region and region.lower() != "all three":
        filtered_df = df[df['location'].str.lower() == region.lower()]
    
    # We replace NaNs with None for JSON serialization compatibility
    features = filtered_df.replace({np.nan: None}).to_dict(orient='records')
    return {"cells": features}


@app.post("/simulate")
def simulate(req: SimulateRequest):
    if df is None:
        raise HTTPException(status_code=500, detail="Data not loaded")
    
    try:
        results = run_simulation(df, req.region, req.policy, req.budget, req.n_trials, req.exploration_constant)
        return {"trials": results}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/step")
def step(req: StepRequest):
    if df is None:
        raise HTTPException(status_code=500, detail="Data not loaded")
    
    try:
        result = step_simulation(
            df, req.region, req.policy, req.budget, req.exploration_constant, req.state_token,
            cost_survey=req.cost_survey,
            cost_drill_success=req.cost_drill_success,
            cost_drill_fail=req.cost_drill_fail,
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}
