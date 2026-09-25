from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from app.common import audit, mongo_values, now_utc, oid, owned_query, paginated, require_owned, safe, user_id
from app.database import get_db
from app.schemas import DocumentCreate
from app.security import get_current_user

router = APIRouter()


@router.get("/documents")
async def list_documents(
    farm_id: str | None = None,
    field_id: str | None = None,
    crop_id: str | None = None,
    doc_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    query = {"owner_id": user_id(current)}
    if farm_id:
        query["farm_id"] = farm_id
    if field_id:
        query["field_id"] = field_id
    if crop_id:
        query["crop_id"] = crop_id
    if doc_type:
        query["doc_type"] = doc_type

    page = await paginated(db.documents, query, limit, offset, [("created_at", -1)])
    # Enrich with upload filename and file link
    for item in page["items"]:
        upload = await db.uploads.find_one({"upload_id": item.get("file_upload_id")})
        if upload:
            item["filename"] = upload.get("filename")
            item["content_type"] = upload.get("content_type")
            item["size_bytes"] = upload.get("size_bytes")
            item["file_url"] = f"/api/uploads/{upload.get('upload_id')}"
    return page


@router.post("/documents", status_code=201)
async def create_document(payload: DocumentCreate, current=Depends(get_current_user), db=Depends(get_db)):
    # Verify upload exists and belongs to user
    upload = await db.uploads.find_one({"upload_id": payload.file_upload_id, "owner_id": user_id(current)})
    if not upload:
        raise HTTPException(status_code=404, detail="Upload file not found or unauthorized")

    # If linked to farm/field/crop, verify ownership
    if payload.farm_id:
        await require_owned(db, "farms", payload.farm_id, current)
    if payload.field_id:
        await require_owned(db, "fields", payload.field_id, current)
    if payload.crop_id:
        await require_owned(db, "crops", payload.crop_id, current)

    now = now_utc()
    doc = {
        "owner_id": user_id(current),
        "name": payload.name,
        "doc_type": payload.doc_type,
        "file_upload_id": payload.file_upload_id,
        "filename": upload.get("filename"),
        "content_type": upload.get("content_type"),
        "size_bytes": upload.get("size_bytes"),
        "farm_id": payload.farm_id,
        "field_id": payload.field_id,
        "crop_id": payload.crop_id,
        "notes": payload.notes,
        "status": payload.status or "verified",
        "created_at": now,
        "updated_at": now,
    }
    doc = mongo_values(doc)
    res = await db.documents.insert_one(doc)
    await audit(db, current, "document.created", "document", str(res.inserted_id))
    created = await db.documents.find_one({"_id": res.inserted_id})
    created_safe = safe(created)
    created_safe["file_url"] = f"/api/uploads/{payload.file_upload_id}"
    return created_safe


@router.get("/documents/{id}")
async def get_document(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    doc = await require_owned(db, "documents", id, current)
    upload = await db.uploads.find_one({"upload_id": doc.get("file_upload_id")})
    doc_safe = safe(doc)
    if upload:
        doc_safe["filename"] = upload.get("filename")
        doc_safe["content_type"] = upload.get("content_type")
        doc_safe["size_bytes"] = upload.get("size_bytes")
        doc_safe["file_url"] = f"/api/uploads/{upload.get('upload_id')}"
    return doc_safe


@router.delete("/documents/{id}")
async def delete_document(id: str, current=Depends(get_current_user), db=Depends(get_db)):
    doc = await require_owned(db, "documents", id, current)
    await db.documents.delete_one({"_id": doc["_id"], "owner_id": user_id(current)})
    await audit(db, current, "document.deleted", "document", id)
    return {"success": True, "id": id, "deleted": True}
