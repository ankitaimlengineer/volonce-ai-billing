import io
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Invoice, PurchaseInvoice
from app.modules.ai.schemas import DuplicateCheckResult


def calculate_image_dhash(image_bytes: bytes, hash_size: int = 8) -> str:
    """Computes difference hash (dHash) for fast visual duplicate detection."""
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("L")
        # Resize to (width + 1, height) to compare adjacent pixels
        resized = image.resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
        pixels = list(resized.getdata())

        difference = []
        for row in range(hash_size):
            for col in range(hash_size):
                pixel_left = pixels[row * (hash_size + 1) + col]
                pixel_right = pixels[row * (hash_size + 1) + col + 1]
                difference.append(pixel_left > pixel_right)

        decimal_value = 0
        hex_string = []
        for index, value in enumerate(difference):
            if value:
                decimal_value += 2 ** (index % 8)
            if (index % 8) == 7:
                hex_string.append(hex(decimal_value)[2:].rjust(2, "0"))
                decimal_value = 0

        return "".join(hex_string)
    except Exception:
        return ""


def check_duplicate_bill(
    db: Session,
    org_id,
    invoice_number: str | None,
    image_hash: str | None = None,
) -> DuplicateCheckResult:
    """Checks whether the invoice number already exists in Sales or Purchase for this business."""
    if not invoice_number:
        return DuplicateCheckResult(is_duplicate=False)

    clean_no = invoice_number.strip().lower()

    # Check Sales Invoices
    existing_sale = db.scalar(
        select(Invoice).where(
            Invoice.organization_id == org_id,
            Invoice.invoice_number.ilike(clean_no),
        )
    )
    if existing_sale:
        return DuplicateCheckResult(
            is_duplicate=True,
            reason=f"આ બિલ નંબર ({existing_sale.invoice_number}) વેચાણ (Sales) માં પહેલેથી નોંધાયેલું છે.",
            existing_invoice_id=existing_sale.id,
            existing_invoice_number=existing_sale.invoice_number,
        )

    # Check Purchase Invoices
    existing_purchase = db.scalar(
        select(PurchaseInvoice).where(
            PurchaseInvoice.organization_id == org_id,
            PurchaseInvoice.invoice_number.ilike(clean_no),
        )
    )
    if existing_purchase:
        return DuplicateCheckResult(
            is_duplicate=True,
            reason=f"આ બિલ નંબર ({existing_purchase.invoice_number}) ખરીદી (Purchase) માં પહેલેથી નોંધાયેલું છે.",
            existing_invoice_id=existing_purchase.id,
            existing_invoice_number=existing_purchase.invoice_number,
        )

    return DuplicateCheckResult(is_duplicate=False)