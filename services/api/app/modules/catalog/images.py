import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.storage import detect_image_type, storage
from app.models import Product, User
from app.modules.catalog.router import _org_id, _write_user, can_read

router = APIRouter(prefix="/api/v1/products", tags=["product images"])

MAX_BYTES = 2 * 1024 * 1024


def _product(db: Session, user: User, product_id: uuid.UUID) -> Product:
    # organization_id filter = tenant isolation
    p = db.scalar(
        select(Product).where(
            Product.id == product_id, Product.organization_id == _org_id(user)
        )
    )
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return p


@router.post("/{product_id}/image")
async def upload_image(
    product_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    product = _product(db, user, product_id)
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 2 MB)")
    content_type = detect_image_type(data)
    if content_type is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PNG, JPG or WebP images are allowed"
        )

    old_key = product.image_key
    new_key = f"{product.organization_id}/products/{product.id}/{uuid.uuid4().hex}"
    storage.save(new_key, data)
    product.image_key = new_key
    product.image_content_type = content_type
    db.commit()
    if old_key:
        storage.delete(old_key)
    return {"uploaded": True}


@router.get("/{product_id}/image")
def get_image(
    product_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    product = _product(db, user, product_id)
    data = storage.read(product.image_key) if product.image_key else None
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No image")
    return Response(
        content=data,
        media_type=product.image_content_type,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/{product_id}/image", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    product_id: uuid.UUID, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    product = _product(db, user, product_id)
    key = product.image_key
    product.image_key = None
    product.image_content_type = None
    db.commit()
    if key:
        storage.delete(key)