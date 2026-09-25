import logging
from typing import Any, Dict, List, Optional
import httpx
from app.config import settings

logger = logging.getLogger("farmai.services.schemes")

# Standard verified official schemes baseline with authentic official links
VERIFIED_SCHEMES: List[Dict[str, Any]] = [
    {
        "id": "pm-kisan",
        "name": "Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)",
        "description": "Income support of Rs 6,000 per year in three equal installments to all landholding farmer families.",
        "category": "Direct Benefit Transfer",
        "state": "All India",
        "eligibility": "Small and marginal farmers holding cultivable land in their names (subject to exclusion criteria).",
        "benefits": "Rs 6,000 per annum paid directly to Aadhaar-seeded bank accounts.",
        "documents": ["Aadhaar Card", "Land ownership records (Khata/Khasra)", "Bank passbook"],
        "application_steps": [
            "Visit the official PM-KISAN portal or local CSC center",
            "Fill in Farmers Corner registration with Aadhaar",
            "Upload land ownership details and bank account",
        ],
        "official_url": "https://pmkisan.gov.in",
        "source": "Ministry of Agriculture and Farmers Welfare, Govt of India",
        "last_verified": "2026-01-15",
        "active": True,
    },
    {
        "id": "pmfby",
        "name": "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
        "description": "Comprehensive crop insurance coverage against non-preventable natural risks from pre-sowing to post-harvest.",
        "category": "Crop Insurance",
        "state": "All India",
        "eligibility": "All farmers growing notified crops in notified areas including sharecroppers and tenant farmers.",
        "benefits": "Low premium rate (2% Kharif, 1.5% Rabi, 5% commercial/horticultural); sum insured covers yield loss.",
        "documents": ["Aadhaar Card", "Land possession certificate / tenancy agreement", "Sowing certificate", "Bank account details"],
        "application_steps": [
            "Enroll via national crop insurance portal, bank branch, or insurance intermediary before cutoff date",
            "Submit sowing declaration and required documents",
        ],
        "official_url": "https://pmfby.gov.in",
        "source": "Ministry of Agriculture and Farmers Welfare, Govt of India",
        "last_verified": "2026-01-15",
        "active": True,
    },
    {
        "id": "pmksy",
        "name": "Per Drop More Crop - PMKSY",
        "description": "Promotes micro-irrigation technologies (drip and sprinkler) to enhance water use efficiency at farm level.",
        "category": "Irrigation & Infrastructure",
        "state": "All India",
        "eligibility": "Farmers owning agricultural land with an assured water source.",
        "benefits": "Up to 45% - 55% subsidy on installation of drip and sprinkler irrigation systems.",
        "documents": ["Aadhaar", "Land records", "Soil & water test report", "Quotation from approved micro-irrigation manufacturer"],
        "application_steps": [
            "Apply through state agriculture/horticulture department portal or district officer",
            "Field inspection and feasibility assessment",
            "Installation and direct subsidy release to vendor/farmer",
        ],
        "official_url": "https://pmksy.gov.in",
        "source": "Dept of Agriculture & Cooperation, Govt of India",
        "last_verified": "2026-01-15",
        "active": True,
    },
]


class SchemeService:
    def __init__(self):
        self.api_url = settings.schemes_api_url
        self.api_key = settings.schemes_api_key

    async def get_schemes(self, state: Optional[str] = None, category: Optional[str] = None) -> Dict[str, Any]:
        """
        Returns active government schemes from verified directory or external API if configured.
        """
        if self.api_url:
            try:
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.get(self.api_url, headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        items = data.get("schemes", data if isinstance(data, list) else [])
                        return {"available": True, "source": "external_api", "items": items}
            except Exception as e:
                logger.warning(f"Failed to query external schemes API: {e}")

        # Fallback to verified national schemes baseline
        filtered = VERIFIED_SCHEMES
        if state and state.lower() != "all india":
            filtered = [s for s in filtered if s["state"] in ("All India", state)]
        if category:
            filtered = [s for s in filtered if category.lower() in s["category"].lower()]

        return {
            "available": True,
            "source": "verified_government_directory",
            "items": filtered,
        }


scheme_service = SchemeService()
