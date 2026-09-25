import logging
from typing import Any, Dict
from app.services.ml.crop_recommender import crop_recommender
from app.services.ml.disease_detector import disease_detector

logger = logging.getLogger("farmai.ml.model_registry")


class ModelRegistry:
    """
    Central registry for managing, caching, and monitoring all machine learning services.
    """

    def __init__(self):
        self._crop_recommender = crop_recommender
        self._disease_detector = disease_detector

    @property
    def crop_recommender(self):
        return self._crop_recommender

    @property
    def disease_detector(self):
        return self._disease_detector

    def get_health_status(self) -> Dict[str, Any]:
        """
        Returns health and configuration status of all registered ML models.
        Safe for public health checks (no secret paths or private filesystem data).
        """
        return {
            "crop_recommendation": self._crop_recommender.get_status(),
            "disease_detection": self._disease_detector.get_status(),
            "registry_status": "operational",
        }


model_registry = ModelRegistry()
