import io
import logging
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from app.services.ai_service import ai_service

logger = logging.getLogger("farmai.services.soil")

# Agronomic optimal ranges (Indian Agriculture / ICAR / Global standard benchmarks)
SOIL_BENCHMARKS = {
    "ph": {
        "unit": "",
        "strongly_acidic": (0.0, 5.5),
        "moderately_acidic": (5.5, 6.5),
        "neutral_optimal": (6.5, 7.5),
        "moderately_alkaline": (7.5, 8.5),
        "strongly_alkaline": (8.5, 14.0),
    },
    "nitrogen": {  # Available N in kg/ha
        "unit": "kg/ha",
        "low": (0, 280),
        "medium": (280, 560),
        "high": (560, 2000),
    },
    "phosphorus": {  # Available P2O5 in kg/ha
        "unit": "kg/ha",
        "low": (0, 10),
        "medium": (10, 25),
        "high": (25, 200),
    },
    "potassium": {  # Available K2O in kg/ha
        "unit": "kg/ha",
        "low": (0, 110),
        "medium": (110, 280),
        "high": (280, 1500),
    },
    "organic_carbon": {  # % Organic Carbon
        "unit": "%",
        "low": (0.0, 0.50),
        "medium": (0.50, 0.75),
        "high": (0.75, 10.0),
    },
    "electrical_conductivity": {  # dS/m (1:2 soil water suspension)
        "unit": "dS/m",
        "normal": (0.0, 1.0),
        "critical_for_salt_sensitive": (1.0, 2.0),
        "saline_stress": (2.0, 4.0),
        "severely_saline": (4.0, 50.0),
    },
}

CROP_SOIL_PREFERENCES = {
    "tomato": {"optimal_ph": (6.0, 7.0), "n_demand": "high", "p_demand": "medium", "k_demand": "high", "ec_tolerance": 2.0},
    "potato": {"optimal_ph": (5.2, 6.5), "n_demand": "high", "p_demand": "high", "k_demand": "high", "ec_tolerance": 1.7},
    "chilli": {"optimal_ph": (6.0, 7.0), "n_demand": "medium", "p_demand": "medium", "k_demand": "medium", "ec_tolerance": 1.8},
    "rice": {"optimal_ph": (5.5, 7.0), "n_demand": "high", "p_demand": "medium", "k_demand": "medium", "ec_tolerance": 3.0},
    "wheat": {"optimal_ph": (6.0, 7.5), "n_demand": "high", "p_demand": "medium", "k_demand": "medium", "ec_tolerance": 3.5},
    "maize": {"optimal_ph": (5.8, 7.2), "n_demand": "high", "p_demand": "medium", "k_demand": "high", "ec_tolerance": 2.5},
    "cotton": {"optimal_ph": (6.0, 8.0), "n_demand": "high", "p_demand": "medium", "k_demand": "high", "ec_tolerance": 4.0},
    "onion": {"optimal_ph": (6.0, 7.0), "n_demand": "medium", "p_demand": "medium", "k_demand": "high", "ec_tolerance": 1.5},
    "chickpea": {"optimal_ph": (6.0, 8.0), "n_demand": "low", "p_demand": "medium", "k_demand": "medium", "ec_tolerance": 2.0},
    "soybean": {"optimal_ph": (6.0, 7.0), "n_demand": "low", "p_demand": "medium", "k_demand": "medium", "ec_tolerance": 2.5},
}


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extracts raw text from PDF document using pypdf."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text = []
        for i, page in enumerate(reader.pages):
            txt = page.extract_text() or ""
            pages_text.append(txt)
        return "\n".join(pages_text)
    except Exception as e:
        logger.warning(f"Failed to extract text with pypdf: {e}")
        return ""


def parse_soil_parameters(raw_text: str) -> Dict[str, Any]:
    """
    Parses agricultural laboratory report values from document text using regex heuristics.
    Covers Indian Soil Health Card (SHC) and agricultural lab formats.
    """
    extracted: Dict[str, Any] = {}
    found_fields: List[str] = []

    text_lower = raw_text.lower()

    # 1. Soil pH (0-14)
    # Matches patterns like "pH: 6.8", "pH (1:2) = 7.2", "Soil pH 6.5"
    ph_match = re.search(r"(?:soil\s*)?ph\s*(?:\([^)]*\))?\s*[:=–-]?\s*([0-9]{1,2}(?:\.[0-9]{1,2})?)", text_lower)
    if ph_match:
        try:
            val = float(ph_match.group(1))
            if 0.0 <= val <= 14.0:
                extracted["ph"] = val
                found_fields.append("ph")
        except ValueError:
            pass

    # 2. Electrical Conductivity (EC in dS/m or mS/cm)
    ec_match = re.search(r"(?:electrical\s*conductivity|e\.?c\.?)\s*(?:\([^)]*\))?\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:ds\/m|ms\/cm|mmhos\/cm)?", text_lower)
    if ec_match:
        try:
            val = float(ec_match.group(1))
            if 0.0 <= val <= 30.0:
                extracted["electrical_conductivity"] = val
                found_fields.append("electrical_conductivity")
        except ValueError:
            pass

    # 3. Organic Carbon (OC in %)
    oc_match = re.search(r"(?:organic\s*carbon|o\.?c\.?)\s*(?:\([^)]*\))?\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)\s*%?", text_lower)
    if oc_match:
        try:
            val = float(oc_match.group(1))
            if 0.0 <= val <= 10.0:
                extracted["organic_carbon"] = val
                found_fields.append("organic_carbon")
        except ValueError:
            pass

    # 4. Available Nitrogen (N) (kg/ha or ppm)
    n_match = re.search(r"(?:available\s*)?(?:nitrogen|n)\s*(?:\([^)]*\))?\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kg\/ha|ppm|mg\/kg)?", text_lower)
    if n_match:
        try:
            val = float(n_match.group(1))
            if 5.0 <= val <= 1500.0:
                extracted["nitrogen"] = val
                found_fields.append("nitrogen")
        except ValueError:
            pass

    # 5. Available Phosphorus (P / P2O5) (kg/ha or ppm)
    p_match = re.search(r"(?:available\s*)?(?:phosphorus|phosphate|p2o5|p)\s*(?:\([^)]*\))?\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kg\/ha|ppm|mg\/kg)?", text_lower)
    if p_match:
        try:
            val = float(p_match.group(1))
            if 0.5 <= val <= 500.0:
                extracted["phosphorus"] = val
                found_fields.append("phosphorus")
        except ValueError:
            pass

    # 6. Available Potassium (K / K2O) (kg/ha or ppm)
    k_match = re.search(r"(?:available\s*)?(?:potassium|potash|k2o|k)\s*(?:\([^)]*\))?\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kg\/ha|ppm|mg\/kg)?", text_lower)
    if k_match:
        try:
            val = float(k_match.group(1))
            if 5.0 <= val <= 2000.0:
                extracted["potassium"] = val
                found_fields.append("potassium")
        except ValueError:
            pass

    # 7. Soil Moisture (%)
    moist_match = re.search(r"(?:soil\s*)?moisture\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)\s*%?", text_lower)
    if moist_match:
        try:
            val = float(moist_match.group(1))
            if 0.0 <= val <= 100.0:
                extracted["moisture_percentage"] = val
                found_fields.append("moisture_percentage")
        except ValueError:
            pass

    # 8. Micronutrients: Sulfur, Zinc, Iron (ppm)
    s_match = re.search(r"(?:available\s*)?(?:sulphur|sulfur|s)\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)", text_lower)
    if s_match:
        try:
            extracted["sulfur"] = float(s_match.group(1))
            found_fields.append("sulfur")
        except ValueError:
            pass

    zn_match = re.search(r"(?:zinc|zn)\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)", text_lower)
    if zn_match:
        try:
            extracted["zinc"] = float(zn_match.group(1))
            found_fields.append("zinc")
        except ValueError:
            pass

    fe_match = re.search(r"(?:iron|fe)\s*[:=–-]?\s*([0-9]+(?:\.[0-9]+)?)", text_lower)
    if fe_match:
        try:
            extracted["iron"] = float(fe_match.group(1))
            found_fields.append("iron")
        except ValueError:
            pass

    # 9. Test Date
    date_match = re.search(r"(?:date\s*(?:of\s*test)?|test\s*date|sampling\s*date)\s*[:=–-]?\s*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})", text_lower)
    if date_match:
        d_str = date_match.group(1).replace("/", "-")
        parts = d_str.split("-")
        try:
            if len(parts[0]) == 4:
                extracted["test_date"] = f"{int(parts[0]):04d}-{int(parts[1]):02d}-{int(parts[2]):02d}"
            else:
                extracted["test_date"] = f"{int(parts[2]):04d}-{int(parts[1]):02d}-{int(parts[0]):02d}"
            found_fields.append("test_date")
        except Exception:
            pass

    # 10. Soil Type keywords
    soil_types = ["clay", "sandy loam", "clay loam", "red loam", "black cotton", "alluvial", "laterite", "silt loam"]
    for st in soil_types:
        if st in text_lower:
            extracted["soil_type"] = st.title()
            found_fields.append("soil_type")
            break

    return {
        "extracted_values": extracted,
        "fields_found": found_fields,
        "found_count": len(found_fields),
        "text_length": len(raw_text),
        "snippet": raw_text[:500].strip() if raw_text else "",
    }


def extract_soil_report(file_bytes: bytes, filename: str, content_type: str) -> Dict[str, Any]:
    """
    Reads and extracts soil information from uploaded PDF or image report.
    Returns extracted parameters along with raw preview to allow farmer review and editing.
    """
    is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf")
    raw_text = ""

    if is_pdf:
        raw_text = extract_text_from_pdf(file_bytes)

    if not raw_text:
        # For images or scanned documents without OCR text
        return {
            "status": "manual_entry_required",
            "message": "Uploaded report file is stored safely. Embedded digital text was not detected; please review the file and verify or enter the parameters below.",
            "extracted_values": {
                "ph": None,
                "nitrogen": None,
                "phosphorus": None,
                "potassium": None,
                "electrical_conductivity": None,
                "organic_carbon": None,
                "moisture_percentage": None,
                "test_date": date.today().isoformat(),
                "test_source": "lab_report",
            },
            "fields_found": [],
            "preview_snippet": None,
            "filename": filename,
        }

    parsed = parse_soil_parameters(raw_text)
    vals = parsed["extracted_values"]

    return {
        "status": "extracted" if parsed["found_count"] > 0 else "partial_text_found",
        "message": (
            f"Successfully parsed {parsed['found_count']} parameters from the report. Please review, edit if necessary, and confirm before saving."
            if parsed["found_count"] > 0
            else "Report text was read, but standard parameters were not automatically recognized. Please enter the values from your document."
        ),
        "extracted_values": {
            "ph": vals.get("ph"),
            "nitrogen": vals.get("nitrogen"),
            "phosphorus": vals.get("phosphorus"),
            "potassium": vals.get("potassium"),
            "electrical_conductivity": vals.get("electrical_conductivity"),
            "organic_carbon": vals.get("organic_carbon"),
            "moisture_percentage": vals.get("moisture_percentage"),
            "sulfur": vals.get("sulfur"),
            "zinc": vals.get("zinc"),
            "iron": vals.get("iron"),
            "soil_type": vals.get("soil_type"),
            "test_date": vals.get("test_date") or date.today().isoformat(),
            "test_source": "lab_report",
        },
        "fields_found": parsed["fields_found"],
        "preview_snippet": parsed["snippet"],
        "filename": filename,
    }


def generate_soil_explanation(
    soil_data: Dict[str, Any],
    crop_name: Optional[str] = None,
    growth_stage: Optional[str] = None,
    previous_crop: Optional[str] = None,
    field_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates an authoritative, farmer-friendly explanation of soil health parameters:
    - Soil pH (meaning, crop suitability, implications, remediation)
    - Nitrogen (meaning, vegetative growth, deficiency/excess)
    - Phosphorus (meaning, root growth, flowering)
    - Potassium (meaning, stress resilience, fruit filling)
    - Organic Carbon (microbial life, water retention)
    - Electrical Conductivity (salinity risk)
    Considers selected crop, stage, and previous crop.
    """
    crop_key = (crop_name or "").strip().lower()
    crop_pref = CROP_SOIL_PREFERENCES.get(crop_key)

    explanations: Dict[str, Any] = {}
    recommendations: List[str] = []
    deficiency_alerts: List[str] = []
    strengths: List[str] = []

    # 1. Soil pH Explanation
    ph = soil_data.get("ph")
    if ph is not None:
        ph_val = float(ph)
        if ph_val < 5.5:
            ph_status = "Strongly Acidic"
            ph_meaning = "Soil is strongly acidic. Phosphorus becomes fixed and unavailable to roots, while aluminium/manganese toxicity may develop."
            remedy = "Apply agricultural lime (calcium carbonate) or dolomite at 1.5–2.5 tonnes/ha according to local soil buffering capacity."
            recommendations.append(remedy)
            deficiency_alerts.append(f"Low pH ({ph_val}) restricts phosphorus and calcium uptake.")
        elif 5.5 <= ph_val < 6.5:
            ph_status = "Moderately Acidic"
            ph_meaning = "Slightly acidic soil. Suitable for potatoes, tea, and paddy, but most pulses and vegetables prefer higher pH."
            remedy = "Incorporate well-rotted organic compost and light liming if growing sensitive pulses."
            recommendations.append(remedy)
        elif 6.5 <= ph_val <= 7.5:
            ph_status = "Neutral (Optimal)"
            ph_meaning = "Ideal neutral range. Most essential plant nutrients (N, P, K, Ca, Mg, S) are at maximum bioavailability."
            strengths.append(f"Optimal soil pH ({ph_val}) provides ideal nutrient uptake for almost all crops.")
        elif 7.5 < ph_val <= 8.5:
            ph_status = "Moderately Alkaline"
            ph_meaning = "Soil is moderately alkaline. Micronutrients like zinc, iron, and boron become less soluble and harder for roots to absorb."
            remedy = "Incorporate organic matter, green manure (Dhaincha), and apply zinc sulfate / iron chelate to prevent chlorosis."
            recommendations.append(remedy)
            deficiency_alerts.append(f"Alkaline pH ({ph_val}) risks zinc and iron deficiency.")
        else:
            ph_status = "Strongly Alkaline / Sodic"
            ph_meaning = "Soil is strongly alkaline/sodic. High sodium causes soil dispersion, poor drainage, and severe root toxicity."
            remedy = "Apply agricultural gypsum based on gypsum requirement test, followed by good drainage leaching."
            recommendations.append(remedy)
            deficiency_alerts.append(f"Severe alkalinity ({ph_val}) requires gypsum application and drainage.")

        crop_ph_suitability = "Neutral suitability"
        if crop_pref:
            opt_min, opt_max = crop_pref["optimal_ph"]
            if opt_min <= ph_val <= opt_max:
                crop_ph_suitability = f"Perfect for {crop_name.title()} (ideal range: {opt_min}–{opt_max})."
            elif ph_val < opt_min:
                crop_ph_suitability = f"Below optimal range for {crop_name.title()} ({opt_min}–{opt_max})."
            else:
                crop_ph_suitability = f"Above optimal range for {crop_name.title()} ({opt_min}–{opt_max})."

        explanations["ph"] = {
            "value": ph_val,
            "status": ph_status,
            "meaning": ph_meaning,
            "crop_suitability": crop_ph_suitability,
        }

    # 2. Nitrogen (N) Explanation
    n = soil_data.get("nitrogen")
    if n is not None:
        n_val = float(n)
        if n_val < 280:
            n_status = "Low"
            n_meaning = "Low available nitrogen. Nitrogen is the fundamental driver of vegetative growth, leaf formation, and chlorophyll synthesis."
            n_implications = "Risk of stunted growth, pale yellowing of older lower leaves (chlorosis), and early leaf drop."
            n_action = "Apply basal nitrogen through compost/FYM combined with split doses of neem-coated urea or organic vermicompost."
            deficiency_alerts.append(f"Low available nitrogen ({n_val} kg/ha). Top-dressing recommended during vegetative stage.")
            recommendations.append(n_action)
        elif 280 <= n_val <= 560:
            n_status = "Medium (Adequate)"
            n_meaning = "Moderate available nitrogen sufficient for baseline vegetative biomass."
            n_implications = "Supports normal leaf development. Supplement with balanced split doses at flowering."
            n_action = "Maintain regular crop-stage feeding; avoid excessive single applications."
            strengths.append(f"Healthy baseline nitrogen ({n_val} kg/ha).")
        else:
            n_status = "High"
            n_meaning = "High available nitrogen level in soil."
            n_implications = "Risk of excessive vegetative foliage, delayed flowering, weak stems prone to lodging, and higher pest attraction."
            n_action = "Reduce chemical nitrogen fertilizers. Balance with potassium and phosphorus."
            recommendations.append(n_action)

        explanations["nitrogen"] = {
            "value": n_val,
            "unit": "kg/ha",
            "status": n_status,
            "meaning": n_meaning,
            "implications": n_implications,
        }

    # 3. Phosphorus (P) Explanation
    p = soil_data.get("phosphorus")
    if p is not None:
        p_val = float(p)
        if p_val < 10:
            p_status = "Low"
            p_meaning = "Low available phosphorus. Phosphorus is vital for vigorous root establishment, energy transfer (ATP), and fruit/flower setting."
            p_implications = "Shallow stunted root systems, purplish discoloration along older leaf margins, delayed maturity."
            p_action = "Apply Single Super Phosphate (SSP) or rock phosphate as basal application near root zone with organic manure to reduce fixation."
            deficiency_alerts.append(f"Low phosphorus ({p_val} kg/ha). Root development may be hindered.")
            recommendations.append(p_action)
        elif 10 <= p_val <= 25:
            p_status = "Medium (Adequate)"
            p_meaning = "Adequate phosphorus for steady root growth and flowering."
            p_implications = "Sufficient for normal crop development."
            p_action = "Standard maintenance dose at sowing or transplanting."
            strengths.append(f"Good available phosphorus ({p_val} kg/ha).")
        else:
            p_status = "High"
            p_meaning = "Rich phosphorus reserve in soil."
            p_implications = "Strong root growth. High P can occasionally interfere with zinc and iron uptake."
            p_action = "No additional synthetic phosphorus required this season."

        explanations["phosphorus"] = {
            "value": p_val,
            "unit": "kg/ha",
            "status": p_status,
            "meaning": p_meaning,
            "implications": p_implications,
        }

    # 4. Potassium (K) Explanation
    k = soil_data.get("potassium")
    if k is not None:
        k_val = float(k)
        if k_val < 110:
            k_status = "Low"
            k_meaning = "Low available potassium. Potassium regulates stomatal water balance, starch synthesis, and disease defense."
            k_implications = "Marginal leaf firing/scorching, poor resistance to drought and fungal pathogens, small unmarketable fruits."
            k_action = "Apply Muriate of Potash (MOP) or Sulfate of Potash (SOP) particularly heading into flowering and fruit filling."
            deficiency_alerts.append(f"Low potassium ({k_val} kg/ha). Plants may be vulnerable to drought and leaf scorch.")
            recommendations.append(k_action)
        elif 110 <= k_val <= 280:
            k_status = "Medium (Adequate)"
            k_meaning = "Balanced potassium reserves supporting normal stress resistance and fruit quality."
            k_implications = "Normal stomatal function and grain/fruit filling."
            k_action = "Apply standard maintenance dose during active fruit sizing."
            strengths.append(f"Adequate potassium ({k_val} kg/ha).")
        else:
            k_status = "High"
            k_meaning = "Abundant potassium in soil."
            k_implications = "Excellent disease and drought resilience."
            k_action = "Reduce or omit synthetic potash."

        explanations["potassium"] = {
            "value": k_val,
            "unit": "kg/ha",
            "status": k_status,
            "meaning": k_meaning,
            "implications": k_implications,
        }

    # 5. Organic Carbon (OC) Explanation
    oc = soil_data.get("organic_carbon")
    if oc is not None:
        oc_val = float(oc)
        if oc_val < 0.50:
            oc_status = "Low"
            oc_meaning = "Low organic carbon. Organic matter is the lifeblood of living soil, powering microbial activity and water holding capacity."
            oc_implications = "Soil may compact easily, dry out rapidly, and leach applied chemical fertilizers."
            oc_action = "Incorporate 5–10 tonnes/ha Farm Yard Manure (FYM), vermicompost, or sow green manure crops (Dhaincha/Sunn hemp)."
            deficiency_alerts.append(f"Low Organic Carbon ({oc_val}%). Soil biological vitality needs enrichment.")
            recommendations.append(oc_action)
        elif 0.50 <= oc_val <= 0.75:
            oc_status = "Medium"
            oc_meaning = "Moderate organic matter level supporting baseline soil flora and aeration."
            oc_implications = "Decent moisture retention and microbial activity."
            oc_action = "Regular mulching and annual compost top-up to build humus."
        else:
            oc_status = "High (Optimal)"
            oc_meaning = "High organic carbon indicating rich microbial vitality, high water holding, and superior fertilizer efficiency."
            oc_implications = "Excellent living soil buffer against drought and nutrient loss."
            oc_action = "Maintain organic practices and minimal tillage."
            strengths.append(f"High Organic Carbon ({oc_val}%) provides excellent living soil biology.")

        explanations["organic_carbon"] = {
            "value": oc_val,
            "unit": "%",
            "status": oc_status,
            "meaning": oc_meaning,
        }

    # 6. Electrical Conductivity (EC) Explanation
    ec = soil_data.get("electrical_conductivity")
    if ec is not None:
        ec_val = float(ec)
        if ec_val < 1.0:
            ec_status = "Normal (Non-Saline)"
            ec_meaning = "Electrical conductivity is normal. Soil salinity is safe; roots can absorb moisture without osmotic salt stress."
            strengths.append(f"Low salinity (EC {ec_val} dS/m) allows uninhibited root water absorption.")
        elif 1.0 <= ec_val <= 2.0:
            ec_status = "Slightly Saline"
            ec_meaning = "Slightly elevated salts. Sensitive seedlings and vegetables may show slight osmotic stress."
            recommendations.append("Ensure irrigation water is tested for salinity and maintain deep flushing drainage.")
        else:
            ec_status = "Saline Stress"
            ec_meaning = "High salinity. Dissolved salts create high osmotic pressure, preventing roots from drinking water even in moist soil."
            deficiency_alerts.append(f"High soil salinity (EC {ec_val} dS/m). Risk of salt burn and stunted germination.")
            recommendations.append("Flush field with fresh drainage water and avoid chloride-based fertilizers like MOP.")

        explanations["electrical_conductivity"] = {
            "value": ec_val,
            "unit": "dS/m",
            "status": ec_status,
            "meaning": ec_meaning,
        }

    # Growth stage and crop context integration
    context_notes = []
    if crop_name:
        context_notes.append(f"Analysis tailored for {crop_name.title()}{f' at {growth_stage}' if growth_stage else ''}.")
    if previous_crop:
        prev_lower = previous_crop.strip().lower()
        if prev_lower in {"chickpea", "mungbean", "blackgram", "lentil", "beans", "soybean", "pigeonpeas"}:
            context_notes.append(f"Previous crop was a legume ({previous_crop.title()}), which contributed natural root-nodule nitrogen reserves to this plot.")
        elif prev_lower in {"tomato", "potato", "chilli", "brinjal"}:
            context_notes.append(f"Previous crop was solanaceous ({previous_crop.title()}); monitor soil for carry-over fungal spores and nematodes.")

    # Determine Overall Soil Health Rating
    if len(deficiency_alerts) == 0:
        overall_health = "Excellent"
    elif len(deficiency_alerts) <= 2:
        overall_health = "Good — Minor Attention Needed"
    else:
        overall_health = "Action Required"

    return {
        "overall_health": overall_health,
        "parameters": explanations,
        "strengths": strengths,
        "deficiency_alerts": deficiency_alerts,
        "actionable_recommendations": recommendations,
        "context_notes": context_notes,
        "crop_evaluated": crop_name,
        "growth_stage": growth_stage,
        "generated_at": datetime.now().isoformat(),
    }


def compare_soil_tests(tests: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compares historical soil test records chronologically to detect trends in pH, N, P, K.
    """
    if not tests:
        return {"comparison_available": False, "message": "No previous tests found for comparison."}

    sorted_tests = sorted(tests, key=lambda t: str(t.get("test_date") or t.get("created_at") or ""), reverse=False)
    if len(sorted_tests) < 2:
        return {
            "comparison_available": False,
            "test_count": len(sorted_tests),
            "message": "At least 2 soil tests are required to show trends.",
            "latest_test": sorted_tests[-1] if sorted_tests else None,
        }

    first = sorted_tests[0]
    latest = sorted_tests[-1]

    trends = {}
    for metric, unit in [("ph", ""), ("nitrogen", "kg/ha"), ("phosphorus", "kg/ha"), ("potassium", "kg/ha"), ("organic_carbon", "%"), ("electrical_conductivity", "dS/m")]:
        old_val = first.get(metric)
        new_val = latest.get(metric)
        if old_val is not None and new_val is not None:
            diff = round(float(new_val) - float(old_val), 2)
            direction = "increased" if diff > 0 else "decreased" if diff < 0 else "stable"
            trends[metric] = {
                "initial_value": old_val,
                "latest_value": new_val,
                "change": diff,
                "direction": direction,
                "unit": unit,
            }

    return {
        "comparison_available": True,
        "test_count": len(sorted_tests),
        "initial_date": first.get("test_date") or str(first.get("created_at"))[:10],
        "latest_date": latest.get("test_date") or str(latest.get("created_at"))[:10],
        "trends": trends,
    }


soil_service = {
    "extract_soil_report": extract_soil_report,
    "generate_soil_explanation": generate_soil_explanation,
    "compare_soil_tests": compare_soil_tests,
}
