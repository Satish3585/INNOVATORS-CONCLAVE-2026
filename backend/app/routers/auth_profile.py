from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError
from app.common import mongo_values, now_utc, safe, user_id
from app.config import settings
from app.database import get_db
from app.schemas import LoginRequest, PreferencesPatch, ProfilePatch, RegisterRequest
from app.security import create_access_token, get_current_user, hash_password, require_roles, verify_password

router = APIRouter()


def profile_status(user: dict) -> dict:
    required = ["full_name", "preferred_language"]
    complete = all(user.get(key) for key in required)
    return {"complete": complete, "missing_fields": [key for key in required if not user.get(key)]}


@router.post("/auth/register", status_code=201)
async def register(payload: RegisterRequest, db=Depends(get_db)):
    now = now_utc()
    doc = {"full_name": payload.full_name.strip(), "email": str(payload.email).lower(), "password_hash": hash_password(payload.password), "role": payload.role.value, "date_of_birth": payload.date_of_birth, "gender": payload.gender, "phone": payload.phone, "preferred_language": payload.preferred_language, "profile_photo_url": None, "farmer_type": None, "farming_experience_years": None, "preferred_crops": [], "farming_interests": [], "status": "active", "created_at": now, "updated_at": now}
    if payload.location:
        doc["location"] = payload.location.as_geojson()
    doc = mongo_values(doc)
    try:
        result = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    await db.preferences.insert_one({"owner_id": str(result.inserted_id), "language": payload.preferred_language, "units": "metric", "notification_channels": ["in_app"], "created_at": now, "updated_at": now})
    user = await db.users.find_one({"_id": result.inserted_id}, {"password_hash": 0})
    return {"user": safe(user), "profile_completion": profile_status(user)}


@router.post("/auth/login")
async def login(payload: LoginRequest, db=Depends(get_db)):
    user = await db.users.find_one({"email": str(payload.email).lower()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")) or user.get("status") != "active":
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    jti = str(uuid4())
    token, expiry = create_access_token(str(user["_id"]), user["role"], jti)
    await db.sessions.insert_one({"jti": jti, "user_id": str(user["_id"]), "created_at": now_utc(), "expires_at": expiry, "revoked_at": None})
    safe_user = {k: v for k, v in user.items() if k != "password_hash"}
    return {"access_token": token, "token_type": "bearer", "expires_at": expiry, "user": safe(safe_user), "role": user["role"], "profile_completion": profile_status(user)}


@router.post("/auth/logout")
async def logout(current=Depends(get_current_user), db=Depends(get_db)):
    # Revoke every active session for the current user: client can then discard its token.
    await db.sessions.update_many({"user_id": user_id(current), "revoked_at": None}, {"$set": {"revoked_at": now_utc()}})
    return {"success": True, "message": "Sessions revoked; discard the access token on the client"}


@router.get("/profile/me")
async def get_profile(current=Depends(get_current_user)):
    return {"user": safe(current), "profile_completion": profile_status(current)}


@router.patch("/profile/me")
async def patch_profile(payload: ProfilePatch, current=Depends(get_current_user), db=Depends(get_db)):
    updates = payload.model_dump(exclude_unset=True)
    if "location" in updates and payload.location:
        updates["location"] = payload.location.as_geojson()
    updates = mongo_values(updates)
    updates["updated_at"] = now_utc()
    await db.users.update_one({"_id": current["_id"]}, {"$set": updates})
    user = await db.users.find_one({"_id": current["_id"]}, {"password_hash": 0})
    return {"user": safe(user), "profile_completion": profile_status(user)}


@router.get("/profile/preferences")
async def get_preferences(current=Depends(get_current_user), db=Depends(get_db)):
    result = await db.preferences.find_one({"owner_id": user_id(current)})
    return safe(result or {"owner_id": user_id(current), "units": "metric", "notification_channels": ["in_app"]})


@router.patch("/profile/preferences")
async def patch_preferences(payload: PreferencesPatch, current=Depends(get_current_user), db=Depends(get_db)):
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = now_utc()
    await db.preferences.update_one({"owner_id": user_id(current)}, {"$set": updates, "$setOnInsert": {"owner_id": user_id(current), "created_at": now_utc()}}, upsert=True)
    return safe(await db.preferences.find_one({"owner_id": user_id(current)}))


@router.get("/buyers/profile")
async def buyer_profile(current=Depends(require_roles("buyer"))):
    allowed = {"_id", "full_name", "email", "phone", "location", "business_name", "buyer_type", "preferred_crops", "profile_photo_url", "role"}
    return safe({key: value for key, value in current.items() if key in allowed})


@router.patch("/buyers/profile")
async def patch_buyer_profile(payload: ProfilePatch, current=Depends(require_roles("buyer")), db=Depends(get_db)):
    allowed = {"full_name", "profile_photo_url", "phone", "location", "business_name", "buyer_type", "preferred_crops"}
    updates = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if key in allowed}
    if "location" in updates and payload.location:
        updates["location"] = payload.location.as_geojson()
    updates = mongo_values(updates)
    updates["updated_at"] = now_utc()
    await db.users.update_one({"_id": current["_id"]}, {"$set": updates})
    return safe(await db.users.find_one({"_id": current["_id"]}, {"password_hash": 0}))
