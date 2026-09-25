from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.database import Database, lifespan
from app.routers import agriculture, ai, auth_profile, dashboard, documents, extras, farms, marketplace, operations, support, uploads

app = FastAPI(title=settings.app_name, version="1.0.0", description="Backend API for FarmSaathi farmer and buyer workflows.", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins_list, allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Keep internal tracebacks out of API responses; production logs capture full detail.
    import logging
    logging.getLogger("farmai").exception("Unhandled API exception", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/", tags=["system"])
async def root():
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.environment,
        "docs_url": "/docs",
        "openapi_url": "/openapi.json",
        "health_url": "/health",
        "ready_url": "/ready",
    }


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/ready", tags=["system"])
async def ready():
    database_ready = await Database.ping()
    if not database_ready:
        return JSONResponse(status_code=503, content={"ready": False, "dependencies": {"mongodb": False}})
    return {"ready": True, "dependencies": {"mongodb": True}}


@app.get("/health/ml", tags=["system"])
@app.get("/api/health/ml", tags=["system"])
async def ml_health():
    from app.services.ml.model_registry import model_registry
    return {
        "success": True,
        "data": model_registry.get_health_status(),
    }


@app.get("/system/status", tags=["system"])
@app.get("/api/system/status", tags=["system"])
async def system_status():
    from app.services.ml.model_registry import model_registry
    from app.services.ai_service import ai_service

    db_ready = await Database.ping()
    
    ollama_ready = False
    try:
        ollama_ready = await ai_service.ollama.is_available()
    except Exception:
        pass

    gemini_ready = False
    try:
        gemini_ready = await ai_service.gemini.is_available()
    except Exception:
        pass

    orchestrator_status = "active (Ollama + Gemini Failover)" if (ollama_ready and gemini_ready) else ("ollama_active" if ollama_ready else ("gemini_active" if gemini_ready else "degraded"))

    ml_status = model_registry.get_health_status()
    crop_ready = ml_status.get("crop_recommendation", {}).get("status") in {"loaded", "ready"}
    disease_ready = ml_status.get("disease_detection", {}).get("status") in {"loaded", "ready"}

    weather_configured = bool(settings.weather_api_url and settings.weather_api_key)
    market_configured = bool(settings.market_api_url and settings.market_api_key)
    schemes_configured = True

    return {
        "status": "ok",
        "service": settings.app_name,
        "subsystems": {
            "backend": {"available": True, "label": "Backend (FastAPI)", "status": "operational"},
            "mongodb": {"available": db_ready, "label": "MongoDB Database", "status": "connected" if db_ready else "offline"},
            "ai_orchestrator": {"available": ollama_ready or gemini_ready, "label": "AI Provider Orchestrator", "status": orchestrator_status},
            "ollama": {"available": ollama_ready, "label": f"Ollama Local AI ({settings.ollama_model})", "status": "ready" if ollama_ready else "unavailable"},
            "gemini": {"available": gemini_ready, "label": f"Gemini Cloud AI ({settings.gemini_model})", "status": "ready" if gemini_ready else "unconfigured"},
            "crop_model": {"available": crop_ready, "label": "Crop Recommendation ML Model", "status": "ready" if crop_ready else "degraded"},
            "disease_model": {"available": disease_ready, "label": "Plant Disease CV Model", "status": "ready" if disease_ready else "degraded"},
            "weather_api": {"available": weather_configured, "label": "Weather Provider API", "status": "configured" if weather_configured else "not_configured"},
            "market_api": {"available": market_configured, "label": "Market Data API", "status": "configured" if market_configured else "not_configured"},
            "schemes_api": {"available": schemes_configured, "label": "Government Support Schemes", "status": "catalog_active"},
        }
    }


ROUTER_CONFIGS = [
    (auth_profile.router, "Authentication & Profile"),
    (dashboard.router, "Dashboard & History"),
    (agriculture.router, "Agriculture & Crops"),
    (farms.router, "Farms & Fields"),
    (operations.router, "Farm Operations & Tasks"),
    (marketplace.router, "Marketplace & Transactions"),
    (support.router, "Support, Weather & Schemes"),
    (ai.router, "FarmAI Assistant"),
    (extras.router, "Audit & Analytics"),
    (uploads.router, "Uploads"),
    (documents.router, "Document & Report Center"),
]

for router_obj, tag in ROUTER_CONFIGS:
    app.include_router(router_obj, prefix=settings.api_prefix, tags=[tag])
