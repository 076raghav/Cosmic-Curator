from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import tensorflow as tf
import pickle
import os
import pandas as pd
import numpy as np
from astroquery.vizier import Vizier
from astropy.coordinates import SkyCoord
import astropy.units as u
from fastapi.middleware.cors import CORSMiddleware

class ScanRequest(BaseModel):
    ra: float
    dec: float
    radius: float = 3.0
    limit: int = 10

app = FastAPI(
    title="Cosmic Curator API",
    description="API for detecting astronomical anomalies with a deep learning model.",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
scaler = None
scaler_features = []

@app.on_event("startup")
def load_assets():
    global model, scaler, scaler_features
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(base_dir, '..', 'models', 'cosmic_curator_model.keras')
    scaler_path = os.path.join(base_dir, '..', 'models', 'scaler.pkl')
    if not os.path.exists(model_path) or not os.path.exists(scaler_path):
        raise RuntimeError("Model or scaler file not found!")
    model = tf.keras.models.load_model(model_path)
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    scaler_features = scaler.get_feature_names_out().tolist()
    print("✅ AI assets loaded successfully.")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Cosmic Curator API. The AI model is loaded and ready."}

@app.post("/scan")
def scan_sky_region(request: ScanRequest):
    try:
        print(f"Received scan request for RA={request.ra}, DEC={request.dec}")
        v = Vizier(columns=['*'], row_limit=1000000)
        coord = SkyCoord(ra=request.ra, dec=request.dec, unit=(u.deg, u.deg), frame='icrs')
        result = v.query_region(coord, radius=request.radius * u.deg, catalog="I/355/gaiadr3")
        
        if not result or len(result) == 0:
            return {"message": "No objects found in the specified region.", "anomalies": [], "field_stars": []}
        
        live_data = result[0].to_pandas()
        if live_data.empty:
            return {"message": "No objects found in the specified region.", "anomalies": [], "field_stars": []}
        
        print(f"Found {len(live_data)} objects in the live catalog.")

        live_data_clean = live_data.fillna(0)
        
        feature_map = {
            'e_RA_ICRS': 'coo_err_maj', 'e_DE_ICRS': 'coo_err_min', 'pmDE': 'pmdec', 
            'pmRA': 'pmra', 'Plx': 'plx_value', 'Jmag': 'J', 'Hmag': 'H', 'Kmag': 'K',
            'Gmag': 'G', 'BPmag': 'B', 'RPmag': 'R'
        }
        live_data_renamed = live_data_clean.rename(columns=feature_map)
        
        processed_df = pd.DataFrame(0, index=live_data_renamed.index, columns=scaler_features)
        
        for col in scaler_features:
            if col in live_data_renamed.columns:
                processed_df[col] = pd.to_numeric(live_data_renamed[col], errors='coerce').fillna(0)
        
        X_scaled = scaler.transform(processed_df)
        X_reconstructed = model.predict(X_scaled)
        reconstruction_error = np.mean(np.square(X_scaled - X_reconstructed), axis=1)
        
        results_df = live_data_clean.copy()
        results_df['anomaly_score'] = reconstruction_error
        
        # Separate anomalies from the rest of the field
        anomalies_df = results_df.sort_values(by='anomaly_score', ascending=False).head(request.limit)
        
        # Get the brightest field stars for context (that are not in the anomaly list)
        non_anomalies_df = results_df.drop(anomalies_df.index)
        field_stars_df = non_anomalies_df.sort_values(by='Gmag', ascending=True).head(200) # Brightest 200

        # Format anomalies for response
        anomaly_response = [{
            "id": row.get('Source', 'N/A'),
            "ra": row.get('RA_ICRS', 0),
            "dec": row.get('DE_ICRS', 0),
            "anomaly_score": row['anomaly_score']
        } for _, row in anomalies_df.iterrows()]
        
        # Format field stars for response
        field_star_response = [{
            "id": row.get('Source', 'N/A'),
            "ra": row.get('RA_ICRS', 0),
            "dec": row.get('DE_ICRS', 0),
            "mag": row.get('Gmag', 0) # Magnitude for sizing the star
        } for _, row in field_stars_df.iterrows()]
            
        print(f"Returning {len(anomaly_response)} anomalies and {len(field_star_response)} field stars.")
        return {
            "message": f"Analysis complete. Found {len(live_data)} objects.", 
            "anomalies": anomaly_response,
            "field_stars": field_star_response
        }

    except Exception as e:
        print(f"An error occurred: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

