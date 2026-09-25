import io
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from PIL import Image
import torch
import torch.nn as nn
from torchvision import transforms

logger = logging.getLogger("farmai.ml.disease_detector")

# PlantVillage 38-class mapping
DISEASE_CLASSES = [
    "Apple___Apple_scab",
    "Apple___Black_rot",
    "Apple___Cedar_apple_rust",
    "Apple___healthy",
    "Blueberry___healthy",
    "Cherry_(including_sour)___Powdery_mildew",
    "Cherry_(including_sour)___healthy",
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
    "Corn_(maize)___Common_rust_",
    "Corn_(maize)___Northern_Leaf_Blight",
    "Corn_(maize)___healthy",
    "Grape___Black_rot",
    "Grape___Esca_(Black_Measles)",
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)",
    "Grape___healthy",
    "Orange___Haunglongbing_(Citrus_greening)",
    "Peach___Bacterial_spot",
    "Peach___healthy",
    "Pepper,_bell___Bacterial_spot",
    "Pepper,_bell___healthy",
    "Potato___Early_blight",
    "Potato___Late_blight",
    "Potato___healthy",
    "Raspberry___healthy",
    "Soybean___healthy",
    "Squash___Powdery_mildew",
    "Strawberry___Leaf_scorch",
    "Strawberry___healthy",
    "Tomato___Bacterial_spot",
    "Tomato___Early_blight",
    "Tomato___Late_blight",
    "Tomato___Leaf_Mold",
    "Tomato___Septoria_leaf_spot",
    "Tomato___Spider_mites Two-spotted_spider_mite",
    "Tomato___Target_Spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "Tomato___Tomato_mosaic_virus",
    "Tomato___healthy",
]

DISEASE_INFO: Dict[str, Dict[str, Any]] = {
    "Apple___Apple_scab": {
        "display": "Apple Scab",
        "severity": "moderate",
        "actions": [
            "Apply fungicides such as captan or mancozeb at bud break",
            "Rake and destroy fallen leaves to reduce overwintering fungi",
            "Prune trees to improve sunlight penetration and air circulation",
        ],
    },
    "Apple___Black_rot": {
        "display": "Apple Black Rot",
        "severity": "high",
        "actions": [
            "Prune dead or diseased wood and mummified fruit",
            "Apply copper-based or sulfur-based fungicides",
            "Maintain overall tree health with balanced fertilization",
        ],
    },
    "Apple___Cedar_apple_rust": {
        "display": "Cedar Apple Rust",
        "severity": "moderate",
        "actions": [
            "Remove nearby eastern red cedar trees if practical",
            "Apply preventative fungicides (myclobutanil) from pink bud through petal fall",
            "Plant resistant apple cultivars",
        ],
    },
    "Apple___healthy": {
        "display": "Healthy Apple Leaf",
        "severity": "none",
        "actions": ["Continue standard preventive crop care and regular monitoring."],
    },
    "Corn_(maize)___Common_rust_": {
        "display": "Corn Common Rust",
        "severity": "moderate",
        "actions": [
            "Plant rust-resistant hybrids",
            "Apply registered foliar fungicides if disease develops early",
            "Avoid excessive nitrogen fertilization",
        ],
    },
    "Corn_(maize)___Northern_Leaf_Blight": {
        "display": "Northern Corn Leaf Blight",
        "severity": "high",
        "actions": [
            "Use resistant corn hybrids",
            "Practice crop rotation with non-host crops like soybean",
            "Apply fungicide if lesions appear on the ear leaf before tasseling",
        ],
    },
    "Corn_(maize)___healthy": {
        "display": "Healthy Corn Leaf",
        "severity": "none",
        "actions": ["Crop appears healthy. Maintain standard nutrient and irrigation scheduling."],
    },
    "Potato___Early_blight": {
        "display": "Potato Early Blight",
        "severity": "moderate",
        "actions": [
            "Apply fungicides such as chlorothalonil, mancozeb, or azoxystrobin",
            "Ensure adequate soil fertility, particularly nitrogen",
            "Avoid overhead irrigation to minimize leaf wetness",
            "Rotate crops for at least 2-3 years with non-solanaceous crops",
        ],
    },
    "Potato___Late_blight": {
        "display": "Potato Late Blight",
        "severity": "high",
        "actions": [
            "Immediately apply protective fungicides (mancozeb, cymoxanil, metalaxyl)",
            "Destroy infected foliage to protect tubers",
            "Ensure proper hill depth to prevent spore wash into tubers",
            "Consult local agricultural extension immediately",
        ],
    },
    "Potato___healthy": {
        "display": "Healthy Potato Leaf",
        "severity": "none",
        "actions": ["Foliage shows no signs of blight. Maintain regular scouting."],
    },
    "Tomato___Bacterial_spot": {
        "display": "Tomato Bacterial Spot",
        "severity": "high",
        "actions": [
            "Apply copper bactericide combined with mancozeb",
            "Avoid overhead watering; use drip irrigation",
            "Disinfect stakes and pruning tools between rows",
            "Remove and destroy severely infected lower leaves",
        ],
    },
    "Tomato___Early_blight": {
        "display": "Tomato Early Blight",
        "severity": "moderate",
        "actions": [
            "Apply protective fungicide (chlorothalonil or copper)",
            "Prune bottom 12 inches of leaves to prevent soil splash",
            "Mulch around the base of the plant",
            "Rotate crops away from tomatoes/potatoes for 2-3 years",
        ],
    },
    "Tomato___Late_blight": {
        "display": "Tomato Late Blight",
        "severity": "critical",
        "actions": [
            "Promptly apply systematic fungicide (metalaxyl or dimethomorph)",
            "Remove and destroy severely affected plants immediately",
            "Ensure plants have wide spacing for maximum airflow",
            "Seek guidance from local agronomist immediately",
        ],
    },
    "Tomato___Leaf_Mold": {
        "display": "Tomato Leaf Mold",
        "severity": "moderate",
        "actions": [
            "Improve greenhouse or field ventilation to lower relative humidity below 85%",
            "Apply copper fungicides or bio-fungicides",
            "Prune excess foliage to increase air movement",
        ],
    },
    "Tomato___Septoria_leaf_spot": {
        "display": "Tomato Septoria Leaf Spot",
        "severity": "moderate",
        "actions": [
            "Apply chlorothalonil, copper, or mancozeb at first sign",
            "Remove infected lower leaves to slow upward spread",
            "Keep foliage dry with drip irrigation",
        ],
    },
    "Tomato___Spider_mites Two-spotted_spider_mite": {
        "display": "Tomato Two-Spotted Spider Mite",
        "severity": "moderate",
        "actions": [
            "Apply neem oil or insecticidal soap spray",
            "Introduce predatory mites (Phytoseiulus persimilis) if feasible",
            "Avoid excessive dust and water stress on plants",
        ],
    },
    "Tomato___Target_Spot": {
        "display": "Tomato Target Spot",
        "severity": "moderate",
        "actions": [
            "Apply broad-spectrum fungicide (chlorothalonil or azoxystrobin)",
            "Remove diseased leaves and crop residues",
            "Ensure proper plant spacing for air circulation",
        ],
    },
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": {
        "display": "Tomato Yellow Leaf Curl Virus (TYLCV)",
        "severity": "critical",
        "actions": [
            "Control whitefly vectors using yellow sticky traps and imidacloprid / neem spray",
            "Rogue and bag infected plants immediately to prevent vector transmission",
            "Use reflective silver mulches to repel whiteflies",
        ],
    },
    "Tomato___Tomato_mosaic_virus": {
        "display": "Tomato Mosaic Virus (ToMV)",
        "severity": "high",
        "actions": [
            "Remove and incinerate infected plants immediately",
            "Disinfect all tools in 20% nonfat dry milk or bleach solution",
            "Do not smoke or use tobacco products near plants",
        ],
    },
    "Tomato___healthy": {
        "display": "Healthy Tomato Leaf",
        "severity": "none",
        "actions": ["No disease detected. Continue standard agronomic practices."],
    },
}

LOW_CONFIDENCE_THRESHOLD = 0.50


def conv_block(in_channels: int, out_channels: int, pool: bool = False) -> nn.Sequential:
    layers: List[nn.Module] = [
        nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
        nn.BatchNorm2d(out_channels),
        nn.ReLU(inplace=True),
    ]
    if pool:
        layers.append(nn.MaxPool2d(2))
    return nn.Sequential(*layers)


class ResNet9(nn.Module):
    """ResNet9 architecture matching trained PlantVillage weights."""

    def __init__(self, in_channels: int = 3, num_classes: int = 38):
        super().__init__()
        self.conv1 = conv_block(in_channels, 64)
        self.conv2 = conv_block(64, 128, pool=True)
        self.res1 = nn.Sequential(conv_block(128, 128), conv_block(128, 128))
        self.conv3 = conv_block(128, 256, pool=True)
        self.conv4 = conv_block(256, 512, pool=True)
        self.res2 = nn.Sequential(conv_block(512, 512), conv_block(512, 512))
        self.classifier = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(512, num_classes),
        )

    def forward(self, xb: torch.Tensor) -> torch.Tensor:
        out = self.conv1(xb)
        out = self.conv2(out)
        out = self.res1(out) + out
        out = self.conv3(out)
        out = self.conv4(out)
        out = self.res2(out) + out
        out = self.classifier(out)
        return out


class DiseaseDetector:
    """
    Disease detection service using PyTorch ResNet9 model trained on PlantVillage.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        path = Path(model_path or "./models/plant_disease_model.pth")
        if not path.is_file():
            backend_model = Path(__file__).resolve().parent.parent.parent.parent / "models" / "plant_disease_model.pth"
            if backend_model.is_file():
                path = backend_model
        self.model_path = path
        self.model: Optional[ResNet9] = None
        self._load_model()

    def _load_model(self) -> None:
        if not self.model_path.is_file():
            logger.warning(f"Disease model weights not found at {self.model_path}")
            return
        try:
            model = ResNet9(in_channels=3, num_classes=len(DISEASE_CLASSES))
            state = torch.load(str(self.model_path), map_location=self.device, weights_only=False)
            if isinstance(state, dict) and "state_dict" in state:
                state = state["state_dict"]
            elif isinstance(state, dict) and "model_state_dict" in state:
                state = state["model_state_dict"]
            model.load_state_dict(state, strict=True)
            model.to(self.device)
            model.eval()
            self.model = model
            logger.info(f"Loaded disease detection ResNet9 model from {self.model_path}")
        except Exception as e:
            logger.error(f"Failed to load disease detection model from {self.model_path}: {e}")

    @property
    def is_available(self) -> bool:
        return self.model is not None

    def get_status(self) -> Dict[str, Any]:
        return {
            "status": "loaded" if self.is_available else "unavailable",
            "framework": "PyTorch",
            "architecture": "ResNet9",
            "classes_count": len(DISEASE_CLASSES),
            "device": str(self.device),
        }

    def _preprocess(self, image_bytes: bytes) -> Optional[torch.Tensor]:
        try:
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            transform = transforms.Compose([
                transforms.Resize((256, 256)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
            return transform(img).unsqueeze(0)
        except Exception as e:
            logger.warning(f"Failed to preprocess image: {e}")
            return None

    def detect(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Executes disease diagnosis inference on input leaf image.
        Returns predicted disease, top-3 candidates, calibrated confidence, severity, and actions.
        """
        if not self.is_available:
            return {
                "success": False,
                "available": False,
                "error": "Disease detection model is not available.",
            }

        tensor = self._preprocess(image_bytes)
        if tensor is None:
            return {
                "success": False,
                "available": True,
                "error": "Could not decode or preprocess image. Please provide a valid JPEG or PNG file.",
            }

        try:
            tensor = tensor.to(self.device)
            with torch.no_grad():
                outputs = self.model(tensor)
                probs = torch.softmax(outputs, dim=1)
                confidence, pred_idx = torch.max(probs, dim=1)
                confidence_val = float(confidence.item())
                pred_class = DISEASE_CLASSES[pred_idx.item()]

                top3_probs, top3_idx = torch.topk(probs, min(3, len(DISEASE_CLASSES)), dim=1)
                top3 = [
                    {
                        "class": DISEASE_CLASSES[i.item()],
                        "confidence_pct": round(float(p.item()) * 100, 2),
                    }
                    for i, p in zip(top3_idx[0], top3_probs[0])
                ]

            is_low_confidence = confidence_val < LOW_CONFIDENCE_THRESHOLD
            info = DISEASE_INFO.get(pred_class, {
                "display": pred_class.replace("___", " — ").replace("_", " ").title(),
                "severity": "unknown",
                "actions": ["Consult a local agricultural extension officer or certified agronomist for diagnosis."],
            })
            is_healthy = "healthy" in pred_class.lower()

            return {
                "success": True,
                "available": True,
                "predicted_class": pred_class,
                "disease_name": info["display"],
                "confidence_pct": round(confidence_val * 100, 2),
                "severity": info["severity"],
                "is_healthy": is_healthy,
                "is_low_confidence": is_low_confidence,
                "requires_expert_review": is_low_confidence or (not is_healthy and info["severity"] in {"high", "critical"}),
                "recommended_actions": info["actions"],
                "top3_candidates": top3,
                "note": (
                    "Low confidence assessment; please submit a clear, well-lit close-up of the leaf."
                    if is_low_confidence
                    else "Automated computer vision assessment. Verify critical chemical applications with an agronomist."
                ),
            }
        except Exception as e:
            logger.exception("Inference error in disease detector")
            return {
                "success": False,
                "available": True,
                "error": f"Inference execution failed: {str(e)}",
            }


disease_detector = DiseaseDetector()
