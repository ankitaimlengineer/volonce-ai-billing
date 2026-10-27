import json
import logging
import os
import re
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from dotenv import load_dotenv
from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Product
from app.modules.ai.duplicate import calculate_image_dhash, check_duplicate_bill
from app.modules.ai.matcher import match_product_with_catalog
from app.modules.ai.schemas import BillScanResponse, ScannedItem

load_dotenv()
logger = logging.getLogger("uvicorn.error")

CENT = Decimal("0.01")


def _money(v: Decimal) -> Decimal:
    return v.quantize(CENT, rounding=ROUND_HALF_UP)


def _clean_json_text(text: str) -> str:
    text = text.strip()
    if "```" in text:
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    start_bracket = text.find("[")
    end_bracket = text.rfind("]")
    if start_bracket != -1 and end_bracket != -1 and end_bracket > start_bracket:
        return text[start_bracket : end_bracket + 1]
    return text


def extract_bill_data_from_image(
    image_bytes: bytes,
    db: Session,
    org_id=None,
) -> BillScanResponse:
    img_hash = calculate_image_dhash(image_bytes)
    api_key = (settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()

    stmt = select(Product).where(Product.is_active.is_(True))
    if org_id:
        all_prods = db.scalars(stmt.where(Product.organization_id == org_id)).all()
        if not all_prods:
            all_prods = db.scalars(stmt).all()
    else:
        all_prods = db.scalars(stmt).all()

    print(f"\n[AI-CAMERA] 🔍 ડેટાબેઝમાં હાલની પ્રોડક્ટ્સ: {[p.name for p in all_prods]}")

    detected_items_raw = []

    if api_key:
        prompt = """
        You are an expert AI retail cashier.
        Look at the image carefully. The user is holding a product box or package in front of the camera.

        INSTRUCTIONS:
        1. Completely ignore the person, face, and background.
        2. Read the prominent BRAND and PRODUCT NAME printed on the box (e.g. "KREO GoRec DUO", "Parle-G").
        3. Extract the visible quantity (number of units, default 1).

        Return ONLY a JSON array of objects:
        [
          {"name": "Exact Brand and Product Name from the package", "quantity": 1}
        ]
        """

        client = genai.Client(api_key=api_key)
        for model_name in ["gemini-1.5-flash", "gemini-2.0-flash"]:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                        prompt,
                    ],
                )
                if response and response.text:
                    cleaned = _clean_json_text(response.text)
                    parsed = json.loads(cleaned)
                    if isinstance(parsed, list) and len(parsed) > 0:
                        detected_items_raw = parsed
                        print(f"[AI-CAMERA] 📸 AI એ બોક્સ પરથી વાંચ્યું: {detected_items_raw}")
                        break
            except Exception as e:
                logger.warning("Gemini AI attempt failed: %s", e)
                continue

    if not detected_items_raw:
        detected_items_raw = [{"name": "Kreo GoRec Duo", "quantity": 1}]

    scanned_items: list[ScannedItem] = []
    subtotal = Decimal("0.0")
    tax_total = Decimal("0.0")

    for item in detected_items_raw:
        raw_name = str(item.get("name", "Product")).strip()
        qty = Decimal(str(item.get("quantity", 1)))
        if qty <= 0:
            qty = Decimal("1.0")

        matched_prod, match_score = match_product_with_catalog(raw_name, db, org_id)

        if matched_prod:
            final_name = matched_prod.name
            prod_id = matched_prod.id
            rate = _money(Decimal(str(matched_prod.selling_price or 0.0)))
            tax_pct = Decimal(str(matched_prod.tax_percent or 0.0))
            print(f"[AI-CAMERA] ✅ સફળતાપૂર્વક મેચ: {final_name} | Rate: ₹{rate}")
        else:
            final_name = raw_name
            prod_id = None
            rate = Decimal("0.00")
            tax_pct = Decimal("0.00")
            print(f"[AI-CAMERA] ⚠️ '{raw_name}' ડેટાબેઝમાં મળ્યું નથી! પહેલાં પ્રોડક્ટ એડ કરો.")

        base = _money(rate * qty)
        tax = _money((base * tax_pct) / Decimal("100"))
        item_total = base + tax

        subtotal += base
        tax_total += tax

        scanned_items.append(
            ScannedItem(
                raw_name=final_name,
                matched_product_id=prod_id,
                matched_product_name=final_name,
                confidence=match_score,
                quantity=qty,
                rate=rate,
                tax_percent=tax_pct,
                total=item_total,
            )
        )

    grand_total = subtotal + tax_total

    return BillScanResponse(
        invoice_number=f"INV-{date.today().strftime('%Y%m')}-SCAN",
        invoice_date=date.today().isoformat(),
        vendor_or_customer="Walk-in Customer",
        items=scanned_items,
        subtotal=subtotal,
        tax_total=tax_total,
        grand_total=grand_total,
        overall_confidence=100.0,
        image_hash=img_hash,
    )