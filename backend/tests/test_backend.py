from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.common import safe
from app.main import app
from app.schemas import Location, LocationSource
from app.security import hash_password, verify_password
from bson import ObjectId


def test_health_and_openapi_without_database():
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    assert client.get("/health").json()["status"] == "ok"
    schema = client.get("/openapi.json").json()
    assert "/api/auth/register" in schema["paths"]
    assert "/api/marketplace/listings" in schema["paths"]
    assert "/api/transactions" in schema["paths"]


def test_geojson_uses_longitude_then_latitude_and_preserves_source():
    loc = Location(source=LocationSource.gps, latitude=12.9, longitude=77.6, captured_at=datetime.now(timezone.utc))
    geo = loc.as_geojson()
    assert geo["coordinates"]["coordinates"] == [77.6, 12.9]
    assert geo["source"] == "gps"


def test_gps_requires_capture_time():
    try:
        Location(source="gps", latitude=1, longitude=2)
    except ValueError:
        pass
    else:
        raise AssertionError("GPS timestamps must be validated")


def test_password_hashing_and_safe_serialization():
    encoded = hash_password("secure-demo-passphrase")
    assert encoded != "secure-demo-passphrase"
    assert verify_password("secure-demo-passphrase", encoded)
    assert not verify_password("wrong", encoded)
    item = safe({"_id": ObjectId("64f000000000000000000001"), "password_hash": "secret", "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc)})
    assert item["id"] == "64f000000000000000000001"
    assert "password_hash" not in item


def test_listing_public_response_redacts_exact_location_and_owner_ids():
    from app.routers.marketplace import public_listing
    listing = public_listing({"_id": ObjectId(), "owner_id": "owner", "farmer_id": "farmer", "harvest_id": "harvest", "location": {"source": "gps", "latitude": 12.0, "longitude": 77.0, "district": "Example", "coordinates": {"type": "Point", "coordinates": [77.0, 12.0]}}})
    assert "owner_id" not in listing and "farmer_id" not in listing and "harvest_id" not in listing
    assert "coordinates" not in listing["location"]
    assert "latitude" not in listing["location"] and "longitude" not in listing["location"]
    assert listing["location"]["district"] == "Example"


def test_required_openapi_surface_and_database_readiness():
    client = TestClient(app)
    paths = client.get("/openapi.json").json()["paths"]
    required = ["/health", "/ready", "/api/auth/register", "/api/crops", "/api/soil", "/api/disease", "/api/pests", "/api/listings", "/api/matches", "/api/transactions", "/api/ai/actions", "/api/weather", "/api/schemes", "/api/audit-logs", "/api/history", "/api/uploads"]
    assert all(path in paths for path in required)
    response = client.get("/ready")
    assert response.status_code in (200, 503)
    if response.status_code == 503:
        assert response.json()["dependencies"]["mongodb"] is False


def test_manual_location_can_be_address_only_but_partial_coordinates_are_rejected():
    manual = Location(source="manual", state="Example State", district="Example District", village="Farm Village")
    assert "coordinates" not in manual.as_geojson()
    try:
        Location(source="manual", latitude=12.0)
    except ValueError:
        pass
    else:
        raise AssertionError("Latitude and longitude must be supplied together")


def test_root_endpoint_returns_service_info():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["docs_url"] == "/docs"
    assert data["health_url"] == "/health"


def test_openapi_tags_are_categorized():
    client = TestClient(app)
    schema = client.get("/openapi.json").json()
    all_tags = {tag for path_info in schema["paths"].values() for method_info in path_info.values() for tag in method_info.get("tags", [])}
    assert "Authentication & Profile" in all_tags
    assert "Marketplace & Transactions" in all_tags
    assert "Farm Operations & Tasks" in all_tags
    assert "FarmAI Assistant" in all_tags
