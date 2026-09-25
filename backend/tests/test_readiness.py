from fastapi.testclient import TestClient
from app.database import Database
from app.main import app


def test_app_starts_without_database_and_reports_not_ready(monkeypatch):
    async def unavailable():
        raise ConnectionError("simulated unavailable database")

    monkeypatch.setattr(Database, "connect", staticmethod(unavailable))
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        readiness = client.get("/ready")
        assert readiness.status_code == 503
        assert readiness.json() == {"ready": False, "dependencies": {"mongodb": False}}
