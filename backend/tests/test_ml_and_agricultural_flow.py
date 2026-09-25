import io
import pytest
from datetime import datetime, timezone
from PIL import Image
from app.services.ml.model_registry import model_registry


def test_ml_health_endpoint(client):
    """Verifies GET /api/health/ml returns loaded status for configured models."""
    res = client.get("/api/health/ml")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    ml_data = data["data"]
    assert "crop_recommendation" in ml_data
    assert ml_data["crop_recommendation"]["status"] == "loaded"
    assert "disease_detection" in ml_data
    assert ml_data["disease_detection"]["status"] == "loaded"


def test_crop_recommendation_ml_service():
    """
    Tests ML Crop Recommender with the 7-feature input vector:
    N, P, K, temperature, humidity, ph, rainfall.
    """
    recommender = model_registry.crop_recommender
    assert recommender.is_available
    result = recommender.predict(
        nitrogen=90,
        phosphorus=42,
        potassium=43,
        temperature=20.8,
        humidity=82.0,
        ph=6.5,
        rainfall=202.9,
        top_k=3,
    )
    assert result["success"] is True
    assert result["primary_recommendation"] == "rice"
    assert len(result["top_recommendations"]) <= 3
    top1 = result["top_recommendations"][0]
    assert top1["crop"] == "rice"
    assert top1["confidence_pct"] > 50.0


def test_disease_detector_ml_service():
    """
    Tests ResNet9 PyTorch Disease Detector inference on a valid leaf image buffer.
    """
    detector = model_registry.disease_detector
    assert detector.is_available

    # Generate a synthetic green leaf image buffer to test inference pipeline
    img = Image.new("RGB", (256, 256), color=(45, 120, 35))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    img_bytes = buf.getvalue()

    result = detector.detect(img_bytes)
    assert result["success"] is True
    assert "predicted_class" in result
    assert "confidence_pct" in result
    assert "severity" in result
    assert "recommended_actions" in result
    assert len(result["recommended_actions"]) > 0


def test_section_57_full_agricultural_and_marketplace_flow(client):
    """
    Executes the exact scenario specified in Section 57:
    Farmer -> Farm -> Field 0.75 acre -> Cultivation ->
    Tomato 0.50 acre, Chilli 0.15 acre, Beans 0.10 acre (Total 0.75 acre) ->
    Tasks -> Irrigation -> Inputs -> Expenses -> Health check ->
    Multiple Harvests -> Listing -> Buyer Requirement -> Buyer Interest ->
    Partial Sale -> Transaction -> History.
    """
    # 1. Register Farmer & Buyer
    f_res = client.post("/api/auth/register", json={
        "full_name": "Suresh Patil",
        "email": "suresh.farmer@test.com",
        "password": "SecurePassword123!",
        "role": "farmer",
    })
    assert f_res.status_code == 201

    b_res = client.post("/api/auth/register", json={
        "full_name": "Amit Shah",
        "email": "amit.buyer@test.com",
        "password": "SecurePassword123!",
        "role": "buyer",
    })
    assert b_res.status_code == 201

    f_token = client.post("/api/auth/login", json={"email": "suresh.farmer@test.com", "password": "SecurePassword123!"}).json()["access_token"]
    b_token = client.post("/api/auth/login", json={"email": "amit.buyer@test.com", "password": "SecurePassword123!"}).json()["access_token"]
    fh = {"Authorization": f"Bearer {f_token}"}
    bh = {"Authorization": f"Bearer {b_token}"}

    # 2. Create Farm
    farm = client.post("/api/farms", headers=fh, json={"name": "Sahyadri Agro Farm", "size": 5.0, "size_unit": "acre"}).json()
    farm_id = farm["id"]

    # 3. Create Field: 0.75 acre
    field = client.post(f"/api/farms/{farm_id}/fields", headers=fh, json={"name": "Plot 1 (0.75 Acre)", "area": 0.75, "area_unit": "acre"}).json()
    field_id = field["id"]

    # 4. Multi-Crop Cultivation: Tomato 0.50, Chilli 0.15, Beans 0.10 (Total = 0.75 acre)
    cult = client.post("/api/cultivations", headers=fh, json={
        "field_id": field_id,
        "name": "Kharif Multi-Crop",
        "start_date": "2026-06-01",
        "crops": [
            {"crop_name": "Tomato", "area": 0.50, "variety": "Abhinav"},
            {"crop_name": "Chilli", "area": 0.15, "variety": "G-4"},
            {"crop_name": "Beans", "area": 0.10, "variety": "French"},
        ],
    })
    assert cult.status_code == 201
    crops = cult.json()["crops"]
    assert len(crops) == 3
    tomato_crop = [c for c in crops if c["crop_name"] == "Tomato"][0]
    tomato_id = tomato_crop["id"]

    # 5. Verify field capacity validation: Attempting to add 0.20 acre when 0.75 is fully allocated fails
    overflow = client.post("/api/crops", headers=fh, json={
        "field_id": field_id,
        "crop_name": "Maize",
        "area": 0.20,
    })
    assert overflow.status_code == 422
    assert "exceeds" in overflow.json()["detail"].lower()

    # 6. Operations Records: Tasks, Irrigation, Inputs, Expenses
    task = client.post("/api/tasks", headers=fh, json={
        "crop_id": tomato_id,
        "field_id": field_id,
        "title": "Pruning lower leaves",
        "due_date": datetime.now(timezone.utc).isoformat(),
        "priority": "important",
    })
    assert task.status_code == 201

    irrigation = client.post("/api/irrigation", headers=fh, json={
        "crop_id": tomato_id,
        "field_id": field_id,
        "water_amount": 1200,
        "water_unit": "litres",
        "method": "drip",
    })
    assert irrigation.status_code == 201

    input_rec = client.post("/api/inputs", headers=fh, json={
        "crop_id": tomato_id,
        "field_id": field_id,
        "input_name": "Organic Compost",
        "category": "fertilizer",
        "quantity": 100,
        "unit": "kg",
    })
    assert input_rec.status_code == 201

    expense = client.post("/api/expenses", headers=fh, json={
        "crop_id": tomato_id,
        "field_id": field_id,
        "category": "fertilizer",
        "amount": 1500.0,
        "currency": "INR",
        "date": "2026-06-15",
    })
    assert expense.status_code == 201

    # 7. Health Check
    health = client.post("/api/health-checks", headers=fh, json={
        "crop_id": tomato_id,
        "symptoms": ["yellow spots on leaf"],
    })
    assert health.status_code == 201

    # 8. Multiple Harvests: Picking 1 (200kg) and Picking 2 (300kg)
    h1 = client.post("/api/harvests", headers=fh, json={"crop_id": tomato_id, "quantity": 200.0, "unit": "kg", "quality_grade": "A"})
    h2 = client.post("/api/harvests", headers=fh, json={"crop_id": tomato_id, "quantity": 300.0, "unit": "kg", "quality_grade": "A"})
    assert h1.status_code == 201 and h2.status_code == 201
    h2_id = h2.json()["id"]

    # 9. Create Produce Listing from Harvest 2
    listing = client.post("/api/marketplace/listings", headers=fh, json={
        "harvest_id": h2_id,
        "crop_name": "Tomato",
        "quantity": 300.0,
        "unit": "kg",
        "price_per_unit": 35.0,
        "currency": "INR",
    })
    assert listing.status_code == 201
    listing_id = listing.json()["id"]

    # 10. Buyer Requirement & Buyer Interest
    req = client.post("/api/requirements", headers=bh, json={
        "crop_name": "Tomato",
        "quantity": 100.0,
        "unit": "kg",
        "target_price": 40.0,
    })
    assert req.status_code == 201

    interest = client.post(f"/api/marketplace/listings/{listing_id}/interest", headers=bh, json={
        "quantity": 100.0,
        "message": "Interested in 100kg batch",
    })
    assert interest.status_code == 201
    interest_id = interest.json()["id"]

    # 11. Farmer accepts interest
    accept = client.patch(f"/api/marketplace/interests/{interest_id}", headers=fh, json={"status": "accepted"})
    assert accept.status_code == 200

    # 12. Buyer creates transaction (Partial sale: 100 kg out of 300 kg)
    tx = client.post("/api/transactions", headers=bh, json={
        "listing_id": listing_id,
        "quantity": 100.0,
        "agreed_price_per_unit": 35.0,
        "currency": "INR",
    })
    assert tx.status_code == 201
    tx_id = tx.json()["id"]

    # 13. Farmer confirms, Buyer completes
    confirm = client.patch(f"/api/transactions/{tx_id}/status", headers=fh, json={"status": "confirmed"})
    assert confirm.status_code == 200
    complete = client.patch(f"/api/transactions/{tx_id}/status", headers=bh, json={"status": "completed"})
    assert complete.status_code == 200
    assert complete.json()["status"] == "completed"

    # 14. History remains intact
    journey = client.get(f"/api/crops/{tomato_id}/journey", headers=fh)
    assert journey.status_code == 200
    timeline = journey.json()["timeline"]
    assert len(timeline) >= 4  # Includes tasks, irrigation, inputs, expenses, harvests


def test_independent_farms_same_farmer(client):
    """Verifies that Farm A -> Tomato and Farm B -> Tomato remain strictly independent."""
    f_res = client.post("/api/auth/register", json={
        "full_name": "Multi Farm Owner",
        "email": "multi.farm@test.com",
        "password": "Password123!",
        "role": "farmer",
    })
    token = client.post("/api/auth/login", json={"email": "multi.farm@test.com", "password": "Password123!"}).json()["access_token"]
    fh = {"Authorization": f"Bearer {token}"}

    farm_a = client.post("/api/farms", headers=fh, json={"name": "Farm Alpha", "size": 2.0}).json()
    farm_b = client.post("/api/farms", headers=fh, json={"name": "Farm Beta", "size": 3.0}).json()

    field_a = client.post(f"/api/farms/{farm_a['id']}/fields", headers=fh, json={"name": "Field A", "area": 1.0}).json()
    field_b = client.post(f"/api/farms/{farm_b['id']}/fields", headers=fh, json={"name": "Field B", "area": 1.0}).json()

    crop_a = client.post("/api/crops", headers=fh, json={"field_id": field_a["id"], "crop_name": "Tomato", "area": 1.0}).json()
    crop_b = client.post("/api/crops", headers=fh, json={"field_id": field_b["id"], "crop_name": "Tomato", "area": 1.0}).json()

    assert crop_a["id"] != crop_b["id"]
    assert crop_a["farm_id"] == farm_a["id"]
    assert crop_b["farm_id"] == farm_b["id"]


def test_crop_rotation_preserves_history(client):
    """
    Tests crop rotation: Tomato -> Chilli -> Groundnut in sequence
    without deleting previous crops from history.
    """
    token = client.post("/api/auth/register", json={
        "full_name": "Rotation Farmer",
        "email": "rotation@test.com",
        "password": "Password123!",
        "role": "farmer",
    }).json()
    t = client.post("/api/auth/login", json={"email": "rotation@test.com", "password": "Password123!"}).json()["access_token"]
    fh = {"Authorization": f"Bearer {t}"}

    farm = client.post("/api/farms", headers=fh, json={"name": "Rotation Farm", "size": 1.0}).json()
    field = client.post(f"/api/farms/{farm['id']}/fields", headers=fh, json={"name": "Field 1", "area": 1.0}).json()

    # Cycle 1: Tomato
    c1 = client.post("/api/crops", headers=fh, json={"field_id": field["id"], "crop_name": "Tomato", "area": 1.0}).json()
    complete1 = client.post(f"/api/crops/{c1['id']}/complete", headers=fh)
    assert complete1.status_code == 200
    assert complete1.json()["status"] == "completed"

    # Cycle 2: Chilli
    c2 = client.post("/api/crops", headers=fh, json={"field_id": field["id"], "crop_name": "Chilli", "area": 1.0}).json()
    complete2 = client.post(f"/api/crops/{c2['id']}/complete", headers=fh)
    assert complete2.status_code == 200

    # Cycle 3: Groundnut
    c3 = client.post("/api/crops", headers=fh, json={"field_id": field["id"], "crop_name": "Groundnut", "area": 1.0}).json()

    # Verify all 3 crops remain in history for this field
    all_crops = client.get(f"/api/crops?field_id={field['id']}", headers=fh).json()["items"]
    assert len(all_crops) == 3
    names = {c["crop_name"] for c in all_crops}
    assert names == {"Tomato", "Chilli", "Groundnut"}
