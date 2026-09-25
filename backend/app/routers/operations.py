from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.common import audit, mongo_values, now_utc, oid, owned_query, paginated, require_owned, safe, user_id
from app.database import get_db
from app.schemas import HealthCheckCreate, HarvestCreate, RecordCreate, TaskCreate
from app.security import get_current_user

router = APIRouter()


async def validate_crop(db, crop_id: str | None, user):
    if crop_id:
        await require_owned(db, "crops", crop_id, user)


@router.get("/tasks")
async def list_tasks(status: str | None = None, crop_id: str | None = None, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    query = owned_query(current)
    if status: query["status"] = status
    if crop_id: query["crop_id"] = crop_id
    return await paginated(db.tasks, query, limit, offset, [("due_date", 1)])


@router.post("/tasks", status_code=201)
async def create_task(payload: TaskCreate, current=Depends(get_current_user), db=Depends(get_db)):
    await validate_crop(db, payload.crop_id, current)
    data = payload.model_dump()
    data.update({"owner_id": user_id(current), "status": "pending", "created_at": now_utc(), "updated_at": now_utc()})
    data = mongo_values(data)
    result = await db.tasks.insert_one(data)
    await audit(db, current, "task.created", "task", str(result.inserted_id))
    return safe(await db.tasks.find_one({"_id": result.inserted_id}))


@router.patch("/tasks/{id}")
async def patch_task(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    doc = await require_owned(db, "tasks", id, current)
    allowed = {"title", "description", "due_date", "priority", "status", "crop_id", "field_id", "notes"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    updates["updated_at"] = now_utc()
    await db.tasks.update_one({"_id": doc["_id"]}, {"$set": updates})
    return safe(await db.tasks.find_one({"_id": doc["_id"]}))


async def task_action(id: str, action: str, current, db, body: dict | None = None):
    task = await require_owned(db, "tasks", id, current)
    if task.get("status") in {"completed", "skipped"}:
        raise HTTPException(status_code=409, detail=f"A {task.get('status')} task cannot be {action}")
    updates = {"status": action, "updated_at": now_utc()}
    if action == "completed": updates["completed_at"] = now_utc()
    if action == "skipped": updates["skipped_at"] = now_utc()
    if action == "rescheduled":
        if not body or not body.get("due_date"): raise HTTPException(status_code=422, detail="due_date is required")
        updates["due_date"] = body["due_date"]
        updates["status"] = "pending"
    await db.tasks.update_one({"_id": task["_id"]}, {"$set": updates})
    await audit(db, current, f"task.{action}", "task", id)
    return safe(await db.tasks.find_one({"_id": task["_id"]}))


@router.post("/tasks/{id}/complete")
async def complete_task(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    return await task_action(id, "completed", current, db)


@router.post("/tasks/{id}/reschedule")
async def reschedule_task(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    return await task_action(id, "rescheduled", current, db, payload)


@router.post("/tasks/{id}/skip")
async def skip_task(id: str, payload: dict | None = None, current=Depends(get_current_user), db=Depends(get_db)):
    return await task_action(id, "skipped", current, db, payload)


async def create_record(collection, payload, current, db, kind: str):
    data = payload.model_dump(exclude_none=True)
    crop_id = data.get("crop_id")
    await validate_crop(db, crop_id, current)
    data.update({"owner_id": user_id(current), "created_at": now_utc(), "updated_at": now_utc()})
    data = mongo_values(data)
    result = await db[collection].insert_one(data)
    await audit(db, current, f"{kind}.created", kind, str(result.inserted_id))
    return safe(await db[collection].find_one({"_id": result.inserted_id}))


async def list_records(collection, current, db, limit=50, offset=0, crop_id=None):
    query = owned_query(current)
    if crop_id: query["crop_id"] = crop_id
    return await paginated(db[collection], query, limit, offset, [("created_at", -1)])


async def patch_record(collection, id: str, payload: dict, current, db):
    doc = await require_owned(db, collection, id, current)
    updates = {k: v for k, v in payload.items() if k not in {"_id", "id", "owner_id", "created_at", "updated_at"}}
    updates["updated_at"] = now_utc()
    await db[collection].update_one({"_id": doc["_id"]}, {"$set": updates})
    await audit(db, current, f"{collection}.updated", collection, id, {"fields": sorted(updates.keys())})
    return safe(await db[collection].find_one({"_id": doc["_id"]}))


@router.get("/irrigation")
async def list_irrigation(crop_id: str | None = None, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await list_records("irrigation", current, db, limit, offset, crop_id)

@router.post("/irrigation", status_code=201)
async def create_irrigation(payload: RecordCreate, current=Depends(get_current_user), db=Depends(get_db)):
    return await create_record("irrigation", payload, current, db, "irrigation")

@router.patch("/irrigation/{id}")
async def update_irrigation(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    return await patch_record("irrigation", id, payload, current, db)

@router.get("/inputs")
async def list_inputs(crop_id: str | None = None, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await list_records("inputs", current, db, limit, offset, crop_id)

@router.post("/inputs", status_code=201)
async def create_input(payload: RecordCreate, current=Depends(get_current_user), db=Depends(get_db)):
    return await create_record("inputs", payload, current, db, "input")

@router.patch("/inputs/{id}")
async def update_input(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    return await patch_record("inputs", id, payload, current, db)

@router.get("/expenses")
async def list_expenses(crop_id: str | None = None, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await list_records("expenses", current, db, limit, offset, crop_id)

@router.post("/expenses", status_code=201)
async def create_expense(payload: RecordCreate, current=Depends(get_current_user), db=Depends(get_db)):
    return await create_record("expenses", payload, current, db, "expense")

@router.patch("/expenses/{id}")
async def update_expense(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    return await patch_record("expenses", id, payload, current, db)

@router.post("/health-checks", status_code=201)
async def create_health_check(payload: HealthCheckCreate, current=Depends(get_current_user), db=Depends(get_db)):
    await validate_crop(db, payload.crop_id, current)
    doc = payload.model_dump(exclude_none=True)
    doc.update({"owner_id": user_id(current), "diagnosis_status": "not_configured", "ai_result": None, "confidence": None, "review_required": True, "created_at": now_utc(), "updated_at": now_utc()})
    doc = mongo_values(doc)
    result = await db.health_checks.insert_one(doc)
    await db.crops.update_one({"_id": oid(payload.crop_id)}, {"$set": {"health_status": "review_required", "updated_at": now_utc()}})
    await audit(db, current, "health_check.created", "health_check", str(result.inserted_id))
    return safe(await db.health_checks.find_one({"_id": result.inserted_id}))

@router.get("/health-checks")
async def list_health_checks(crop_id: str | None = None, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await list_records("health_checks", current, db, limit, offset, crop_id)

@router.get("/health-checks/{id}")
async def get_health_check(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    return safe(await require_owned(db, "health_checks", id, current))

@router.get("/harvests")
async def list_harvests(crop_id: str | None = None, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await list_records("harvests", current, db, limit, offset, crop_id)

@router.post("/harvests", status_code=201)
async def create_harvest(payload: HarvestCreate, current=Depends(get_current_user), db=Depends(get_db)):
    await validate_crop(db, payload.crop_id, current)
    data = payload.model_dump(exclude_none=True)
    qty = float(payload.quantity)
    data.update({
        "owner_id": user_id(current),
        "crop_cycle_id": payload.crop_id,
        "available_quantity": qty,
        "reserved_quantity": 0.0,
        "sold_quantity": 0.0,
        "listed_quantity": 0.0,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    })
    data = mongo_values(data)
    result = await db.harvests.insert_one(data)
    await audit(db, current, "harvest.created", "harvest", str(result.inserted_id))
    return safe(await db.harvests.find_one({"_id": result.inserted_id}))

@router.get("/harvests/{id}")
async def get_harvest(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    harvest = await require_owned(db, "harvests", id, current)
    allocated = float(harvest.get("listed_quantity") or 0)
    harvest["listed_quantity"] = allocated
    harvest["remaining_quantity"] = max(0, float(harvest.get("quantity") or 0) - allocated)
    return safe(harvest)

@router.patch("/harvests/{id}")
async def update_harvest(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    return await patch_record("harvests", id, payload, current, db)
