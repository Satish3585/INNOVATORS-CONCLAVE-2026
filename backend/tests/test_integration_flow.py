import os
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from app.config import settings
from app.main import app

MONGO = os.getenv("FARMAI_INTEGRATION_MONGODB_URI")


def test_farmer_buyer_complete_marketplace_flow(client, monkeypatch):
    if MONGO:
        monkeypatch.setattr(settings, "mongodb_uri", MONGO)
        monkeypatch.setattr(settings, "mongodb_database", "farmai_test")
        sync_client = MongoClient(MONGO, serverSelectionTimeoutMS=3000)
        sync_client.drop_database("farmai_test")
        sync_client.close()

    farmer = client.post("/api/auth/register", json={"full_name": "Integration Farmer", "email": "farmer-flow@example.com", "password": "long-test-passphrase", "role": "farmer"})
    buyer = client.post("/api/auth/register", json={"full_name": "Integration Buyer", "email": "buyer-flow@example.com", "password": "long-test-passphrase", "role": "buyer"})
    assert farmer.status_code == buyer.status_code == 201
    farmer_token = client.post("/api/auth/login", json={"email": "farmer-flow@example.com", "password": "long-test-passphrase"}).json()["access_token"]
    buyer_token = client.post("/api/auth/login", json={"email": "buyer-flow@example.com", "password": "long-test-passphrase"}).json()["access_token"]
    fh = {"Authorization": f"Bearer {farmer_token}"}
    bh = {"Authorization": f"Bearer {buyer_token}"}
    farm = client.post("/api/farms", headers=fh, json={"name": "Test farm", "size": 4}).json()
    field = client.post(f"/api/farms/{farm['id']}/fields", headers=fh, json={"name": "North plot", "area": 4}).json()
    cultivation = client.post("/api/cultivations", headers=fh, json={"field_id": field["id"], "start_date": "2025-01-01", "crops": [{"crop_name": "Tomato", "expected_harvest_date": "2025-05-01"}]}).json()
    crop = cultivation["crops"][0]
    harvest = client.post("/api/harvests", headers=fh, json={"crop_id": crop["id"], "quantity": 100, "unit": "kg", "harvested_at": datetime.now(timezone.utc).isoformat()})
    assert harvest.status_code == 201
    listing = client.post("/api/marketplace/listings", headers=fh, json={"harvest_id": harvest.json()["id"], "crop_name": "Tomato", "quantity": 80, "unit": "kg", "price_per_unit": 40, "currency": "INR"})
    assert listing.status_code == 201
    interest = client.post(f"/api/marketplace/listings/{listing.json()['id']}/interest", headers=bh, json={"quantity": 30})
    assert interest.status_code == 201
    assert client.patch(f"/api/marketplace/interests/{interest.json()['id']}", headers=fh, json={"status": "accepted"}).status_code == 200
    tx = client.post("/api/transactions", headers=bh, json={"listing_id": listing.json()["id"], "quantity": 30, "agreed_price_per_unit": 40, "currency": "INR"})
    assert tx.status_code == 201
    assert client.patch(f"/api/transactions/{tx.json()['id']}/status", headers=fh, json={"status": "confirmed"}).status_code == 200
    completed = client.patch(f"/api/transactions/{tx.json()['id']}/status", headers=bh, json={"status": "completed"})
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    assert client.get("/api/dashboard/home", headers=fh).status_code == 200
    assert client.get("/api/buyers/dashboard", headers=bh).status_code == 200
