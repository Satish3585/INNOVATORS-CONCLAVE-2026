# FarmAI — Explainable AI for Crop Intelligence and Direct Agricultural Marketplace

FastAPI + Async PyMongo backend for agricultural intelligence, explainable crop recommendations, computer vision plant disease detection, and direct farmer-to-buyer agricultural marketplace.

---

## Architecture Overview

- **Runtime & Web Framework**: Python 3.12, FastAPI, Pydantic v2
- **Primary Database**: MongoDB Atlas / local MongoDB with modern Async PyMongo
- **Authentication**: JWT bearer tokens, Argon2 password hashing via `pwdlib[argon2]`, session tracking
- **Conversational AI**: Local Ollama LLM (`qwen3:8b`), graceful fallback to optional cloud providers
- **Machine Learning Services**:
  - **Crop Recommender**: 7-feature agronomic model (`N`, `P`, `K`, `temperature`, `humidity`, `pH`, `rainfall`) trained on 22 crop classes, with calibrated top-k probabilities and explainable agronomic reasoning
  - **Disease Detector**: PyTorch ResNet9 architecture matching trained PlantVillage weights across 38 crop disease classes
  - **Model Registry**: Central registry with non-leaking health endpoint at `GET /api/health/ml`
- **Marketplace**: Atomic conditional updates, reservation logic, and concurrency protection preventing double reservations

---

## Prerequisites

1. **Python**: 3.12+
2. **MongoDB**: Local MongoDB 7 or MongoDB Atlas connection URI
3. **Ollama (Optional for local conversational AI)**:
   - Install from [ollama.ai](https://ollama.ai)
   - Pull model: `ollama run qwen3:8b` (or `llama3.2:latest`)
   - Default URL: `http://localhost:11434`

---

## Quick Start (Local Windows / Linux / macOS)

### 1. Set Up Environment

```bash
# In the backend directory:
python -m venv .venv

# Activate venv:
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# Install dependencies:
pip install -r requirements.txt
```

### 2. Configure `.env`

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `.env` contains:
- `MONGODB_URI`: Your MongoDB Atlas URI or `mongodb://localhost:27017`
- `JWT_SECRET`: A secure 32+ character random secret
- `AI_PROVIDER`: `ollama`
- `OLLAMA_BASE_URL`: `http://localhost:11434`
- `OLLAMA_MODEL`: `qwen3:8b`

### 3. Start Backend Server

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API documentation will be available at:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **OpenAPI Schema**: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

---

## Health & Status Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/` | `GET` | Service identity and navigation links |
| `/health` | `GET` | Process liveness check |
| `/ready` | `GET` | Database readiness check (returns 503 if MongoDB is down) |
| `/api/health/ml` | `GET` | ML model loading and framework status |

Example `/api/health/ml` response:
```json
{
  "success": true,
  "data": {
    "crop_recommendation": {
      "status": "loaded",
      "model_name": "DecisionTree.pkl (LogisticRegression)",
      "feature_names": ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"],
      "classes_count": 22
    },
    "disease_detection": {
      "status": "loaded",
      "framework": "PyTorch",
      "architecture": "ResNet9",
      "classes_count": 38,
      "device": "cpu"
    },
    "registry_status": "operational"
  }
}
```

---

## Database Seeding

To seed the complete development workflow (1 farmer, 1 buyer, 1 farm, 2 fields including a 0.75-acre multi-crop plot with Tomato, Chilli, and Beans, tasks, expenses, harvests, produce listings, and buyer requirements):

```bash
python scripts/seed.py
```

Demo Credentials Created:
- **Farmer**: `farmer.dev@farmai.test` / `FarmAI@DevTest2026`
- **Buyer**: `buyer.dev@farmai.test` / `FarmAI@DevTest2026`

---

## Running the Automated Test Suite

```bash
pytest -v
```

All 17 tests run hermetically using in-memory mock fixtures or live databases, verifying:
- Authentication, tokens, password hashing, and role checks
- GeoJSON coordinate validation `[longitude, latitude]`
- ML model loading and inference accuracy
- Multi-crop area capacity validation (e.g. 0.75 acre field capacity)
- Full marketplace cycle: harvest -> listing -> interest -> reservation -> transaction -> completion
- Independent farm isolation and non-destructive crop rotation history

---

## Docker Deployment

To build and run both MongoDB and FastAPI in Docker:

```bash
docker compose up --build
```

FastAPI will connect to MongoDB via `mongodb://mongo:27017` and access Ollama on the host machine via `http://host.docker.internal:11434`.

---

## Frontend Integration

The backend is built for seamless consumption by modern React/Vite frontends:
- **CORS**: Configured out-of-the-box for `http://localhost:3000` and `http://localhost:5173`
- **Serialization**: MongoDB `_id` values are cleanly serialized to string `id`
- **Timestamps**: All timestamps use ISO-8601 UTC
- **No Leaked Secrets**: Password hashes and raw server paths are never returned to clients
