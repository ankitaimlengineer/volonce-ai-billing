import uuid
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.core.storage import detect_image_type, storage
from app.models import (
    AiDetection,
    BillDraft,
    BillDraftItem,
    CameraImage,
    CameraSession,
    Customer,
    Product,
    Shop,
    User,
)
from app.modules.ai.customer_face import match_customer_by_face
from app.modules.ai.duplicate import calculate_image_dhash
from app.modules.ai.ocr_engine import extract_bill_data_from_image
from app.modules.ai.schemas import (
    BillScanResponse,
    CameraSessionCreate,
    CameraSessionOut,
    DraftBillOut,
    DraftBillUpdate,
)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])
can_write = require_roles("owner", "manager", "cashier")

CENT = Decimal("0.01")


def _money(v: Decimal) -> Decimal:
    return v.quantize(CENT, rounding=ROUND_HALF_UP)


# ---------------- ૧. સિંગલ ફોટો ક્વિક સ્કેન (લેગસી + ફાસ્ટ POS માટે) ----------------

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


# ---------------- ૨. ફેસ રેકગ્નિશન (ગ્રાહક ચહેરો ઓળખવો / સેવ કરવો) ----------------

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


# ---------------- ૩. PHASE 10: CAMERA SESSIONS & MULTI-PHOTO DRAFTS ----------------

@router.post("/sessions", response_model=CameraSessionOut, status_code=status.HTTP_201_CREATED)
def create_camera_session(
    data: CameraSessionCreate,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    """Starts a new camera billing session (Single or Multiple photo mode)."""
    shop_id = db.scalar(
        select(Shop.id).where(
            Shop.organization_id == user.organization_id, Shop.is_default.is_(True)
        )
    )

    session = CameraSession(
        organization_id=user.organization_id,
        shop_id=shop_id,
        user_id=user.id,
        customer_id=data.customer_id,
        mode=data.mode,
        status="active",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/sessions/{session_id}/add-image")
async def add_image_to_session(
    session_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    """
    Adds a photo to session, checks duplicate photo hash,
    runs AI detection and updates the consolidated draft bill.
    """
    session = db.scalar(
        select(CameraSession).where(
            CameraSession.id == session_id,
            CameraSession.organization_id == user.organization_id,
            CameraSession.status == "active",
        )
    )
    if not session:
        raise HTTPException(status_code=404, detail="Active camera session not found")

    contents = await file.read()
    ctype = detect_image_type(contents) or "image/jpeg"
    img_hash = calculate_image_dhash(contents)

    # ડુપ્લિકેટ ફોટો ચેક (Silent double counting અટકાવવા માટે)
    is_duplicate = False
    existing_img = db.scalar(
        select(CameraImage).where(
            CameraImage.session_id == session.id,
            CameraImage.image_hash == img_hash,
        )
    )
    if existing_img:
        is_duplicate = True

    key = f"{user.organization_id}/sessions/{session.id}/{uuid.uuid4().hex}.jpg"
    storage.save(key, contents)

    image_record = CameraImage(
        session_id=session.id,
        storage_key=key,
        content_type=ctype,
        image_hash=img_hash,
        is_duplicate=is_duplicate,
        status="analyzed",
    )
    db.add(image_record)
    db.flush()

    # AI ડિટેક્શન રન કરો
    scan_res = extract_bill_data_from_image(contents, db, user.organization_id)

    # ડીટેક્શન સ્ટોર કરો
    for item in scan_res.items:
        db.add(
            AiDetection(
                image_id=image_record.id,
                raw_name=item.raw_name,
                matched_product_id=item.matched_product_id,
                detected_quantity=item.quantity,
                confidence=item.confidence,
            )
        )

    # સેશનનું કન્સોલિડેટેડ ડ્રાફ્ટ બિલ અપડેટ કરો
    draft = db.scalar(select(BillDraft).where(BillDraft.session_id == session.id))
    if not draft:
        draft = BillDraft(
            organization_id=user.organization_id,
            session_id=session.id,
            customer_id=session.customer_id,
            status="draft",
        )
        db.add(draft)
        db.flush()

    # ડ્રાફ્ટ આઇટમ્સ ભેગી કરો (Consolidate items without duplicate confusion)
    for it in scan_res.items:
        # જો પહેલેથી ડ્રાફ્ટમાં હોય તો જથ્થો વધારો, નહિતર નવી લાઇન ઉમેરો
        existing_draft_item = db.scalar(
            select(BillDraftItem).where(
                BillDraftItem.draft_id == draft.id,
                BillDraftItem.name == (it.matched_product_name or it.raw_name),
            )
        )
        if existing_draft_item and not is_duplicate:
            existing_draft_item.quantity += it.quantity
            base = existing_draft_item.rate * existing_draft_item.quantity
            tax = (base * existing_draft_item.tax_percent) / Decimal("100")
            existing_draft_item.tax_amount = _money(tax)
            existing_draft_item.total = _money(base + tax)
        else:
            db.add(
                BillDraftItem(
                    draft_id=draft.id,
                    product_id=it.matched_product_id,
                    name=it.matched_product_name or it.raw_name,
                    quantity=it.quantity,
                    rate=it.rate,
                    tax_percent=it.tax_percent,
                    tax_amount=round((it.rate * it.quantity * it.tax_percent) / Decimal("100"), 2),
                    total=it.total,
                    confidence=it.confidence,
                )
            )

    db.flush()

    # ડ્રાફ્ટ ટોટલ્સ ગણો
    draft_items = db.scalars(select(BillDraftItem).where(BillDraftItem.draft_id == draft.id)).all()
    subtotal = sum((_money(di.rate * di.quantity) for di in draft_items), Decimal("0.0"))
    tax_total = sum((di.tax_amount for di in draft_items), Decimal("0.0"))
    grand_total = subtotal + tax_total

    draft.subtotal = subtotal
    draft.tax_total = tax_total
    draft.grand_total = grand_total

    db.commit()

    return {
        "success": True,
        "session_id": str(session.id),
        "image_id": str(image_record.id),
        "is_duplicate_photo": is_duplicate,
        "items_detected_in_photo": len(scan_res.items),
        "draft_id": str(draft.id),
    }


@router.get("/sessions/{session_id}/draft", response_model=DraftBillOut)
def get_session_draft_bill(
    session_id: uuid.UUID,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    """Fetches the aggregated draft bill for human review."""
    draft = db.scalar(
        select(BillDraft).where(
            BillDraft.session_id == session_id,
            BillDraft.organization_id == user.organization_id,
        )
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Draft bill not found for this session")

    items = db.scalars(select(BillDraftItem).where(BillDraftItem.draft_id == draft.id)).all()
    out = DraftBillOut.model_validate(draft, from_attributes=True)
    out.items = items
    return out


@router.put("/drafts/{draft_id}", response_model=DraftBillOut)
def update_draft_bill(
    draft_id: uuid.UUID,
    data: DraftBillUpdate,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    """Allows shopkeeper to edit/modify quantities, rates and items before confirming."""
    draft = db.scalar(
        select(BillDraft).where(
            BillDraft.id == draft_id,
            BillDraft.organization_id == user.organization_id,
        )
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Draft bill not found")

    if data.customer_id is not None:
        draft.customer_id = data.customer_id

    # જૂની આઇટમ્સ હટાવી નવી સુધારેલી આઇટમ્સ સેવ કરો
    db.query(BillDraftItem).filter(BillDraftItem.draft_id == draft.id).delete()

    subtotal = Decimal("0.0")
    tax_total = Decimal("0.0")

    for it in data.items:
        base = _money(it.quantity * it.rate)
        tax = _money((base * it.tax_percent) / Decimal("100"))
        line_total = base + tax
        subtotal += base
        tax_total += tax

        db.add(
            BillDraftItem(
                draft_id=draft.id,
                product_id=it.product_id,
                name=it.name,
                quantity=it.quantity,
                rate=it.rate,
                tax_percent=it.tax_percent,
                tax_amount=tax,
                total=line_total,
                confidence=100.0,
            )
        )

    draft.subtotal = subtotal
    draft.tax_total = tax_total
    draft.grand_total = subtotal + tax_total

    db.commit()
    db.refresh(draft)

    items = db.scalars(select(BillDraftItem).where(BillDraftItem.draft_id == draft.id)).all()
    out = DraftBillOut.model_validate(draft, from_attributes=True)
    out.items = items
    return out