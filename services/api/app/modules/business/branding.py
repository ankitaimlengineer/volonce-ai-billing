import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.core.storage import detect_image_type, storage
from app.models import User
from app.modules.business.router import _get_org, _get_settings

router = APIRouter(prefix="/api/v1/business", tags=["business branding"])

owner_or_manager = require_roles("owner", "manager")
MAX_BYTES = 2 * 1024 * 1024  # 2 MB

# kind -> (key column, content-type column)
KINDS = {
    "logo": ("logo_key", "logo_content_type"),
    "signature": ("signature_key", "signature_content_type"),
}


async def _upload(kind: str, file: UploadFile, user: User, db: Session) -> dict:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 2 MB)")
    content_type = detect_image_type(data)
    if content_type is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PNG, JPG or WebP images are allowed"
        )

    org = _get_org(db, user)
    s = _get_settings(db, org)
    key_attr, type_attr = KINDS[kind]
    old_key = getattr(s, key_attr)

    # Server-generated key, scoped to this organization
    new_key = f"{org.id}/{kind}/{uuid.uuid4().hex}"
    storage.save(new_key, data)
    setattr(s, key_attr, new_key)
    setattr(s, type_attr, content_type)
    db.commit()

    if old_key:
        storage.delete(old_key)
    return {"kind": kind, "uploaded": True}


def _download(kind: str, user: User, db: Session) -> Response:
    org = _get_org(db, user)
    s = _get_settings(db, org)
    key_attr, type_attr = KINDS[kind]
    key = getattr(s, key_attr)
    data = storage.read(key) if key else None
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No {kind} uploaded")
    return Response(
        content=data,
        media_type=getattr(s, type_attr),
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


def _delete(kind: str, user: User, db: Session) -> None:
    org = _get_org(db, user)
    s = _get_settings(db, org)
    key_attr, type_attr = KINDS[kind]
    key = getattr(s, key_attr)
    setattr(s, key_attr, None)
    setattr(s, type_attr, None)
    db.commit()
    if key:
        storage.delete(key)


@router.get("/branding")
def branding_status(user: User = Depends(owner_or_manager), db: Session = Depends(get_db)):
    s = _get_settings(db, _get_org(db, user))
    db.commit()
    return {"has_logo": bool(s.logo_key), "has_signature": bool(s.signature_key)}


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    user: User = Depends(owner_or_manager),
    db: Session = Depends(get_db),
):
    return await _upload("logo", file, user, db)


@router.get("/logo")
def get_logo(user: User = Depends(owner_or_manager), db: Session = Depends(get_db)):
    return _download("logo", user, db)


@router.delete("/logo", status_code=status.HTTP_204_NO_CONTENT)
def delete_logo(user: User = Depends(owner_or_manager), db: Session = Depends(get_db)):
    _delete("logo", user, db)


@router.post("/signature")
async def upload_signature(
    file: UploadFile = File(...),
    user: User = Depends(owner_or_manager),
    db: Session = Depends(get_db),
):
    return await _upload("signature", file, user, db)


@router.get("/signature")
def get_signature(user: User = Depends(owner_or_manager), db: Session = Depends(get_db)):
    return _download("signature", user, db)


@router.delete("/signature", status_code=status.HTTP_204_NO_CONTENT)
def delete_signature(user: User = Depends(owner_or_manager), db: Session = Depends(get_db)):
    _delete("signature", user, db)