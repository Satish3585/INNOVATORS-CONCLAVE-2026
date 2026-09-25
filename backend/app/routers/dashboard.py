from datetime import datetime, time, timedelta, timezone
from fastapi import APIRouter, Depends
from app.common import now_utc, safe, user_id
from app.config import settings
from app.database import get_db
from app.security import get_current_user
from app.services import external_json

router = APIRouter()


@router.get("/dashboard/home")
async def home_dashboard(current=Depends(get_current_user), db=Depends(get_db)):
    owner = user_id(current)
    now = now_utc()
    start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    crops = await db.crops.find({"owner_id": owner, "status": "active"}).sort("expected_harvest_date", 1).to_list(length=100)
    tasks = await db.tasks.find({"owner_id": owner, "status": {"$in": ["pending", "in_progress"]}}).sort("due_date", 1).to_list(length=100)
    due_today = [task for task in tasks if isinstance(task.get("due_date"), datetime) and start <= task["due_date"] < end]
    overdue = [task for task in tasks if isinstance(task.get("due_date"), datetime) and task["due_date"] < start]
    health = await db.health_checks.find({"owner_id": owner, "review_required": True}).sort("created_at", -1).limit(5).to_list(length=5)
    interests = await db.interests.find({"farmer_id": owner, "status": "pending"}).sort("created_at", -1).limit(5).to_list(length=5)
    notifications_count = await db.notifications.count_documents({"owner_id": owner, "read_at": None})
    default_location = current.get("location")
    farms = await db.farms.find({"owner_id": owner, "archived_at": None}).to_list(length=50)
    if not default_location:
        default_location = next((farm.get("location") for farm in farms if farm.get("location")), None)
    attention = []
    for task in overdue:
        attention.append({"id": str(task["_id"]), "type": "overdue_task", "priority": "high", "title": task.get("title", "Overdue task"), "message": "This task is past its due date.", "reference_type": "task", "reference_id": str(task["_id"]), "action": "open_task"})
    for item in health:
        attention.append({"id": str(item["_id"]), "type": "health_review", "priority": "high", "title": "Crop health review", "message": "A crop health record is awaiting follow-up.", "reference_type": "health_check", "reference_id": str(item["_id"]), "action": "open_health_check"})
    for item in interests:
        attention.append({"id": str(item["_id"]), "type": "buyer_interest", "priority": "normal", "title": "Buyer interest", "message": "A buyer has expressed interest in a listing.", "reference_type": "interest", "reference_id": str(item["_id"]), "action": "open_interest"})
    expiry_cutoff = now + timedelta(days=3)
    expiring = await db.listings.find({"owner_id": owner, "status": "active", "remaining_quantity": {"$gt": 0}, "available_until": {"$gte": now, "$lte": expiry_cutoff}}).limit(10).to_list(length=10)
    for item in expiring:
        attention.append({"id": str(item["_id"]), "type": "listing_expiring", "priority": "normal", "title": "Listing expiring soon", "message": "A produce listing is nearing its availability end date.", "reference_type": "listing", "reference_id": str(item["_id"]), "action": "open_listing"})
    scheme_cutoff = now - timedelta(days=180)
    schemes = await db.schemes.find({"active": True, "official_url": {"$exists": True}, "last_verified": {"$gte": scheme_cutoff}}).sort("last_verified", -1).limit(3).to_list(length=3)
    coords = (default_location or {}).get("coordinates", {}).get("coordinates", []) if default_location else []
    market_params = {"crop": crops[0].get("crop_name", "") if crops else ""}
    if len(coords) == 2:
        market_params.update({"latitude": coords[1], "longitude": coords[0]})
    provider_market = await external_json(settings.market_api_url, settings.market_api_key, market_params)
    market_record = await db.market_snapshots.find_one({"active": True, "retrieved_at": {"$gte": now - timedelta(hours=24)}}, sort=[("retrieved_at", -1)])
    market = {"available": True, "data": provider_market, "source": "configured_provider", "retrieved_at": now.isoformat()} if provider_market else (safe(market_record) if market_record else {"available": False, "reason": "No recent verified market data is configured."})
    summary_bits = []
    if crops: summary_bits.append(f"{len(crops)} active crop cycle{'s' if len(crops) != 1 else ''}")
    if due_today: summary_bits.append(f"{len(due_today)} task{'s' if len(due_today) != 1 else ''} due today")
    if overdue: summary_bits.append(f"{len(overdue)} overdue task{'s' if len(overdue) != 1 else ''}")
    if health: summary_bits.append(f"{len(health)} crop health record{'s' if len(health) != 1 else ''} awaiting review")
    brief = "; ".join(summary_bits) if summary_bits else "No active farm records require attention today."
    return {"farmer": {"id": owner, "name": current.get("full_name"), "profile_photo_url": current.get("profile_photo_url"), "role": current.get("role")}, "location": safe(default_location), "today_farm_brief": {"text": brief, "generated_from_records": True}, "attention_items": attention, "farm_alerts": [], "government_support_preview": safe(schemes), "quick_actions": [{"key": "add_farm", "label": "Add Farm", "action": "create_farm"}, {"key": "add_field", "label": "Add Field", "action": "create_field"}, {"key": "add_crop", "label": "Add Crop", "action": "create_cultivation"}, {"key": "record_irrigation", "label": "Record Irrigation", "action": "create_irrigation"}, {"key": "record_expense", "label": "Record Expense", "action": "create_expense"}, {"key": "record_harvest", "label": "Record Harvest", "action": "create_harvest"}, {"key": "sell_produce", "label": "Sell Produce", "action": "create_listing"}, {"key": "ask_farmai", "label": "Ask FarmAI", "action": "create_ai_conversation"}], "current_crops": safe(crops), "market_snapshot": market, "today_tasks": safe(due_today), "farm_ai_insight": {"available": False, "reason": "No grounded FarmAI insight has been generated for this dashboard request."}, "notification_count": notifications_count}


@router.get("/history")
async def history(limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    owner = user_id(current)
    types = ["cultivations", "tasks", "irrigation", "inputs", "expenses", "health_checks", "harvests", "listings", "ai_reports", "requirements"]
    items = []
    for collection in types:
        docs = await db[collection].find({"owner_id": owner}).sort("created_at", -1).limit(min(limit, 100)).to_list(length=min(limit, 100))
        items.extend([{**safe(doc), "record_type": collection} for doc in docs])
    tx_field = "farmer_id" if current.get("role") == "farmer" else "buyer_id"
    txs = await db.transactions.find({tx_field: owner}).sort("created_at", -1).limit(min(limit, 100)).to_list(length=min(limit, 100))
    items.extend([{**safe(doc), "record_type": "transactions"} for doc in txs])
    conversations = await db.ai_conversations.find({"owner_id": owner}).sort("updated_at", -1).limit(min(limit, 100)).to_list(length=min(limit, 100))
    items.extend([{**safe(doc), "record_type": "ai_conversations"} for doc in conversations])
    items.sort(key=lambda item: str(item.get("created_at") or item.get("updated_at") or ""), reverse=True)
    return {"items": items[offset:offset + min(limit, 100)], "total": len(items), "limit": min(max(limit, 1), 100), "offset": max(offset, 0)}
