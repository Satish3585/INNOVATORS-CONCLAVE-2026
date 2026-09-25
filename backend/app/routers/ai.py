from datetime import datetime, timezone
import base64
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from app.common import audit, now_utc, oid, paginated, require_owned, safe, user_id
from app.config import settings
from app.database import get_db
from app.schemas import AIActionCreate, AIActionDecision, AIConversationCreate, AIMessageCreate
from app.security import get_current_user
from app.services import farm_ai_reply

router = APIRouter()


def parse_due_date(value):
    try:
        result = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="due_date must be an ISO-8601 datetime")
    return result if result.tzinfo else result.replace(tzinfo=timezone.utc)


@router.post("/ai/conversations", status_code=201)
async def create_conversation(payload: AIConversationCreate, current=Depends(get_current_user), db=Depends(get_db)):
    now = now_utc()
    doc = {"owner_id": user_id(current), "title": payload.title or "FarmAI conversation", "context": payload.context, "messages": [], "created_at": now, "updated_at": now}
    result = await db.ai_conversations.insert_one(doc)
    return safe(await db.ai_conversations.find_one({"_id": result.inserted_id}))


@router.get("/ai/conversations")
async def list_conversations(limit: int = 30, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    page = await paginated(db.ai_conversations, {"owner_id": user_id(current)}, limit, offset, [("updated_at", -1)])
    for item in page["items"]:
        item["message_count"] = len(item.pop("messages", []))
    return page


@router.get("/ai/conversations/{id}")
async def get_conversation(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    return safe(await require_owned(db, "ai_conversations", id, current))


@router.post("/ai/conversations/{id}/messages")
async def send_message(id: str, payload: AIMessageCreate, current=Depends(get_current_user), db=Depends(get_db)):
    conversation = await require_owned(db, "ai_conversations", id, current)
    context = {
        "farmer": {
            "name": current.get("full_name", "Farmer"),
            "language": payload.language or current.get("preferred_language", "en"),
            "location": current.get("location"),
        }
    }
    image_data_url = None

    field_id = payload.field_id
    crop_doc = None
    farm_doc = None

    if payload.crop_id:
        crop_doc = await require_owned(db, "crops", payload.crop_id, current)
        context["crop"] = {
            "crop_name": crop_doc.get("crop_name"),
            "variety": crop_doc.get("variety"),
            "growth_stage": crop_doc.get("growth_stage"),
            "planting_date": crop_doc.get("planting_date"),
            "health_status": crop_doc.get("health_status"),
            "status": crop_doc.get("status"),
        }
        if not field_id and crop_doc.get("field_id"):
            field_id = crop_doc.get("field_id")
        # Recent health checks for this crop
        context["recent_health_checks"] = safe(
            await db.health_checks.find({"owner_id": user_id(current), "crop_id": payload.crop_id})
            .sort("created_at", -1)
            .limit(3)
            .to_list(length=3)
        )
        # Recent irrigation for this crop
        context["recent_irrigation"] = safe(
            await db.irrigation.find({"owner_id": user_id(current), "crop_id": payload.crop_id})
            .sort("created_at", -1)
            .limit(3)
            .to_list(length=3)
        )

    if field_id:
        field_doc = await require_owned(db, "fields", field_id, current)
        context["field"] = {
            "name": field_doc.get("name"),
            "area": f"{field_doc.get('area')} {field_doc.get('area_unit', 'acre')}",
            "soil_type": field_doc.get("soil_type"),
            "irrigation_method": field_doc.get("irrigation_method"),
            "water_availability": field_doc.get("water_availability"),
        }
        if field_doc.get("farm_id"):
            farm = await db.farms.find_one({"_id": oid(field_doc["farm_id"]), "owner_id": user_id(current)})
            if farm:
                farm_doc = farm
                context["farm"] = {"name": farm.get("name"), "size": farm.get("size"), "location": farm.get("location")}

        # Fetch latest soil test for this field
        latest_soil = await db.soil_tests.find_one(
            {"field_id": field_id, "owner_id": user_id(current)},
            sort=[("test_date", -1), ("created_at", -1)]
        )
        if latest_soil:
            context["latest_soil_test"] = {
                "test_date": latest_soil.get("test_date"),
                "soil_type": latest_soil.get("soil_type"),
                "ph": latest_soil.get("ph"),
                "nitrogen_kg_ha": latest_soil.get("nitrogen"),
                "phosphorus_kg_ha": latest_soil.get("phosphorus"),
                "potassium_kg_ha": latest_soil.get("potassium"),
                "electrical_conductivity_ds_m": latest_soil.get("electrical_conductivity"),
                "organic_carbon_pct": latest_soil.get("organic_carbon"),
                "test_source": latest_soil.get("test_source"),
            }
        elif field_doc.get("soil_ph") is not None or field_doc.get("soil_nutrients"):
            context["latest_soil_test"] = {
                "ph": field_doc.get("soil_ph"),
                "soil_nutrients": field_doc.get("soil_nutrients"),
                "soil_type": field_doc.get("soil_type"),
            }

    # If no specific crop or field was linked, look for farmer's active farm and crops for general context
    if not payload.crop_id and not payload.field_id:
        active_crops = await db.crops.find({"owner_id": user_id(current), "status": "active"}).limit(3).to_list(length=3)
        if active_crops:
            context["active_crops_summary"] = [
                {"crop_name": c.get("crop_name"), "stage": c.get("growth_stage"), "health": c.get("health_status")}
                for c in active_crops
            ]

    if payload.image_upload_id:
        upload = await require_owned(db, "uploads", payload.image_upload_id, current)
        context["image"] = {"upload_id": payload.image_upload_id, "content_type": upload.get("content_type"), "attached": True}
        root = Path(settings.upload_dir).resolve()
        image_path = (root / upload["relative_path"]).resolve()
        if image_path.parent != root or not image_path.is_file():
            raise HTTPException(status_code=404, detail="Uploaded image file not found")
        if image_path.stat().st_size > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="Uploaded image exceeds the AI request size limit")
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        image_data_url = f"data:{upload['content_type']};base64,{encoded}"

    recent_tasks = await db.tasks.find({"owner_id": user_id(current), "status": {"$in": ["pending", "in_progress"]}}).sort("due_date", 1).limit(5).to_list(length=5)
    context["upcoming_tasks"] = safe(recent_tasks)

    user_msg = {"role": "user", "content": payload.message, "input_type": payload.input_type, "created_at": now_utc()}
    user_content = [{"type": "text", "text": f"Saved Farm Agricultural Context:\n{context}\n\nFarmer Question:\n{payload.message}"}]
    if image_data_url:
        user_content.append({"type": "image_url", "image_url": {"url": image_data_url}})

    system_instruction = (
        "You are FarmAI, an expert, empathetic agricultural assistant and advisor for farmers. "
        "You are provided with real, saved agricultural context including the farmer's farm, field, "
        "recent soil tests (pH, Nitrogen, Phosphorus, Potassium, EC, Organic Carbon), current crop, "
        "growth stage, and health checks. "
        "Use this specific context to provide actionable, farmer-friendly explanations. "
        "When explaining soil conditions, relate pH to nutrient availability and the specific crop's optimal range. "
        "When diagnosing or advising on crop issues, cross-reference soil test values and recent health checks. "
        "Suggest organic and integrated pest/nutrient management remedies alongside standard agronomic practices. "
        "If data is insufficient or uncertainty exists, clearly state what additional information would help, "
        "and recommend local agricultural extension officers or certified agronomists for severe infestations. "
        "Never invent unverified local weather, market prices, or take destructive actions."
    )

    prompt = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": user_content if image_data_url else user_content[0]["text"]},
    ]
    answer = await farm_ai_reply(prompt)
    assistant_msg = {
        "role": "assistant",
        "content": answer,
        "availability": "available" if answer else "unavailable",
        "confidence": None,
        "confidence_reason": "No calibrated confidence model is configured for unstructured conversational text.",
        "proposed_actions": [],
        "created_at": now_utc(),
    }
    await db.ai_conversations.update_one(
        {"_id": conversation["_id"], "owner_id": user_id(current)},
        {"$push": {"messages": {"$each": [user_msg, assistant_msg]}}, "$set": {"updated_at": now_utc(), "title": conversation.get("title") or payload.message[:80]}}
    )
    return {
        "conversation_id": id,
        "user_message": safe(user_msg),
        "assistant_message": safe(assistant_msg),
        "context_used": context,
        "provider_available": answer is not None,
    }


@router.post("/ai/actions", status_code=201)
async def create_action(payload: AIActionCreate, current=Depends(get_current_user), db=Depends(get_db)):
    item = {"owner_id": user_id(current), "action_type": payload.action_type, "title": payload.title, "payload": payload.payload, "status": "pending_confirmation", "created_at": now_utc(), "updated_at": now_utc()}
    result = await db.ai_actions.insert_one(item)
    return {"action": safe(await db.ai_actions.find_one({"_id": result.inserted_id})), "requires_confirmation": True}


@router.get("/ai/actions")
async def list_actions(limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await paginated(db.ai_actions, {"owner_id": user_id(current)}, limit, offset, [("created_at", -1)])


@router.post("/ai/actions/{id}/decision")
async def decide_action(id: str, payload: AIActionDecision, current=Depends(get_current_user), db=Depends(get_db)):
    action = await require_owned(db, "ai_actions", id, current)
    if action.get("status") != "pending_confirmation":
        raise HTTPException(status_code=409, detail="Action is no longer awaiting confirmation")
    if payload.decision == "reject":
        await db.ai_actions.update_one({"_id": action["_id"], "status": "pending_confirmation"}, {"$set": {"status": "rejected", "decision_note": payload.note, "updated_at": now_utc()}})
        return safe(await db.ai_actions.find_one({"_id": action["_id"]}))
    proposed = action.get("payload", {})
    if action["action_type"] == "create_task":
        if not proposed.get("title"):
            raise HTTPException(status_code=422, detail="Approved task proposal requires title and due_date")
        due_date = parse_due_date(proposed.get("due_date"))
        crop_id = proposed.get("crop_id")
        if crop_id: await require_owned(db, "crops", crop_id, current)
        field_id = proposed.get("field_id")
        if field_id: await require_owned(db, "fields", field_id, current)
    else:
        task_id = str(proposed.get("task_id", ""))
        task = await require_owned(db, "tasks", task_id, current)
        if task.get("status") in {"completed", "skipped"}:
            raise HTTPException(status_code=409, detail="Completed or skipped tasks cannot be rescheduled")
        due_date = parse_due_date(proposed.get("due_date"))
    claimed = await db.ai_actions.find_one_and_update({"_id": action["_id"], "status": "pending_confirmation"}, {"$set": {"status": "executing", "decision_note": payload.note, "updated_at": now_utc()}})
    if not claimed:
        raise HTTPException(status_code=409, detail="Action was already handled")
    try:
        if action["action_type"] == "create_task":
            record = {"owner_id": user_id(current), "title": str(proposed["title"])[:180], "due_date": due_date, "crop_id": crop_id, "field_id": field_id, "priority": proposed.get("priority", "normal"), "status": "pending", "created_at": now_utc(), "updated_at": now_utc(), "source": "confirmed_ai_action"}
            result = await db.tasks.insert_one(record)
            executed = {"type": "task", "id": str(result.inserted_id)}
        else:
            changed = await db.tasks.update_one({"_id": task["_id"], "status": {"$nin": ["completed", "skipped"]}}, {"$set": {"due_date": due_date, "status": "pending", "updated_at": now_utc(), "source": "confirmed_ai_action"}})
            if changed.modified_count != 1:
                raise HTTPException(status_code=409, detail="Task changed before the action could be applied")
            executed = {"type": "task", "id": task_id}
    except Exception:
        await db.ai_actions.update_one({"_id": action["_id"], "status": "executing"}, {"$set": {"status": "failed", "updated_at": now_utc()}})
        raise
    await db.ai_actions.update_one({"_id": action["_id"], "status": "executing"}, {"$set": {"status": "applied", "execution": executed, "updated_at": now_utc()}})
    await audit(db, current, "ai_action.applied", "ai_action", id, executed)
    return safe(await db.ai_actions.find_one({"_id": action["_id"]}))
