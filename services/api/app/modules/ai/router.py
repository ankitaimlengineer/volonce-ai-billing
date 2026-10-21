from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app.core.deps import get_db, require_roles
from app.models import User
from app.modules.ai.ocr_engine import extract_bill_data_from_image
from app.modules.ai.schemas import BillScanResponse

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