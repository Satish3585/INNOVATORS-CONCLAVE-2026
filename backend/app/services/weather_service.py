import logging
from typing import Any, Dict, Optional
import httpx
from app.config import settings

logger = logging.getLogger("farmai.services.weather")


class WeatherService:
    """
    Weather intelligence service.
    Calls configured weather API (e.g. OpenWeatherMap).
    Gracefully returns status='unavailable' when unconfigured or unreachable.
    Never fabricates fake weather readings.
    """

    def __init__(self):
        self.api_url = settings.weather_api_url
        self.api_key = settings.weather_api_key

    @property
    def is_configured(self) -> bool:
        return bool(self.api_url and self.api_key)

    async def get_current_weather(self, latitude: float, longitude: float) -> Dict[str, Any]:
        if not self.is_configured:
            return {
                "available": False,
                "status": "unavailable",
                "message": "External weather service is not configured.",
                "data": None,
            }

        try:
            params = {
                "lat": latitude,
                "lon": longitude,
                "appid": self.api_key,
                "units": "metric",
            }
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(self.api_url, params=params)
                if res.status_code == 200:
                    raw = res.json()
                    main = raw.get("main", {})
                    weather_desc = raw.get("weather", [{}])[0]
                    return {
                        "available": True,
                        "status": "available",
                        "data": {
                            "temperature_c": main.get("temp"),
                            "feels_like_c": main.get("feels_like"),
                            "humidity_pct": main.get("humidity"),
                            "pressure_hpa": main.get("pressure"),
                            "condition": weather_desc.get("main"),
                            "description": weather_desc.get("description"),
                            "wind_speed_ms": raw.get("wind", {}).get("speed"),
                        },
                    }
                logger.warning(f"Weather API returned status {res.status_code}")
                return {
                    "available": False,
                    "status": "unavailable",
                    "message": "Weather service temporarily unreachable.",
                    "data": None,
                }
        except Exception as e:
            logger.warning(f"Error fetching weather data: {e}")
            return {
                "available": False,
                "status": "unavailable",
                "message": "Weather provider request failed.",
                "data": None,
            }


weather_service = WeatherService()
