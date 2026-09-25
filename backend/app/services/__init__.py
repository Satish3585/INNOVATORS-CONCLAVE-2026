import httpx
from typing import Any, Dict, Optional
from app.services.ai_service import farm_ai_reply, ai_service, AIService
from app.services.weather_service import weather_service, WeatherService
from app.services.market_service import market_service, MarketService
from app.services.scheme_service import scheme_service, SchemeService
from app.services.recommendation_service import recommendation_service, RecommendationService
from app.services.ml import model_registry, crop_recommender, disease_detector


async def external_json(base_url: Optional[str], api_key: Optional[str], params: Optional[Dict[str, Any]] = None) -> Optional[Any]:
    """Helper to query external JSON REST APIs safely."""
    if not base_url:
        return None
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(base_url, params=params or {}, headers=headers)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError):
        return None


__all__ = [
    "external_json",
    "farm_ai_reply",
    "ai_service",
    "AIService",
    "weather_service",
    "WeatherService",
    "market_service",
    "MarketService",
    "scheme_service",
    "SchemeService",
    "recommendation_service",
    "RecommendationService",
    "model_registry",
    "crop_recommender",
    "disease_detector",
]
