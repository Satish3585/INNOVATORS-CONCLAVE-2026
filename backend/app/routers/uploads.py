from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from app.common import now_utc, oid, safe, user_id
from app.config import settings
from app.database import get_db
from app.security import get_current_user

router = APIRouter()
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


@router.post("/uploads", status_code=201)
async def upload_image(file: UploadFile = File(...), current=Depends(get_current_user), db=Depends(get_db)):
    content_type = (file.content_type or "").lower()
    # Normalize if octet-stream with pdf extension
    if content_type == "application/octet-stream" and file.filename and file.filename.lower().endswith(".pdf"):
        content_type = "application/pdf"

    extension = ALLOWED_TYPES.get(content_type)
    if not extension:
        raise HTTPException(status_code=415, detail="Supported formats are PDF, JPEG, PNG, and WebP")
    content = await file.read(settings.max_upload_bytes + 1)
    if not content or len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File is empty or exceeds the upload limit")

    if extension == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise HTTPException(status_code=415, detail="Uploaded file is not a valid PDF document")
    else:
        try:
            import io
            image = Image.open(io.BytesIO(content))
            image.verify()
        except (UnidentifiedImageError, OSError, ValueError):
            raise HTTPException(status_code=415, detail="Uploaded file is not a valid image")
    upload_id = str(uuid4())
    root = Path(settings.upload_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{upload_id}{extension}"
    path.write_bytes(content)
    # Use UUID ids for unguessable media references while retaining MongoDB ownership filtering.
    doc = {"upload_id": upload_id, "owner_id": user_id(current), "relative_path": path.name, "filename": Path(file.filename or "image").name[:180], "content_type": file.content_type, "size_bytes": len(content), "created_at": now_utc()}
    await db.uploads.insert_one(doc)
    return {"upload_id": upload_id, "content_type": file.content_type, "size_bytes": len(content), "created_at": doc["created_at"]}


@router.get("/uploads/{upload_id}")
async def download_image(upload_id: str, db=Depends(get_db)):
    doc = await db.uploads.find_one({"upload_id": upload_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Upload not found")
    path = (Path(settings.upload_dir).resolve() / doc["relative_path"]).resolve()
    if path.parent != Path(settings.upload_dir).resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Upload file not found")
    return FileResponse(path, media_type=doc["content_type"], filename=doc["filename"])
