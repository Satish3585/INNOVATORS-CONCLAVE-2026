from datetime import datetime, timezone
import math
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument
from app.common import audit, mongo_values, now_utc, oid, notify, paginated, require_owned, safe, user_id
from app.database import get_db
from app.schemas import InterestCreate, ListingCreate, RequirementCreate, TransactionCreate
from app.security import get_current_user, require_roles

router = APIRouter()


def public_listing(item: dict) -> dict:
    item = dict(item)
    item.pop("owner_id", None)
    item.pop("farmer_id", None)
    item.pop("harvest_id", None)
    location = item.get("location")
    if isinstance(location, dict):
        location = dict(location)
        location.pop("coordinates", None)
        location.pop("latitude", None)
        location.pop("longitude", None)
        location.pop("accuracy_m", None)
        item["location"] = location
    if isinstance(item.get("seller"), dict):
        item["seller"].pop("id", None)
    return safe(item)


@router.post("/listings", status_code=201)
@router.post("/marketplace/listings", status_code=201)
async def create_listing(payload: ListingCreate, current=Depends(require_roles("farmer")), db=Depends(get_db)):
    harvest = await require_owned(db, "harvests", payload.harvest_id, current)
    crop = await require_owned(db, "crops", harvest.get("crop_id", ""), current)
    if payload.crop_name.strip().lower() != crop.get("crop_name", "").strip().lower():
        raise HTTPException(status_code=409, detail="Listing crop must match the harvested crop")
    update = await db.harvests.update_one({"_id": harvest["_id"], "owner_id": user_id(current), "$expr": {"$lte": [{"$add": [{"$ifNull": ["$listed_quantity", 0]}, payload.quantity]}, "$quantity"]}}, {"$inc": {"listed_quantity": payload.quantity}})
    if update.modified_count != 1:
        raise HTTPException(status_code=409, detail="Listing quantity exceeds unlisted harvest inventory")
    now = now_utc()
    listing = payload.model_dump(exclude_none=True)
    listing.update({"owner_id": user_id(current), "farmer_id": user_id(current), "harvest_id": payload.harvest_id, "remaining_quantity": payload.quantity, "status": "active", "location": payload.location.as_geojson() if payload.location else None, "created_at": now, "updated_at": now})
    listing = mongo_values(listing)
    try:
        result = await db.listings.insert_one(listing)
    except Exception:
        await db.harvests.update_one({"_id": harvest["_id"]}, {"$inc": {"listed_quantity": -payload.quantity}})
        raise
    await audit(db, current, "listing.created", "listing", str(result.inserted_id))
    return safe(await db.listings.find_one({"_id": result.inserted_id}))


@router.get("/listings")
@router.get("/marketplace/listings")
async def search_listings(crop: str | None = None, q: str | None = None, min_quantity: float | None = None, max_price: float | None = None, quality_grade: str | None = None, sort: str = "newest", latitude: float | None = None, longitude: float | None = None, radius_km: float | None = Query(default=None, gt=0, le=500), limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    query = {"status": "active", "remaining_quantity": {"$gt": 0}, "$and": [{"$or": [{"available_until": None}, {"available_until": {"$gt": now_utc()}}]}]}
    if crop: query["crop_name"] = {"$regex": crop, "$options": "i"}
    if q: query["$or"] = [{"crop_name": {"$regex": q, "$options": "i"}}, {"variety": {"$regex": q, "$options": "i"}}]
    if min_quantity is not None: query["remaining_quantity"]["$gte"] = min_quantity
    if max_price is not None: query["price_per_unit"] = {"$lte": max_price}
    if quality_grade: query["quality_grade"] = quality_grade
    if latitude is not None and longitude is not None and radius_km:
        query["location.coordinates"] = {"$near": {"$geometry": {"type": "Point", "coordinates": [longitude, latitude]}, "$maxDistance": int(radius_km * 1000)}}
    order = [("price_per_unit", 1)] if sort == "price_asc" else [("price_per_unit", -1)] if sort == "price_desc" else [("created_at", -1)]
    page = await paginated(db.listings, query, limit, offset, order)
    # Only publish seller display name and approximate location; never expose private account fields.
    seller_ids = {item.get("farmer_id") for item in page["items"] if item.get("farmer_id")}
    sellers = await db.users.find({"_id": {"$in": [oid(i) for i in seller_ids]}}, {"full_name": 1, "profile_photo_url": 1, "location.city": 1, "location.district": 1}).to_list(length=100)
    seller_map = {str(s["_id"]): safe(s) for s in sellers}
    for item in page["items"]:
        item["seller"] = seller_map.get(item.get("farmer_id"))
    page["items"] = [public_listing(item) for item in page["items"]]
    return page


@router.get("/listings/{id}")
@router.get("/marketplace/listings/{id}")
async def get_listing(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    listing = await db.listings.find_one({"_id": oid(id), "status": "active", "$or": [{"available_until": None}, {"available_until": {"$gt": now_utc()}}]})
    if not listing: raise HTTPException(status_code=404, detail="Listing not found")
    seller = await db.users.find_one({"_id": oid(listing["farmer_id"])}, {"full_name": 1, "profile_photo_url": 1, "location.city": 1, "location.district": 1})
    listing["seller"] = safe(seller)
    return public_listing(safe(listing))


@router.post("/listings/{id}/close")
async def close_listing(id: str, current=Depends(require_roles("farmer")), db=Depends(get_db)):
    listing = await db.listings.find_one({"_id": oid(id), "owner_id": user_id(current), "status": "active"})
    if not listing: raise HTTPException(status_code=404, detail="Active listing not found")
    if float(listing.get("reserved_quantity") or 0) > 0:
        raise HTTPException(status_code=409, detail="Listing has reserved transactions; complete or cancel them before closing")
    remainder = float(listing.get("remaining_quantity") or 0)
    changed = await db.listings.update_one({"_id": listing["_id"], "status": "active", "reserved_quantity": {"$in": [None, 0]}}, {"$set": {"status": "closed", "remaining_quantity": 0, "updated_at": now_utc()}})
    if changed.modified_count != 1: raise HTTPException(status_code=409, detail="Listing changed concurrently")
    released = await db.harvests.update_one({"_id": oid(listing["harvest_id"]), "owner_id": user_id(current), "listed_quantity": {"$gte": remainder}}, {"$inc": {"listed_quantity": -remainder}, "$set": {"updated_at": now_utc()}})
    if released.modified_count != 1:
        await db.listings.update_one({"_id": listing["_id"], "status": "closed"}, {"$set": {"status": "active", "remaining_quantity": remainder, "updated_at": now_utc()}})
        raise HTTPException(status_code=409, detail="Harvest inventory could not be released; listing was restored")
    await audit(db, current, "listing.closed", "listing", id, {"released_quantity": remainder})
    return safe(await db.listings.find_one({"_id": listing["_id"]}))


@router.post("/listings/{id}/interest", status_code=201)
@router.post("/marketplace/listings/{id}/interest", status_code=201)
async def express_interest(id: str, payload: InterestCreate, current=Depends(require_roles("buyer")), db=Depends(get_db)):
    listing = await db.listings.find_one({"_id": oid(id), "status": "active", "remaining_quantity": {"$gte": payload.quantity}, "$or": [{"available_until": None}, {"available_until": {"$gt": now_utc()}}]})
    if not listing: raise HTTPException(status_code=409, detail="Listing is unavailable or requested quantity exceeds remaining inventory")
    if listing["farmer_id"] == user_id(current): raise HTTPException(status_code=409, detail="Buyers cannot express interest in their own listing")
    now = now_utc()
    interest = {"listing_id": id, "buyer_id": user_id(current), "farmer_id": listing["farmer_id"], "requested_quantity": payload.quantity, "message": payload.message, "status": "pending", "created_at": now, "updated_at": now}
    result = await db.interests.insert_one(interest)
    await notify(db, listing["farmer_id"], "buyer_interest", "New buyer interest", "A buyer expressed interest in your produce listing.", "interest", str(result.inserted_id))
    return safe(await db.interests.find_one({"_id": result.inserted_id}))


@router.get("/marketplace/interests")
async def list_interests(side: str = "buyer", limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    if current["role"] == "buyer": query = {"buyer_id": user_id(current)}
    else: query = {"farmer_id": user_id(current)}
    page = await paginated(db.interests, query, limit, offset, [("created_at", -1)])
    for interest in page["items"]:
        if current["role"] == "farmer":
            buyer = await db.users.find_one({"_id": oid(interest["buyer_id"])}, {"full_name": 1, "business_name": 1, "buyer_type": 1})
            interest["buyer"] = safe(buyer)
            interest.pop("buyer_id", None)
        else:
            interest.pop("farmer_id", None)
    return page


@router.patch("/marketplace/interests/{id}")
async def update_interest(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    interest = await db.interests.find_one({"_id": oid(id), "$or": [{"farmer_id": user_id(current)}, {"buyer_id": user_id(current)}]})
    if not interest: raise HTTPException(status_code=404, detail="Interest not found")
    status = payload.get("status")
    allowed = {"farmer": {"accepted", "rejected"}, "buyer": {"cancelled"}}[current["role"]]
    if status not in allowed or interest.get("status") != "pending": raise HTTPException(status_code=409, detail="This interest transition is not allowed")
    await db.interests.update_one({"_id": interest["_id"]}, {"$set": {"status": status, "farmer_response": payload.get("message"), "updated_at": now_utc()}})
    await notify(db, interest["buyer_id"], "interest_update", "Interest updated", f"Your produce interest was {status}.", "interest", id)
    result = safe(await db.interests.find_one({"_id": interest["_id"]}))
    if current["role"] == "farmer":
        buyer = await db.users.find_one({"_id": oid(interest["buyer_id"])}, {"full_name": 1, "business_name": 1, "buyer_type": 1})
        result["buyer"] = safe(buyer)
        result.pop("buyer_id", None)
    else:
        result.pop("farmer_id", None)
    return result


@router.post("/requirements", status_code=201)
async def create_requirement(payload: RequirementCreate, current=Depends(require_roles("buyer")), db=Depends(get_db)):
    item = payload.model_dump(exclude_none=True)
    item.update({"owner_id": user_id(current), "status": "active", "location": payload.location.as_geojson() if payload.location else None, "created_at": now_utc(), "updated_at": now_utc()})
    item = mongo_values(item)
    result = await db.requirements.insert_one(item)
    return safe(await db.requirements.find_one({"_id": result.inserted_id}))


@router.get("/requirements")
async def list_requirements(limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    query = {"owner_id": user_id(current)} if current["role"] == "buyer" else {"status": "active"}
    page = await paginated(db.requirements, query, limit, offset, [("created_at", -1)])
    if current["role"] == "farmer":
        for item in page["items"]:
            item.pop("owner_id", None)
            location = item.get("location")
            if isinstance(location, dict):
                for key in ("coordinates", "latitude", "longitude", "accuracy_m"):
                    location.pop(key, None)
    return page


@router.patch("/requirements/{id}")
async def patch_requirement(id: str, payload: dict, current=Depends(require_roles("buyer")), db=Depends(get_db)):
    requirement = await require_owned(db, "requirements", id, current)
    allowed = {"crop_name", "quantity", "quantity_min", "quantity_max", "unit", "target_price", "quality_grade", "max_distance_km", "currency", "needed_by", "location", "notes", "status"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    updates["updated_at"] = now_utc()
    await db.requirements.update_one({"_id": requirement["_id"]}, {"$set": updates})
    return safe(await db.requirements.find_one({"_id": requirement["_id"]}))


@router.get("/matches")
@router.get("/matching")
async def match_requirements(requirement_id: str | None = None, current=Depends(get_current_user), db=Depends(get_db)):
    if current["role"] == "buyer":
        query = {"owner_id": user_id(current), "status": "active"}
        if requirement_id: query["_id"] = oid(requirement_id)
        requirements = await db.requirements.find(query).to_list(length=100)
    else:
        requirements = await db.requirements.find({"status": "active"}).to_list(length=100)
    results = []
    for requirement in requirements:
        listings = await db.listings.find({"status": "active", "remaining_quantity": {"$gt": 0}, "crop_name": {"$regex": f"^{requirement['crop_name']}$", "$options": "i"}}).limit(100).to_list(length=100)
        matches = []
        for listing in listings:
            minimum = requirement.get("quantity_min") or requirement["quantity"]
            maximum = requirement.get("quantity_max")
            quantity_sufficient = listing["remaining_quantity"] >= minimum
            quantity_range_match = quantity_sufficient and (maximum is None or listing["remaining_quantity"] <= maximum)
            budget_ok = not requirement.get("target_price") or listing["price_per_unit"] <= requirement["target_price"]
            grade_ok = not requirement.get("quality_grade") or listing.get("quality_grade") == requirement.get("quality_grade")
            distance = None
            max_distance = requirement.get("max_distance_km")
            req_coords = (requirement.get("location") or {}).get("coordinates", {}).get("coordinates", [])
            list_coords = (listing.get("location") or {}).get("coordinates", {}).get("coordinates", [])
            distance_ok = max_distance is None
            if max_distance is not None and len(req_coords) == 2 and len(list_coords) == 2:
                lon1, lat1 = map(math.radians, [req_coords[0], req_coords[1]])
                lon2, lat2 = map(math.radians, [list_coords[0], list_coords[1]])
                a = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
                distance = 6371.0 * 2 * math.asin(math.sqrt(a))
                distance_ok = distance <= max_distance
            all_match = quantity_range_match and budget_ok and grade_ok and distance_ok
            matches.append({"listing": public_listing(safe(listing)), "match_type": "exact" if all_match else "partial", "quantity_sufficient": quantity_sufficient, "quantity_range_match": quantity_range_match, "price_within_target": budget_ok, "quality_grade_match": grade_ok, "distance_km_approx": round(distance, 1) if distance is not None else None, "distance_verified": distance is not None})
        public_requirement = safe(requirement)
        if current["role"] == "farmer":
            public_requirement.pop("owner_id", None)
            location = public_requirement.get("location")
            if isinstance(location, dict):
                for key in ("coordinates", "latitude", "longitude", "accuracy_m"):
                    location.pop(key, None)
        results.append({"requirement": public_requirement, "matches": matches, "match_status": "matches_found" if matches else "no_match", "guaranteed": False})
    return {"items": results}


@router.post("/transactions", status_code=201)
async def create_transaction(payload: TransactionCreate, current=Depends(require_roles("buyer")), db=Depends(get_db)):
    accepted_interest = await db.interests.find_one_and_update({"listing_id": payload.listing_id, "buyer_id": user_id(current), "status": "accepted", "requested_quantity": {"$gte": payload.quantity}}, {"$set": {"status": "converted_to_transaction", "updated_at": now_utc()}}, return_document=ReturnDocument.BEFORE)
    if not accepted_interest:
        raise HTTPException(status_code=409, detail="The farmer must accept this buyer's interest before a transaction can be created")
    # A single conditional update reserves inventory without allowing concurrent over-selling.
    listing = await db.listings.find_one_and_update({"_id": oid(payload.listing_id), "status": "active", "remaining_quantity": {"$gte": payload.quantity}, "farmer_id": {"$ne": user_id(current)}, "$or": [{"available_until": None}, {"available_until": {"$gt": now_utc()}}]}, {"$inc": {"remaining_quantity": -payload.quantity, "reserved_quantity": payload.quantity}, "$set": {"updated_at": now_utc()}}, return_document=ReturnDocument.AFTER)
    if not listing:
        await db.interests.update_one({"_id": accepted_interest["_id"], "status": "converted_to_transaction"}, {"$set": {"status": "accepted", "updated_at": now_utc()}})
        raise HTTPException(status_code=409, detail="Listing has insufficient available inventory")
    now = now_utc()
    transaction = {"listing_id": payload.listing_id, "harvest_id": listing["harvest_id"], "farmer_id": listing["farmer_id"], "buyer_id": user_id(current), "crop_name": listing["crop_name"], "quantity": payload.quantity, "unit": listing["unit"], "agreed_price_per_unit": payload.agreed_price_per_unit, "currency": payload.currency, "total_amount": round(payload.quantity * payload.agreed_price_per_unit, 2), "status": "created", "status_history": [{"status": "created", "at": now}], "created_at": now, "updated_at": now}
    try:
        result = await db.transactions.insert_one(transaction)
    except Exception:
        await db.listings.update_one({"_id": listing["_id"]}, {"$inc": {"remaining_quantity": payload.quantity, "reserved_quantity": -payload.quantity}})
        await db.interests.update_one({"_id": accepted_interest["_id"], "status": "converted_to_transaction"}, {"$set": {"status": "accepted", "updated_at": now_utc()}})
        raise
    await notify(db, listing["farmer_id"], "transaction", "Transaction created", "A buyer created a transaction for your listing.", "transaction", str(result.inserted_id))
    await audit(db, current, "transaction.created", "transaction", str(result.inserted_id))
    return safe(await db.transactions.find_one({"_id": result.inserted_id}))


@router.get("/transactions")
async def list_transactions(limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    field = "farmer_id" if current["role"] == "farmer" else "buyer_id"
    return await paginated(db.transactions, {field: user_id(current)}, limit, offset, [("created_at", -1)])


@router.patch("/transactions/{id}/status")
async def update_transaction_status(id: str, payload: dict, current=Depends(get_current_user), db=Depends(get_db)):
    tx = await db.transactions.find_one({"_id": oid(id), "$or": [{"farmer_id": user_id(current)}, {"buyer_id": user_id(current)}]})
    if not tx: raise HTTPException(status_code=404, detail="Transaction not found")
    new_status = payload.get("status")
    transitions = {"created": {"confirmed", "cancelled"}, "confirmed": {"completed", "cancelled"}}
    if new_status not in transitions.get(tx["status"], set()): raise HTTPException(status_code=409, detail="Transaction status transition is not allowed")
    if new_status == "confirmed" and current["role"] != "farmer": raise HTTPException(status_code=403, detail="Only the seller can confirm a transaction")
    if new_status == "completed" and current["role"] != "buyer": raise HTTPException(status_code=403, detail="Only the buyer can confirm receipt")
    now = now_utc()
    claimed = await db.transactions.update_one({"_id": tx["_id"], "status": tx["status"]}, {"$set": {"status": f"transitioning:{new_status}", "updated_at": now}})
    if claimed.modified_count != 1: raise HTTPException(status_code=409, detail="Transaction was updated concurrently")
    # Cancellation restores the reserved amount to the active listing. A payment is never taken here.
    inventory_compensation = None
    try:
        if new_status == "cancelled":
            changed = await db.listings.update_one({"_id": oid(tx["listing_id"])}, {"$inc": {"remaining_quantity": tx["quantity"], "reserved_quantity": -tx["quantity"]}, "$set": {"updated_at": now}})
            if changed.modified_count != 1: raise HTTPException(status_code=409, detail="Listing inventory is unavailable for cancellation")
            inventory_compensation = {"remaining_quantity": -tx["quantity"], "reserved_quantity": tx["quantity"]}
        elif new_status == "completed":
            changed = await db.listings.update_one({"_id": oid(tx["listing_id"])}, {"$inc": {"reserved_quantity": -tx["quantity"], "sold_quantity": tx["quantity"]}, "$set": {"updated_at": now}})
            if changed.modified_count != 1: raise HTTPException(status_code=409, detail="Listing inventory is unavailable for completion")
            inventory_compensation = {"reserved_quantity": tx["quantity"], "sold_quantity": -tx["quantity"]}
        stored = await db.transactions.update_one({"_id": tx["_id"], "status": f"transitioning:{new_status}"}, {"$set": {"status": new_status, "updated_at": now}, "$push": {"status_history": {"status": new_status, "at": now, "actor_id": user_id(current)}}})
        if stored.modified_count != 1: raise HTTPException(status_code=409, detail="Transaction status could not be finalized")
    except Exception:
        if inventory_compensation:
            await db.listings.update_one({"_id": oid(tx["listing_id"])}, {"$inc": inventory_compensation, "$set": {"updated_at": now_utc()}})
        await db.transactions.update_one({"_id": tx["_id"], "status": f"transitioning:{new_status}"}, {"$set": {"status": tx["status"], "updated_at": now_utc()}})
        raise
    other_id = tx["buyer_id"] if current["role"] == "farmer" else tx["farmer_id"]
    await notify(db, other_id, "transaction", "Transaction status updated", f"Transaction status: {new_status}.", "transaction", id)
    return safe(await db.transactions.find_one({"_id": tx["_id"]}))


@router.get("/buyers/dashboard")
async def buyer_dashboard(current=Depends(require_roles("buyer")), db=Depends(get_db)):
    owner = user_id(current)
    return {"active_requirements": await db.requirements.count_documents({"owner_id": owner, "status": "active"}), "pending_interests": await db.interests.count_documents({"buyer_id": owner, "status": "pending"}), "active_transactions": await db.transactions.count_documents({"buyer_id": owner, "status": {"$in": ["created", "confirmed"]}}), "unread_notifications": await db.notifications.count_documents({"owner_id": owner, "read_at": None}), "matching": await match_requirements(None, current, db)}
