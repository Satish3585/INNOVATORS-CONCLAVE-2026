from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.common import audit, mongo_values, now_utc, oid, paginated, require_owned, safe, user_id
from app.config import settings
from app.database import get_db
from app.schemas import DiseaseCheckRequest, SoilExplanationRequest, SoilExtractRequest, SoilTestCreate
from app.security import get_current_user, require_roles
from app.services import disease_detector, recommendation_service
from app.services.soil_service import soil_service

router = APIRouter()


@router.get("/crops")
async def list_crops(status: str | None = None, field_id: str | None = None, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    query = {"owner_id": user_id(current)}
    if status: query["status"] = status
    if field_id: query["field_id"] = field_id
    return await paginated(db.crops, query, limit, offset, [("created_at", -1)])


@router.post("/crops", status_code=201)
async def create_crop(payload: dict, current=Depends(require_roles("farmer")), db=Depends(get_db)):
    """
    Creates a new crop cycle associated with a field and cultivation.
    Enforces that crop allocation does not exceed field capacity.
    """
    field_id = payload.get("field_id")
    if not field_id:
        raise HTTPException(status_code=422, detail="field_id is required")
    field = await require_owned(db, "fields", field_id, current)
    
    crop_name = str(payload.get("crop_name") or "").strip()
    if not crop_name:
        raise HTTPException(status_code=422, detail="crop_name is required")

    area = payload.get("area")
    if area is not None and field.get("area") is not None:
        try:
            req_area = float(area)
            field_area = float(field["area"])
            # Sum active crops in this field
            active_crops = await db.crops.find({"field_id": field_id, "owner_id": user_id(current), "status": {"$in": ["active", "planned"]}}).to_list(length=100)
            existing_allocated = sum(float(c.get("area") or 0) for c in active_crops if c.get("area") is not None)
            if existing_allocated + req_area > (field_area + 1e-5):
                raise HTTPException(
                    status_code=422,
                    detail=f"Requested crop area ({req_area}) exceeds remaining field capacity ({max(0.0, field_area - existing_allocated):.2f} {field.get('area_unit', 'acre')})"
                )
        except (ValueError, TypeError):
            pass

    now = now_utc()
    doc = {
        "owner_id": user_id(current),
        "farm_id": field["farm_id"],
        "field_id": field_id,
        "cultivation_id": payload.get("cultivation_id"),
        "crop_name": crop_name,
        "variety": payload.get("variety"),
        "role": payload.get("role", "primary"),
        "area": area,
        "area_unit": payload.get("area_unit", field.get("area_unit", "acre")),
        "planting_date": payload.get("planting_date"),
        "expected_harvest_date": payload.get("expected_harvest_date"),
        "actual_completion_date": None,
        "growth_stage": payload.get("growth_stage", "planning"),
        "status": payload.get("status", "active"),
        "health_status": "unknown",
        "notes": payload.get("notes"),
        "created_at": now,
        "updated_at": now,
    }
    doc = mongo_values(doc)
    res = await db.crops.insert_one(doc)
    await audit(db, current, "crop.created", "crop", str(res.inserted_id))
    return safe(await db.crops.find_one({"_id": res.inserted_id}))


@router.get("/crops/{id}")
async def get_crop(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    return safe(await require_owned(db, "crops", id, current))


@router.patch("/crops/{id}")
async def patch_crop(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    crop = await require_owned(db, "crops", id, current)
    allowed = {"crop_name", "variety", "planting_date", "expected_harvest_date", "growth_stage", "status", "health_status", "area", "area_unit", "notes", "role"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    updates["updated_at"] = now_utc()
    await db.crops.update_one({"_id": crop["_id"], "owner_id": user_id(current)}, {"$set": updates})
    return safe(await db.crops.find_one({"_id": crop["_id"]}))


@router.post("/crops/{id}/complete")
async def complete_crop(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    """
    Marks a crop cycle completed and records actual_completion_date.
    The crop cycle remains permanently in historical farm records.
    """
    crop = await require_owned(db, "crops", id, current)
    now = now_utc()
    await db.crops.update_one(
        {"_id": crop["_id"], "owner_id": user_id(current)},
        {"$set": {"status": "completed", "actual_completion_date": now, "updated_at": now}}
    )
    await audit(db, current, "crop.completed", "crop", id)
    return safe(await db.crops.find_one({"_id": crop["_id"]}))


@router.get("/soil")
async def get_soil(field_id: str | None = None, current=Depends(get_current_user), db=Depends(get_db)):
    query = {"owner_id": user_id(current)}
    if field_id: query["_id"] = oid(field_id)
    fields = await db.fields.find(query, {"name": 1, "farm_id": 1, "soil_type": 1, "soil_ph": 1, "soil_nutrients": 1, "updated_at": 1}).to_list(length=500)
    return {"items": safe(fields), "available": any(f.get("soil_type") or f.get("soil_ph") is not None or f.get("soil_nutrients") for f in fields)}


@router.post("/soil")
async def update_soil(payload: dict, current=Depends(require_roles("farmer")), db=Depends(get_db)):
    field = await require_owned(db, "fields", str(payload.get("field_id", "")), current)
    updates = {key: payload[key] for key in ("soil_type", "soil_ph", "soil_nutrients", "soil_test_date", "soil_test_source") if key in payload}
    if "soil_ph" in updates and (not isinstance(updates["soil_ph"], (float, int)) or not 0 <= updates["soil_ph"] <= 14):
        raise HTTPException(status_code=422, detail="soil_ph must be between 0 and 14")
    updates["updated_at"] = now_utc()
    await db.fields.update_one({"_id": field["_id"]}, {"$set": updates})

    # Log into soil_tests collection as well to preserve historical timeline
    test_doc = {
        "owner_id": user_id(current),
        "farm_id": field.get("farm_id"),
        "field_id": str(field["_id"]),
        "soil_type": updates.get("soil_type") or field.get("soil_type"),
        "ph": updates.get("soil_ph"),
        "test_date": updates.get("soil_test_date") or date.today().isoformat(),
        "test_source": updates.get("soil_test_source") or "manual",
        "verified_by_farmer": True,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.soil_tests.insert_one(mongo_values(test_doc))
    return {"field_id": str(field["_id"]), "soil": safe({**field, **updates})}


@router.post("/soil-tests", status_code=201)
async def create_soil_test(payload: SoilTestCreate, current=Depends(require_roles("farmer")), db=Depends(get_db)):
    """
    Creates a verified soil test record for a field.
    Supports manual entry or verified values extracted from an uploaded soil test report.
    Automatically generates agricultural explanation and updates field soil summary.
    """
    field = await require_owned(db, "fields", payload.field_id, current)
    farm_id = field.get("farm_id")

    # If an uploaded report was linked, verify ownership of upload
    if payload.document_upload_id:
        upload = await db.uploads.find_one({"upload_id": payload.document_upload_id, "owner_id": user_id(current)})
        if not upload:
            raise HTTPException(status_code=404, detail="Referenced soil report upload was not found")

    soil_data = payload.model_dump(exclude_none=True)
    explanation = soil_service["generate_soil_explanation"](
        soil_data=soil_data,
        crop_name=payload.selected_crop,
        growth_stage=payload.growth_stage,
        previous_crop=payload.previous_crop,
        field_name=field.get("name"),
    )

    now = now_utc()
    doc = {
        "owner_id": user_id(current),
        "farm_id": farm_id,
        "field_id": payload.field_id,
        "test_date": payload.test_date.isoformat() if payload.test_date else date.today().isoformat(),
        "test_source": payload.test_source,
        "document_upload_id": payload.document_upload_id,
        "soil_type": payload.soil_type or field.get("soil_type"),
        "ph": payload.ph,
        "nitrogen": payload.nitrogen,
        "phosphorus": payload.phosphorus,
        "potassium": payload.potassium,
        "electrical_conductivity": payload.electrical_conductivity,
        "organic_carbon": payload.organic_carbon,
        "moisture_percentage": payload.moisture_percentage,
        "sulfur": payload.sulfur,
        "zinc": payload.zinc,
        "iron": payload.iron,
        "selected_crop": payload.selected_crop,
        "growth_stage": payload.growth_stage,
        "previous_crop": payload.previous_crop,
        "notes": payload.notes,
        "extracted_from_report": payload.extracted_from_report,
        "verified_by_farmer": payload.verified_by_farmer,
        "explanation": explanation,
        "created_at": now,
        "updated_at": now,
    }
    doc = mongo_values(doc)
    res = await db.soil_tests.insert_one(doc)
    test_id = str(res.inserted_id)

    # Sync latest field-level quick lookup
    field_updates = {"updated_at": now}
    if payload.ph is not None:
        field_updates["soil_ph"] = payload.ph
    if payload.soil_type:
        field_updates["soil_type"] = payload.soil_type
    nutrients = {}
    if payload.nitrogen is not None: nutrients["nitrogen"] = payload.nitrogen
    if payload.phosphorus is not None: nutrients["phosphorus"] = payload.phosphorus
    if payload.potassium is not None: nutrients["potassium"] = payload.potassium
    if nutrients:
        field_updates["soil_nutrients"] = nutrients
    await db.fields.update_one({"_id": field["_id"]}, {"$set": field_updates})

    await audit(db, current, "soil_test.created", "soil_test", test_id)
    return safe(await db.soil_tests.find_one({"_id": res.inserted_id}))


@router.get("/soil-tests")
async def list_soil_tests(
    field_id: str | None = None,
    farm_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    query = {"owner_id": user_id(current)}
    if field_id: query["field_id"] = field_id
    if farm_id: query["farm_id"] = farm_id
    return await paginated(db.soil_tests, query, limit, offset, [("test_date", -1), ("created_at", -1)])


@router.get("/soil-tests/{id}")
async def get_soil_test(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    return safe(await require_owned(db, "soil_tests", id, current))


@router.post("/soil-tests/extract")
async def extract_soil_test(payload: SoilExtractRequest, current=Depends(get_current_user), db=Depends(get_db)):
    """
    Extracts soil parameters from an uploaded PDF or image soil test report.
    Returns parsed values so farmer can verify, edit, and confirm before saving.
    """
    upload = await db.uploads.find_one({"upload_id": payload.upload_id, "owner_id": user_id(current)})
    if not upload:
        raise HTTPException(status_code=404, detail="Upload file not found")

    root = Path(settings.upload_dir).resolve()
    file_path = (root / upload["relative_path"]).resolve()
    if not file_path.is_file() or file_path.parent != root:
        raise HTTPException(status_code=404, detail="Uploaded file missing on disk")

    content_bytes = file_path.read_bytes()
    extraction = soil_service["extract_soil_report"](
        file_bytes=content_bytes,
        filename=upload.get("filename", "report"),
        content_type=upload.get("content_type", ""),
    )
    extraction["upload_id"] = payload.upload_id
    extraction["file_url"] = f"/api/uploads/{payload.upload_id}"
    return extraction


@router.post("/soil-tests/explain")
async def explain_soil_test(payload: SoilExplanationRequest, current=Depends(get_current_user), db=Depends(get_db)):
    """
    Explains soil health parameters in simple farmer language with crop-specific suitability.
    """
    soil_dict = payload.model_dump(exclude_none=True)
    if payload.soil_test_id:
        test = await require_owned(db, "soil_tests", payload.soil_test_id, current)
        for k in ("ph", "nitrogen", "phosphorus", "potassium", "electrical_conductivity", "organic_carbon", "selected_crop", "growth_stage", "previous_crop"):
            if k not in soil_dict and test.get(k) is not None:
                soil_dict[k] = test.get(k)

    field_name = None
    if payload.field_id:
        field = await require_owned(db, "fields", payload.field_id, current)
        field_name = field.get("name")

    explanation = soil_service["generate_soil_explanation"](
        soil_data=soil_dict,
        crop_name=soil_dict.get("selected_crop"),
        growth_stage=soil_dict.get("growth_stage"),
        previous_crop=soil_dict.get("previous_crop"),
        field_name=field_name,
    )
    return explanation


@router.get("/soil-tests/history/{field_id}")
async def get_soil_history(field_id: str, current=Depends(get_current_user), db=Depends(get_db)):
    """
    Retrieves full history of soil tests for a field and computes trend comparison.
    """
    field = await require_owned(db, "fields", field_id, current)
    tests_raw = await db.soil_tests.find({"field_id": field_id, "owner_id": user_id(current)}).sort("test_date", -1).to_list(length=100)
    tests = safe(tests_raw)
    comparison = safe(soil_service["compare_soil_tests"](tests))
    return {
        "field": safe(field),
        "tests": tests,
        "comparison": comparison,
    }


@router.post("/disease", status_code=201)
@router.post("/agriculture/disease-check", status_code=201)
async def create_disease_report(payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    """
    Evaluates plant disease from leaf image using PyTorch ResNet9 computer vision model.
    Properly flags uncertain predictions (<50% confidence) with retry/expert review paths.
    """
    crop_id = payload.get("crop_id")
    crop = None
    if crop_id:
        crop = await require_owned(db, "crops", str(crop_id), current)

    field_id = payload.get("field_id") or (crop.get("field_id") if crop else None)
    if field_id:
        await require_owned(db, "fields", str(field_id), current)

    upload_id = payload.get("image_upload_id")
    if not upload_id:
        raise HTTPException(status_code=422, detail="image_upload_id is required for plant health diagnosis")

    upload = await db.uploads.find_one({"upload_id": upload_id, "owner_id": user_id(current)})
    if not upload:
        raise HTTPException(status_code=404, detail="Image upload not found")

    root = Path(settings.upload_dir).resolve()
    file_path = (root / upload["relative_path"]).resolve()
    if not file_path.is_file() or file_path.parent != root:
        raise HTTPException(status_code=404, detail="Image file missing on disk")

    image_bytes = file_path.read_bytes()
    ml_result = None
    diagnosis_status = "model_unavailable"

    if disease_detector.is_available:
        detection = disease_detector.detect(image_bytes)
        ml_result = detection
        if detection.get("success"):
            if detection.get("is_low_confidence"):
                diagnosis_status = "uncertain"
            else:
                diagnosis_status = "diagnosed"
        else:
            diagnosis_status = "analysis_failed"
    else:
        diagnosis_status = "model_unavailable"

    now = now_utc()
    is_uncertain = diagnosis_status == "uncertain"
    is_healthy = bool(ml_result and ml_result.get("is_healthy"))

    disease_name = "Result uncertain" if is_uncertain else (ml_result.get("disease_name") if ml_result else "Undiagnosed")
    confidence_val = ml_result.get("confidence_pct") if ml_result else None

    doc = {
        "owner_id": user_id(current),
        "crop_id": str(crop["_id"]) if crop else None,
        "crop_name": crop.get("crop_name") if crop else payload.get("plant_name"),
        "field_id": field_id,
        "farm_id": crop.get("farm_id") if crop else None,
        "report_type": "disease",
        "symptoms": payload.get("symptoms", []),
        "notes": payload.get("notes"),
        "image_upload_id": upload_id,
        "diagnosis_status": diagnosis_status,
        "is_uncertain": is_uncertain,
        "model_result": ml_result,
        "result": disease_name,
        "confidence": confidence_val,
        "review_required": is_uncertain or ml_result.get("requires_expert_review", True) if ml_result else True,
        "recommended_next_steps": (
            [
                "Retake photo in natural daylight with close-up focus on the leaf lesion",
                "Ensure leaf is fully in frame and camera lens is clean",
                "Upload an alternative affected leaf sample from the same crop",
                "Request certified local extension officer / agronomist review",
                "Consult FarmAI with written symptoms and field context",
            ]
            if is_uncertain
            else (ml_result.get("recommended_actions") if ml_result else ["Consult agronomist."])
        ),
        "created_at": now,
        "updated_at": now,
    }
    doc = mongo_values(doc)
    result = await db.health_checks.insert_one(doc)

    if crop:
        health_status = "healthy" if is_healthy else ("review_required" if is_uncertain else "action_required")
        await db.crops.update_one({"_id": crop["_id"]}, {"$set": {"health_status": health_status, "updated_at": now}})

    await audit(db, current, "disease_check.created", "health_check", str(result.inserted_id), {"status": diagnosis_status})
    saved = await db.health_checks.find_one({"_id": result.inserted_id})
    return safe(saved)


@router.get("/disease")
@router.get("/agriculture/disease-history")
async def list_disease_reports(
    crop_id: str | None = None,
    field_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    query = {"owner_id": user_id(current), "report_type": "disease"}
    if crop_id: query["crop_id"] = crop_id
    if field_id: query["field_id"] = field_id
    return await paginated(db.health_checks, query, limit, offset, [("created_at", -1)])


@router.post("/pests", status_code=201)
async def create_pest_report(payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    crop_id = payload.get("crop_id")
    crop = await require_owned(db, "crops", str(crop_id or ""), current)
    upload_id = payload.get("image_upload_id")
    if upload_id:
        upload = await db.uploads.find_one({"upload_id": upload_id, "owner_id": user_id(current)})
        if not upload: raise HTTPException(status_code=404, detail="Image upload not found")
    now = now_utc()
    doc = {
        "owner_id": user_id(current),
        "crop_id": str(crop["_id"]),
        "field_id": crop.get("field_id"),
        "report_type": "pest",
        "symptoms": payload.get("symptoms", []),
        "image_upload_id": upload_id,
        "diagnosis_status": "not_configured",
        "result": None,
        "confidence": None,
        "review_required": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.health_checks.insert_one(doc)
    return safe(await db.health_checks.find_one({"_id": result.inserted_id}))


@router.get("/pests")
async def list_pest_reports(crop_id: str | None = None, current=Depends(get_current_user), db=Depends(get_db)):
    query = {"owner_id": user_id(current), "report_type": "pest"}
    if crop_id: query["crop_id"] = crop_id
    return {"items": safe(await db.health_checks.find(query).sort("created_at", -1).limit(100).to_list(length=100))}


@router.post("/recommendations/crops")
@router.post("/agriculture/recommend")
async def recommend_crops(payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    """
    Provides ML crop recommendations with calibrated probabilities and agronomic reasoning.
    """
    n = float(payload.get("nitrogen") or payload.get("N") or 80.0)
    p = float(payload.get("phosphorus") or payload.get("P") or 40.0)
    k = float(payload.get("potassium") or payload.get("K") or 40.0)
    ph = float(payload.get("ph") or payload.get("soil_ph") or 6.5)
    temp = float(payload.get("temperature") or 25.0)
    hum = float(payload.get("humidity") or 70.0)
    rain = float(payload.get("rainfall") or 100.0)
    prev = payload.get("previous_crop")
    water = payload.get("water_availability", "medium")
    area = float(payload["field_area"]) if payload.get("field_area") else None

    result = await recommendation_service.get_crop_recommendations(
        nitrogen=n,
        phosphorus=p,
        potassium=k,
        ph=ph,
        temperature=temp,
        humidity=hum,
        rainfall=rain,
        previous_crop=prev,
        water_availability=water,
        field_area_acre=area,
    )
    return result
