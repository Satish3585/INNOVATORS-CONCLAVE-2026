from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.common import now_utc, oid, paginated, user_id, safe
from app.config import settings
from app.database import get_db
from app.security import get_current_user
from app.services import external_json

router = APIRouter()


@router.get("/notifications/unread-count")
async def unread_count(current=Depends(get_current_user), db=Depends(get_db)):
    return {"count": await db.notifications.count_documents({"owner_id": user_id(current), "read_at": None})}


@router.get("/notifications")
async def notifications(unread_only: bool = False, limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    query = {"owner_id": user_id(current)}
    if unread_only: query["read_at"] = None
    return await paginated(db.notifications, query, limit, offset, [("created_at", -1)])


@router.patch("/notifications/{id}/read")
async def read_notification(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    result = await db.notifications.update_one({"_id": oid(id), "owner_id": user_id(current)}, {"$set": {"read_at": now_utc()}})
    if not result.matched_count: raise HTTPException(status_code=404, detail="Notification not found")
    return safe(await db.notifications.find_one({"_id": oid(id)}))


@router.patch("/notifications/read-all")
async def read_all(current=Depends(get_current_user), db=Depends(get_db)):
    result = await db.notifications.update_many({"owner_id": user_id(current), "read_at": None}, {"$set": {"read_at": now_utc()}})
    return {"updated_count": result.modified_count}


async def resolve_location(current, db, location_id: str | None = None):
    if location_id:
        for collection in ("farms", "fields"):
            record = await db[collection].find_one({"_id": oid(location_id), "owner_id": user_id(current)})
            if record and record.get("location"): return record["location"]
    if current.get("location"): return current["location"]
    farm = await db.farms.find_one({"owner_id": user_id(current), "archived_at": None, "location": {"$exists": True}})
    return farm.get("location") if farm else None


@router.get("/weather")
@router.get("/weather/current")
async def weather_current(location_id: str | None = None, current=Depends(get_current_user), db=Depends(get_db)):
    location = await resolve_location(current, db, location_id)
    if not location: return {"available": False, "reason": "Add a profile or farm location to request weather."}
    coords = location.get("coordinates", {}).get("coordinates", [])
    if len(coords) != 2: return {"available": False, "reason": "Saved location has no valid coordinates."}
    data = await external_json(settings.weather_api_url, settings.weather_api_key, {"latitude": coords[1], "longitude": coords[0]})
    return {"available": bool(data), "data": data, "location": safe(location), "source": "configured_provider" if data else None, "reason": None if data else "Weather provider is unavailable or not configured."}


@router.get("/market/prices")
async def market_prices(crop: str | None = None, location_id: str | None = None, current=Depends(get_current_user), db=Depends(get_db)):
    location = await resolve_location(current, db, location_id)
    params = {"crop": crop} if crop else {}
    if location:
        params["district"] = location.get("district") or location.get("city") or ""
        params["state"] = location.get("state") or ""
    data = await external_json(settings.market_api_url, settings.market_api_key, params)
    return {"available": bool(data), "items": data if isinstance(data, list) else (data.get("items", []) if data else []), "source": "configured_provider" if data else None, "retrieved_at": now_utc().isoformat() if data else None, "reason": None if data else "No market-price provider is configured or reachable."}


@router.get("/schemes")
async def government_schemes(limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    location = await resolve_location(current, db)
    params = {"state": (location or {}).get("state", ""), "district": (location or {}).get("district", "")}
    live = await external_json(settings.schemes_api_url, settings.schemes_api_key, params)
    if live:
        rows = live if isinstance(live, list) else live.get("items", [])
        cutoff = now_utc() - timedelta(days=180)
        rows = [row for row in rows if row.get("active", True) and row.get("official_url") and row.get("last_verified") and _recently_verified(row.get("last_verified"), cutoff)]
        return {"items": rows[offset:offset + min(max(limit, 1), 100)], "total": len(rows), "limit": min(max(limit, 1), 100), "offset": max(offset, 0), "available": True, "source": "configured_provider"}
    # Only recently verified records with official URLs are exposed as current.
    cutoff = now_utc() - timedelta(days=180)
    return await paginated(db.schemes, {"active": True, "official_url": {"$exists": True}, "last_verified": {"$gte": cutoff}}, limit, offset, [("last_verified", -1)])


def _recently_verified(value, cutoff: datetime) -> bool:
    try:
        stamp = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if stamp.tzinfo is None: stamp = stamp.replace(tzinfo=timezone.utc)
        return stamp >= cutoff
    except (ValueError, TypeError):
        return False


@router.get("/schemes/{scheme_id}")
async def scheme_detail(scheme_id: str, current=Depends(get_current_user), db=Depends(get_db)):
    doc = await db.schemes.find_one({"_id": oid(scheme_id), "active": True, "official_url": {"$exists": True}, "last_verified": {"$gte": now_utc() - timedelta(days=180)}})
    if not doc: raise HTTPException(status_code=404, detail="Verified scheme not found")
    return safe(doc)


@router.get("/profile/security/sessions")
async def sessions(current=Depends(get_current_user), db=Depends(get_db)):
    rows = await db.sessions.find({"user_id": user_id(current), "revoked_at": None}, {"jti": 0}).sort("created_at", -1).to_list(length=100)
    return {"sessions": safe(rows), "note": "JWTs expire automatically; explicit logout revokes active sessions."}


@router.get("/help")
async def help_index():
    return {"topics": ["account", "farm-management", "crop-health", "marketplace", "transactions", "privacy"], "contact": None, "available": False, "reason": "No support contact channel is configured."}
