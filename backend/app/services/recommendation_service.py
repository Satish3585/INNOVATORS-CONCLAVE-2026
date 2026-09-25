import logging
from typing import Any, Dict, List, Optional
from app.services.ml.crop_recommender import crop_recommender, CROP_METADATA

logger = logging.getLogger("farmai.services.recommendation")

ROTATION_BENEFITS = {
    "cereal_after_pulse": "Planting cereal crops after legumes/pulses replenishes soil nitrogen organically and breaks pest cycles.",
    "deep_after_shallow": "Alternating deep-rooted crops (like cotton/pigeonpeas) with shallow-rooted crops (like onion/leafy vegetables) extracts nutrients from varying soil horizons.",
}

INTERCROP_PAIRS = [
    {
        "primary": "tomato",
        "companion": "onion",
        "compatibility": "high",
        "reason": "Onions naturally repel aphids and thrips from tomato foliage. Different root depths minimize nutrient competition.",
    },
    {
        "primary": "maize",
        "companion": "soybean",
        "compatibility": "high",
        "reason": "Soybeans fix atmospheric nitrogen that feeds the maize, while maize provides partial shade and wind resistance.",
    },
    {
        "primary": "chilli",
        "companion": "beans",
        "compatibility": "high",
        "reason": "Leguminous beans add nitrogen to support vegetative growth of chilli without heavy chemical fertilizers.",
    },
]


class RecommendationService:
    """
    Agricultural recommendation engine combining trained ML predictions with
    agronomic domain rules, soil tests, crop rotation, and mixed cropping logic.
    """

    def __init__(self):
        self.recommender = crop_recommender

    async def get_crop_recommendations(
        self,
        nitrogen: float = 80.0,
        phosphorus: float = 40.0,
        potassium: float = 40.0,
        ph: float = 6.5,
        temperature: float = 25.0,
        humidity: float = 70.0,
        rainfall: float = 100.0,
        previous_crop: Optional[str] = None,
        water_availability: Optional[str] = "medium",
        field_area_acre: Optional[float] = None,
    ) -> Dict[str, Any]:
        # 1. Run ML inference with trained crop recommender
        ml_result = self.recommender.predict(
            nitrogen=nitrogen,
            phosphorus=phosphorus,
            potassium=potassium,
            temperature=temperature,
            humidity=humidity,
            ph=ph,
            rainfall=rainfall,
            top_k=4,
        )

        top_crops = ml_result.get("top_recommendations", [])

        # 2. Check crop rotation considerations
        rotation_notes = []
        if previous_crop:
            prev_lower = previous_crop.strip().lower()
            if prev_lower in {"chickpea", "mungbean", "blackgram", "lentil", "pigeonpeas", "beans"}:
                rotation_notes.append(
                    f"Previous crop was a legume ({previous_crop}). Soil has elevated organic nitrogen, making it ideal for cereals like maize, wheat, or high-demand vegetables."
                )
            elif prev_lower in {"tomato", "potato", "chilli", "brinjal"}:
                rotation_notes.append(
                    f"Previous crop was a solanaceous crop ({previous_crop}). Avoid planting tomato or potato in this cycle to mitigate bacterial wilt and nematode buildup."
                )

        # 3. Mixed cropping & intercropping suggestions
        primary = top_crops[0]["crop"] if top_crops else "tomato"
        intercrop_suggestions = [
            pair for pair in INTERCROP_PAIRS if pair["primary"] == primary or pair["companion"] == primary
        ]

        # 4. Warnings and caveats
        warnings = []
        if ph < 5.5:
            warnings.append("Soil is strongly acidic (pH < 5.5). Consider agricultural lime application before sensitive crops.")
        elif ph > 8.0:
            warnings.append("Soil is alkaline (pH > 8.0). Micronutrient availability (zinc, iron) may be compromised.")

        if water_availability in {"low", "rainfed"} and rainfall < 50:
            warnings.append("Water availability is constrained. Prioritize drought-hardy pulses or millets over water-intensive paddy/sugarcane.")

        return {
            "success": True,
            "ml_model_used": ml_result.get("model", "Rule-based fallback"),
            "model_confidence_available": top_crops and top_crops[0].get("confidence_pct") is not None,
            "recommendations": top_crops,
            "primary_recommendation": top_crops[0] if top_crops else None,
            "data_used": {
                "soil_npk": {"N": nitrogen, "P": phosphorus, "K": potassium, "pH": ph},
                "weather": {"temperature_c": temperature, "humidity_pct": humidity, "rainfall_mm": rainfall},
                "previous_crop": previous_crop,
                "water_availability": water_availability,
                "field_area_acre": field_area_acre,
            },
            "crop_rotation_considerations": rotation_notes,
            "intercropping_suggestions": intercrop_suggestions,
            "warnings": warnings,
            "disclaimer": "Predictions are algorithmic assessments based on historical agronomic datasets. Always verify with local Soil Health Card test results and agricultural extension officials.",
        }


recommendation_service = RecommendationService()
