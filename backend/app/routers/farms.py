from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from app.common import audit, mongo_values, now_utc, oid, owned_query, paginated, require_owned, safe, user_id
from app.database import get_db
from app.schemas import CultivationCreate, FarmCreate, FieldCreate, Location
from app.security import get_current_user

router = APIRouter()


def geo(location: Location | None):
    return location.as_geojson() if location else None


@router.get("/farms")
async def list_farms(limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await paginated(db.farms, owned_query(current, {"archived_at": None}), limit, offset, [("created_at", -1)])


@router.post("/farms", status_code=201)
async def create_farm(payload: FarmCreate, current=Depends(get_current_user), db=Depends(get_db)):
    now = now_utc()
    item = payload.model_dump(exclude_none=True)
    item.update({"owner_id": user_id(current), "location": geo(payload.location), "archived_at": None, "created_at": now, "updated_at": now})
    item = mongo_values(item)
    result = await db.farms.insert_one(item)
    await audit(db, current, "farm.created", "farm", str(result.inserted_id))
    return safe(await db.farms.find_one({"_id": result.inserted_id}))


@router.get("/farms/{id}")
async def get_farm(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    return safe(await require_owned(db, "farms", id, current))


@router.patch("/farms/{id}")
async def patch_farm(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    farm = await require_owned(db, "farms", id, current)
    updates = {k: v for k, v in payload.items() if k in {"name", "farm_type", "size", "size_unit", "address", "water_sources", "notes", "location"}}
    if "location" in updates and updates["location"]:
        updates["location"] = Location.model_validate(updates["location"]).as_geojson()
    updates["updated_at"] = now_utc()
    await db.farms.update_one({"_id": farm["_id"]}, {"$set": updates})
    return safe(await db.farms.find_one({"_id": farm["_id"]}))


@router.post("/farms/{id}/archive")
async def archive_farm(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    farm = await require_owned(db, "farms", id, current)
    await db.farms.update_one({"_id": farm["_id"]}, {"$set": {"archived_at": now_utc(), "updated_at": now_utc()}})
    return {"success": True, "farm_id": id, "status": "archived"}


@router.get("/farms/{id}/summary")
async def farm_summary(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    farm = await require_owned(db, "farms", id, current)
    fields = await db.fields.count_documents({"farm_id": id, "owner_id": user_id(current)})
    cults = await db.cultivations.count_documents({"farm_id": id, "owner_id": user_id(current), "status": "active"})
    return {"farm": safe(farm), "field_count": fields, "active_cultivation_count": cults}


@router.get("/farms/{farm_id}/fields")
async def list_fields(farm_id: str, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    await require_owned(db, "farms", farm_id, current)
    return await paginated(db.fields, {"owner_id": user_id(current), "farm_id": farm_id, "archived_at": None}, limit, offset, [("created_at", -1)])


@router.post("/farms/{farm_id}/fields", status_code=201)
async def create_field(farm_id: str, payload: FieldCreate, current=Depends(get_current_user), db=Depends(get_db)):
    await require_owned(db, "farms", farm_id, current)
    now = now_utc()
    item = payload.model_dump(exclude_none=True)
    item.update({"farm_id": farm_id, "owner_id": user_id(current), "location": geo(payload.location), "archived_at": None, "created_at": now, "updated_at": now})
    item = mongo_values(item)
    result = await db.fields.insert_one(item)
    await audit(db, current, "field.created", "field", str(result.inserted_id))
    return safe(await db.fields.find_one({"_id": result.inserted_id}))


@router.get("/fields/{id}")
async def get_field(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    return safe(await require_owned(db, "fields", id, current))


@router.patch("/fields/{id}")
async def patch_field(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    field = await require_owned(db, "fields", id, current)
    allowed = {"name", "area", "area_unit", "soil_type", "soil_ph", "soil_nutrients", "irrigation_method", "water_availability", "notes", "location"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    if "location" in updates and updates["location"]:
        updates["location"] = Location.model_validate(updates["location"]).as_geojson()
    updates["updated_at"] = now_utc()
    await db.fields.update_one({"_id": field["_id"]}, {"$set": updates})
    return safe(await db.fields.find_one({"_id": field["_id"]}))


@router.get("/fields/{id}/summary")
async def field_summary(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    field = await require_owned(db, "fields", id, current)
    crops = await db.crops.find({"owner_id": user_id(current), "field_id": id, "status": {"$ne": "completed"}}).to_list(length=500)
    return {"field": safe(field), "active_crops": safe(crops), "crop_count": len(crops)}


@router.post("/cultivations", status_code=201)
async def create_cultivation(payload: CultivationCreate, current=Depends(get_current_user), db=Depends(get_db)):
    field = await require_owned(db, "fields", payload.field_id, current)
    # Validate nested ownership: farm belongs to current user
    await require_owned(db, "farms", field["farm_id"], current)
    
    # Validate field capacity for multi-cropping
    field_area = field.get("area")
    if field_area is not None:
        try:
            field_area_val = float(field_area)
            total_crop_area = sum(float(c.get("area") or 0) for c in payload.crops if c.get("area") is not None)
            if total_crop_area > (field_area_val + 1e-5):
                raise HTTPException(
                    status_code=422,
                    detail=f"Total crop area ({total_crop_area:.2f}) exceeds field area capacity ({field_area_val:.2f} {field.get('area_unit', 'acre')})"
                )
        except (ValueError, TypeError):
            pass

    now = now_utc()
    record = {"owner_id": user_id(current), "farm_id": field["farm_id"], "field_id": payload.field_id, "name": payload.name, "season": payload.season, "start_date": payload.start_date, "notes": payload.notes, "status": "active", "created_at": now, "updated_at": now}
    record = mongo_values(record)
    result = await db.cultivations.insert_one(record)
    cultivation_id = str(result.inserted_id)
    crop_docs = []
    for crop in payload.crops:
        name = str(crop.get("crop_name") or crop.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Every crop requires crop_name")
        crop_docs.append({"owner_id": user_id(current), "cultivation_id": cultivation_id, "farm_id": field["farm_id"], "field_id": payload.field_id, "crop_name": name, "variety": crop.get("variety"), "planting_date": crop.get("planting_date") or payload.start_date, "expected_harvest_date": crop.get("expected_harvest_date"), "growth_stage": crop.get("growth_stage", "planning"), "status": "active", "health_status": "unknown", "area": crop.get("area"), "area_unit": crop.get("area_unit", "acre"), "created_at": now, "updated_at": now})
    crop_docs = mongo_values(crop_docs)
    if crop_docs:
        await db.crops.insert_many(crop_docs)
    await audit(db, current, "cultivation.created", "cultivation", cultivation_id, {"crop_count": len(crop_docs)})
    return {"cultivation": safe(await db.cultivations.find_one({"_id": result.inserted_id})), "crops": safe(crop_docs)}


@router.get("/cultivations")
async def list_cultivations(limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await paginated(db.cultivations, owned_query(current), limit, offset, [("created_at", -1)])


@router.get("/cultivations/{id}")
async def get_cultivation(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    cultivation = await require_owned(db, "cultivations", id, current)
    crops = await db.crops.find({"cultivation_id": id, "owner_id": user_id(current)}).to_list(length=500)
    return {"cultivation": safe(cultivation), "crops": safe(crops)}


@router.patch("/cultivations/{id}")
async def patch_cultivation(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    record = await require_owned(db, "cultivations", id, current)
    updates = {k: v for k, v in payload.items() if k in {"name", "season", "start_date", "end_date", "status", "notes"}}
    updates["updated_at"] = now_utc()
    await db.cultivations.update_one({"_id": record["_id"]}, {"$set": updates})
    return safe(await db.cultivations.find_one({"_id": record["_id"]}))


@router.get("/crops/{id}/journey")
async def crop_journey(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    crop = await require_owned(db, "crops", id, current)
    collections = ["tasks", "irrigation", "inputs", "expenses", "health_checks", "harvests", "ai_reports"]
    history = []
    for collection in collections:
        docs = await db[collection].find({"owner_id": user_id(current), "crop_id": id}).sort("created_at", 1).to_list(length=1000)
        history.extend([{**safe(d), "record_type": collection} for d in docs])
    history.sort(key=lambda item: str(item.get("created_at") or ""))
    return {"crop": safe(crop), "timeline": history}


@router.get("/crops/{id}/timeline")
async def crop_timeline(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    return await crop_journey(id, current, db)
