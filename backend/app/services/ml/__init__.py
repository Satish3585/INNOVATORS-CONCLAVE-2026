"""
Machine Learning services for FarmAI.
Exposes ModelRegistry, CropRecommender, and DiseaseDetector.
"""

from app.services.ml.model_registry import ModelRegistry, model_registry
from app.services.ml.crop_recommender import CropRecommender, crop_recommender
from app.services.ml.disease_detector import DiseaseDetector, disease_detector

__all__ = [
    "ModelRegistry",
    "model_registry",
    "CropRecommender",
    "crop_recommender",
    "DiseaseDetector",
    "disease_detector",
]
