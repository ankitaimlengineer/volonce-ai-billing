import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.core.storage import detect_image_type, storage
from app.models import Customer, User
from app.modules.ai.customer_face import match_customer_by_face
from app.modules.ai.ocr_engine import extract_bill_data_from_image
from app.modules.ai.schemas import BillScanResponse

# router ને પહેલાં વ્યાખ્યાયિત (define) કરવું જરૂરી છે
router = APIRouter(prefix="/api/v1/ai", tags=["ai"])
can_write = require_roles("owner", "manager", "cashier")


@router.post("/scan-bill", response_model=BillScanResponse)
async def scan_bill_endpoint(
    file: UploadFile = File(...),
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    """
    Accepts bill or product image from Laptop Camera or Mobile,
    processes OCR, item detection, catalog matching, and duplicate checks.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="માત્ર ઈમેજ ફાઈલો (JPG, PNG, WebP) જ અપલોડ કરી શકાય છે.",
        )

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ઈમેજ સાઈઝ 10MB કરતાં વધુ ન હોવી જોઈએ.",
        )

    result = extract_bill_data_from_image(
        image_bytes=contents,
        db=db,
        org_id=user.organization_id,
    )

    return result


@router.post("/match-customer-face")
async def match_customer_face_endpoint(
    file: UploadFile = File(...),
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    """Matches a captured face against registered customers."""
    contents = await file.read()
    matched = match_customer_by_face(
        face_image_bytes=contents,
        db=db,
        org_id=user.organization_id,
    )
    return {
        "matched": bool(matched),
        "customer": matched,
    }


@router.post("/register-customer-face/{customer_id}")
async def register_customer_face(
    customer_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    """Registers / saves a customer face photo for future AI recognition."""
    cust = db.scalar(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.organization_id == user.organization_id,
        )
    )
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    contents = await file.read()
    ctype = detect_image_type(contents) or "image/jpeg"

    key = f"{user.organization_id}/customers/{cust.id}/{uuid.uuid4().hex}.jpg"
    storage.save(key, contents)

    cust.photo_key = key
    cust.photo_content_type = ctype
    db.commit()

    return {"success": True, "message": f"{cust.name} નો ચહેરો સફળતાપૂર્વક નોંધાઈ ગયો છે!"}