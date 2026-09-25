from datetime import datetime, timezone
from typing import Any
from bson import ObjectId
from fastapi import HTTPException


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Resource not found")
    return ObjectId(value)


def safe(document: Any) -> Any:
    if isinstance(document, ObjectId):
        return str(document)
    if isinstance(document, datetime):
        return document.isoformat()
    if isinstance(document, dict):
        result = {("id" if k == "_id" else k): safe(v) for k, v in document.items() if k != "password_hash"}
        return result
    if isinstance(document, list):
        return [safe(item) for item in document]
    if isinstance(document, tuple):
        return [safe(item) for item in document]
    return document


def user_id(user: dict) -> str:
    return str(user["_id"])


def owned_query(user: dict, extra: dict | None = None) -> dict:
    query = {"owner_id": user_id(user)}
    if extra:
        query.update(extra)
    return query


async def require_owned(db, collection: str, resource_id: str, user: dict, owner_field: str = "owner_id") -> dict:
    doc = await db[collection].find_one({"_id": oid(resource_id), owner_field: user_id(user)})
    if not doc:
        raise HTTPException(status_code=404, detail="Resource not found")
    return doc


async def audit(db, actor: dict, action: str, entity_type: str, entity_id: str | None = None, metadata: dict | None = None):
    await db.audit_logs.insert_one({"actor_id": user_id(actor), "action": action, "entity_type": entity_type, "entity_id": entity_id, "metadata": metadata or {}, "created_at": now_utc()})


async def notify(db, recipient_id: str, kind: str, title: str, message: str, reference_type: str | None = None, reference_id: str | None = None):
    await db.notifications.insert_one({"owner_id": recipient_id, "type": kind, "title": title, "message": message, "reference_type": reference_type, "reference_id": reference_id, "read_at": None, "created_at": now_utc()})


async def paginated(collection, query: dict, limit: int = 50, offset: int = 0, sort: list | None = None):
    limit, offset = min(max(limit, 1), 100), max(offset, 0)
    cursor = collection.find(query)
    if sort:
        cursor = cursor.sort(sort)
    rows = await cursor.skip(offset).limit(limit).to_list(length=limit)
    total = await collection.count_documents(query)
    return {"items": safe(rows), "total": total, "limit": limit, "offset": offset}


def mongo_values(value: Any) -> Any:
    from datetime import date, time
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    if isinstance(value, dict):
        return {key: mongo_values(item) for key, item in value.items()}
    if isinstance(value, list):
        return [mongo_values(item) for item in value]
    return value
