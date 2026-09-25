import logging
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np

logger = logging.getLogger("farmai.ml.crop_recommender")

CROP_FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]

CROP_METADATA: Dict[str, Dict[str, Any]] = {
    "rice": {
        "display_name": "Rice (Paddy)",
        "water_req": "high",
        "season": "kharif",
        "duration_days": "120-150",
        "description": "High water-demanding cereal crop, optimal in clayey/loamy soil.",
        "soil_suitability": {"ph_min": 5.5, "ph_max": 7.5, "min_rainfall": 100},
    },
    "wheat": {
        "display_name": "Wheat",
        "water_req": "medium",
        "season": "rabi",
        "duration_days": "110-140",
        "description": "Key staple cereal requiring cool growing season and moderate water.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.5, "min_rainfall": 50},
    },
    "maize": {
        "display_name": "Maize (Corn)",
        "water_req": "medium",
        "season": "kharif/rabi",
        "duration_days": "80-100",
        "description": "Versatile cereal crop with moderate water requirement and high market utility.",
        "soil_suitability": {"ph_min": 5.8, "ph_max": 7.2, "min_rainfall": 50},
    },
    "cotton": {
        "display_name": "Cotton",
        "water_req": "medium",
        "season": "kharif",
        "duration_days": "150-180",
        "description": "Important commercial fibre crop, best suited for deep black soils.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 8.0, "min_rainfall": 50},
    },
    "chickpea": {
        "display_name": "Chickpea (Gram)",
        "water_req": "low",
        "season": "rabi",
        "duration_days": "90-120",
        "description": "Drought-tolerant leguminous pulse that enriches soil nitrogen.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 8.0, "min_rainfall": 30},
    },
    "kidneybeans": {
        "display_name": "Kidney Beans (Rajma)",
        "water_req": "medium",
        "season": "kharif/rabi",
        "duration_days": "90-120",
        "description": "High-protein pulse requiring well-drained fertile soil.",
        "soil_suitability": {"ph_min": 5.5, "ph_max": 6.5, "min_rainfall": 60},
    },
    "pigeonpeas": {
        "display_name": "Pigeonpeas (Arhar / Tur)",
        "water_req": "low",
        "season": "kharif",
        "duration_days": "150-200",
        "description": "Deep-rooted drought-resistant pulse crop, excellent for intercropping.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.5, "min_rainfall": 40},
    },
    "mothbeans": {
        "display_name": "Moth Beans",
        "water_req": "very_low",
        "season": "kharif",
        "duration_days": "60-75",
        "description": "Extremely drought-hardy legume suitable for arid/semi-arid regions.",
        "soil_suitability": {"ph_min": 6.5, "ph_max": 8.0, "min_rainfall": 20},
    },
    "mungbean": {
        "display_name": "Mungbean (Green Gram)",
        "water_req": "low",
        "season": "kharif/zaid",
        "duration_days": "60-70",
        "description": "Short-duration pulse ideal for crop rotation and soil revitalization.",
        "soil_suitability": {"ph_min": 6.2, "ph_max": 7.5, "min_rainfall": 30},
    },
    "blackgram": {
        "display_name": "Blackgram (Urad)",
        "water_req": "low",
        "season": "kharif/rabi",
        "duration_days": "70-90",
        "description": "Nutrient-dense legume that fixes atmospheric nitrogen.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.5, "min_rainfall": 35},
    },
    "lentil": {
        "display_name": "Lentil (Masoor)",
        "water_req": "low",
        "season": "rabi",
        "duration_days": "100-130",
        "description": "Cool-season legume with low water consumption.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.5, "min_rainfall": 25},
    },
    "pomegranate": {
        "display_name": "Pomegranate",
        "water_req": "low",
        "season": "perennial",
        "duration_days": "Perennial (150-180 d harvest cycle)",
        "description": "High-value fruit with good drought tolerance and export demand.",
        "soil_suitability": {"ph_min": 5.5, "ph_max": 7.5, "min_rainfall": 30},
    },
    "banana": {
        "display_name": "Banana",
        "water_req": "high",
        "season": "year-round",
        "duration_days": "300-365",
        "description": "Heavy feeder requiring rich organic soil and constant moisture.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.5, "min_rainfall": 100},
    },
    "mango": {
        "display_name": "Mango",
        "water_req": "medium",
        "season": "perennial",
        "duration_days": "Perennial (summer harvest)",
        "description": "King of fruits; thrives in deep well-drained tropical and subtropical soils.",
        "soil_suitability": {"ph_min": 5.5, "ph_max": 7.5, "min_rainfall": 50},
    },
    "grapes": {
        "display_name": "Grapes",
        "water_req": "medium",
        "season": "perennial",
        "duration_days": "Perennial (120-150 d harvest cycle)",
        "description": "Commercial fruit crop suited to warm, dry summers and mild winters.",
        "soil_suitability": {"ph_min": 6.5, "ph_max": 7.5, "min_rainfall": 40},
    },
    "watermelon": {
        "display_name": "Watermelon",
        "water_req": "medium",
        "season": "zaid/summer",
        "duration_days": "75-90",
        "description": "Warm-season crop requiring well-drained sandy loam soil.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.0, "min_rainfall": 35},
    },
    "muskmelon": {
        "display_name": "Muskmelon",
        "water_req": "medium",
        "season": "zaid/summer",
        "duration_days": "75-90",
        "description": "Commercial melon requiring high temperatures and moderate irrigation.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.0, "min_rainfall": 30},
    },
    "apple": {
        "display_name": "Apple",
        "water_req": "medium",
        "season": "temperate",
        "duration_days": "Perennial",
        "description": "Temperate tree fruit requiring chilling hours.",
        "soil_suitability": {"ph_min": 5.5, "ph_max": 6.5, "min_rainfall": 80},
    },
    "orange": {
        "display_name": "Orange (Citrus)",
        "water_req": "medium",
        "season": "subtropical",
        "duration_days": "Perennial",
        "description": "Citrus fruit requiring well-drained loam and subtropical climate.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.5, "min_rainfall": 50},
    },
    "papaya": {
        "display_name": "Papaya",
        "water_req": "medium",
        "season": "tropical",
        "duration_days": "270-360",
        "description": "Fast-growing tropical fruit requiring well-drained fertile soil.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.0, "min_rainfall": 70},
    },
    "coconut": {
        "display_name": "Coconut",
        "water_req": "high",
        "season": "perennial",
        "duration_days": "Perennial",
        "description": "Coastal tropical palm requiring humid climate and high water table.",
        "soil_suitability": {"ph_min": 5.2, "ph_max": 8.0, "min_rainfall": 120},
    },
    "jute": {
        "display_name": "Jute",
        "water_req": "high",
        "season": "kharif",
        "duration_days": "120-150",
        "description": "Natural fibre crop thriving in warm humid climate and alluvial soil.",
        "soil_suitability": {"ph_min": 6.0, "ph_max": 7.5, "min_rainfall": 120},
    },
    "coffee": {
        "display_name": "Coffee",
        "water_req": "high",
        "season": "perennial",
        "duration_days": "Perennial",
        "description": "Plantation shade crop requiring rich organic forest soil and high rainfall.",
        "soil_suitability": {"ph_min": 5.0, "ph_max": 6.5, "min_rainfall": 150},
    },
}


class CropRecommender:
    """
    Crop Recommendation Service using trained ML models with feature verification.
    """

    def __init__(self, model_dir: str = "./models"):
        path = Path(model_dir)
        if not path.is_dir():
            backend_models = Path(__file__).resolve().parent.parent.parent.parent / "models"
            if backend_models.is_dir():
                path = backend_models
        self.model_dir = path
        self.model: Optional[Any] = None
        self.model_name: Optional[str] = None
        self.classes: List[str] = []
        self._load_best_model()

    def _load_best_model(self) -> None:
        """
        Loads the best compatible classifier from the models directory.
        Prioritizes LogisticRegression (saved as DecisionTree.pkl) and GaussianNB (NBClassifier.pkl).
        """
        candidates = [
            ("DecisionTree.pkl", "LogisticRegression"),
            ("NBClassifier.pkl", "GaussianNB"),
            ("SVMClassifier.pkl", "SVC"),
        ]

        for filename, model_type in candidates:
            path = self.model_dir / filename
            if not path.is_file():
                continue
            try:
                with open(path, "rb") as f:
                    loaded = pickle.load(f)

                # Fix sklearn version backward-compatibility for GaussianNB
                if hasattr(loaded, "sigma_") and not hasattr(loaded, "var_"):
                    loaded.var_ = loaded.sigma_

                # Verify interface
                if hasattr(loaded, "predict") and hasattr(loaded, "classes_"):
                    self.model = loaded
                    self.model_name = f"{filename} ({model_type})"
                    self.classes = list(loaded.classes_)
                    logger.info(f"Loaded crop recommendation model: {self.model_name} with {len(self.classes)} classes")
                    return
            except Exception as e:
                logger.warning(f"Could not load candidate model {filename}: {e}")

        logger.warning("No pre-trained crop recommendation model could be loaded.")

    @property
    def is_available(self) -> bool:
        return self.model is not None

    def get_status(self) -> Dict[str, Any]:
        return {
            "status": "loaded" if self.is_available else "unavailable",
            "model_name": self.model_name,
            "feature_names": CROP_FEATURES,
            "classes_count": len(self.classes),
            "classes": self.classes[:10],
        }

    def predict(
        self,
        nitrogen: float,
        phosphorus: float,
        potassium: float,
        temperature: float,
        humidity: float,
        ph: float,
        rainfall: float,
        top_k: int = 3,
    ) -> Dict[str, Any]:
        """
        Runs ML inference given the 7 agricultural parameters.
        Returns top_k recommendations with calibrated probabilities and agronomic details.
        """
        if not self.is_available:
            return {
                "success": False,
                "available": False,
                "error": "Crop recommendation ML model is not available.",
            }

        features = np.array([[nitrogen, phosphorus, potassium, temperature, humidity, ph, rainfall]], dtype=float)

        try:
            if hasattr(self.model, "predict_proba"):
                probs = self.model.predict_proba(features)[0]
                top_indices = np.argsort(probs)[::-1][:top_k]
                predictions = []
                for idx in top_indices:
                    crop_key = str(self.classes[idx]).lower()
                    meta = CROP_METADATA.get(crop_key, {})
                    confidence = round(float(probs[idx]) * 100, 2)
                    predictions.append({
                        "crop": crop_key,
                        "display_name": meta.get("display_name", crop_key.capitalize()),
                        "confidence_pct": confidence,
                        "water_requirement": meta.get("water_req", "medium"),
                        "season": meta.get("season", "general"),
                        "duration_days": meta.get("duration_days", "unknown"),
                        "description": meta.get("description", ""),
                    })
            else:
                pred_label = str(self.model.predict(features)[0]).lower()
                meta = CROP_METADATA.get(pred_label, {})
                predictions = [{
                    "crop": pred_label,
                    "display_name": meta.get("display_name", pred_label.capitalize()),
                    "confidence_pct": None,
                    "water_requirement": meta.get("water_req", "medium"),
                    "season": meta.get("season", "general"),
                    "duration_days": meta.get("duration_days", "unknown"),
                    "description": meta.get("description", ""),
                }]

            primary_crop = predictions[0]["crop"] if predictions else None

            return {
                "success": True,
                "available": True,
                "model": self.model_name,
                "primary_recommendation": primary_crop,
                "top_recommendations": predictions,
                "input_features": {
                    "N": nitrogen,
                    "P": phosphorus,
                    "K": potassium,
                    "temperature": temperature,
                    "humidity": humidity,
                    "ph": ph,
                    "rainfall": rainfall,
                },
            }
        except Exception as e:
            logger.exception("Inference failed in crop recommender")
            return {
                "success": False,
                "available": True,
                "error": f"Prediction inference error: {str(e)}",
            }


crop_recommender = CropRecommender()
