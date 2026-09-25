import logging
from typing import Any, Dict, List, Optional
import httpx
from app.config import settings

logger = logging.getLogger("farmai.services.market")


class MarketService:
    """
    Agricultural market price intelligence service (e.g. Agmarknet / APMC Mandi data).
    Returns real prices when configured, or status='unavailable'.
    Never invents market prices.
    """

    def __init__(self):
        self.api_url = settings.market_api_url
        self.api_key = settings.market_api_key

    @property
    def is_configured(self) -> bool:
        return bool(self.api_url)

    async def get_market_prices(
        self,
        crop_name: Optional[str] = None,
        state: Optional[str] = None,
        district: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured:
            return {
                "available": False,
                "status": "unavailable",
                "message": "Real-time mandi market data feed is not configured.",
                "items": [],
            }

        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        params = {}
        if crop_name:
            params["commodity"] = crop_name
        if state:
            params["state"] = state
        if district:
            params["district"] = district

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(self.api_url, params=params, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    items = data.get("records", data if isinstance(data, list) else [])
                    return {
                        "available": True,
                        "status": "available",
                        "items": items,
                        "source": self.api_url,
                    }
                return {
                    "available": False,
                    "status": "unavailable",
                    "message": f"Market feed returned status {res.status_code}",
                    "items": [],
                }
        except Exception as e:
            logger.warning(f"Failed to fetch market data: {e}")
            return {
                "available": False,
                "status": "unavailable",
                "message": "Market feed request failed.",
                "items": [],
            }


market_service = MarketService()
