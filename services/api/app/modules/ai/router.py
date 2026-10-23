from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.models import Organization
from app.modules.ai.ocr_engine import extract_bill_data_from_image
from app.modules.ai.schemas import BillScanResponse

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.post("/scan-bill", response_model=BillScanResponse)
async def scan_bill_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Accepts bill or product image from Laptop Camera or Mobile,
    processes Gemini Vision, item detection, catalog matching, and duplicate checks.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="માત્ર ઈમેજ ફાઈલો (JPG, PNG, WebP) જ અપલોડ કરી શકાય છે.",
        )

    contents = await file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ઈમેજ સાઈઝ 15MB કરતાં વધુ ન હોવી જોઈએ.",
        )

    # Automatically pick the active organization
    first_org = db.scalar(select(Organization))
    org_id = first_org.id if first_org else None

    result = extract_bill_data_from_image(
        image_bytes=contents,
        db=db,
        org_id=org_id,
    )

    return result