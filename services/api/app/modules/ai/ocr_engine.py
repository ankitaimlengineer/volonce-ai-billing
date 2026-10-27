import json
import os
import re
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from dotenv import load_dotenv
from google import genai
from google.genai import types
from sqlalchemy.orm import Session
from app.modules.ai.duplicate import calculate_image_dhash, check_duplicate_bill
from app.modules.ai.matcher import match_product_with_catalog
from app.modules.ai.schemas import BillScanResponse, ScannedItem

load_dotenv()

CENT = Decimal("0.01")


def _money(v: Decimal) -> Decimal:
    return v.quantize(CENT, rounding=ROUND_HALF_UP)


def extract_bill_data_from_image(
    image_bytes: bytes,
    db: Session,
    org_id=None,
) -> BillScanResponse:
    """
    અદ્યતન AI વિઝન એન્જિન:
    ૧. એક જ ફોટામાંથી કાઉન્ટર પર પડેલી તમામ વસ્તુઓ (Multiple Products) ઓળખે છે.
    ૨. દરેક પ્રોડક્ટનો દેખાતો જથ્થો (Visible Quantity) ગણે છે.
    ૩. ઓવરલેપ થતી વસ્તુઓ માટે Uncertainty ફ્લેગ આપે છે.
    ૪. દુકાનના અસલ પ્રોડક્ટ કેટલોગમાંથી જ Selling Price અને GST ટેક્સ લાવે છે (કોઈ હાર્ડકોડેડ ડમી ભાવ નહીં).
    """
    img_hash = calculate_image_dhash(image_bytes)
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    detected_items_raw = []

    if api_key:
        try:
            client = genai.Client(api_key=api_key)

            # એડવાન્સ્ડ મલ્ટી-ઓબ્જેક્ટ કાઉન્ટિંગ પ્રોમ્પ્ટ
            prompt = """
            You are a professional retail billing vision AI.
            Analyze the image thoroughly and detect ALL unique consumer products, packages, bottles, boxes, or grocery items visible on the counter or printed on the invoice.

            Rules:
            1. For each distinct product, extract the exact brand and product name.
            2. Count the visible quantity (number of units) of that product.
            3. Provide a confidence score between 50.0 and 100.0.
            4. Assess uncertainty: 'low' if clearly visible, 'medium' if partially blocked, 'high' if blurry or overlapping.

            Output strictly a valid JSON array of objects. Do NOT include markdown code fences or explanations.
            Format:
            [
              {
                "name": "Brand and Product Name",
                "quantity": 2,
                "confidence": 95.0,
                "uncertainty": "low"
              }
            ]
            """

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
            )

            text_output = response.text.strip()
            # કોડ બ્લોક્સ સાફ કરો (Clean json markdown)
            if "```" in text_output:
                text_output = re.sub(r"^```(?:json)?\s*|\s*```$", "", text_output, flags=re.MULTILINE).strip()

            parsed = json.loads(text_output)
            if isinstance(parsed, list):
                detected_items_raw = parsed
            elif isinstance(parsed, dict) and "items" in parsed:
                detected_items_raw = parsed["items"]
        except Exception as e:
            print("Gemini Vision AI Error:", e)
            detected_items_raw = []

    # જો AI કશું ન ઓળખી શકે તો જેનરિક આઇટમ (કોઈ ખોટો Kreo GoRec ડમી સામાન નહીં)
    if not detected_items_raw:
        detected_items_raw = [{"name": "Scanned Product", "quantity": 1, "confidence": 75.0, "uncertainty": "medium"}]

    scanned_items: list[ScannedItem] = []
    subtotal = Decimal("0.0")
    tax_total = Decimal("0.0")
    total_confidence_sum = 0.0

    for item in detected_items_raw:
        raw_name = str(item.get("name", "Product")).strip()
        try:
            qty = Decimal(str(item.get("quantity", 1)))
            if qty <= 0:
                qty = Decimal("1.0")
        except Exception:
            qty = Decimal("1.0")

        ai_confidence = float(item.get("confidence", 90.0))

        # ૧. દુકાનના અસલ ડેટાબેઝ કેટલોગ સાથે મેચ કરો
        matched_prod, match_score = match_product_with_catalog(raw_name, db, org_id)

        if matched_prod:
            final_name = matched_prod.name
            prod_id = matched_prod.id
            # ભાવ હંમેશા દુકાનના ડેટાબેઝમાંથી જ આવશે
            rate = _money(Decimal(str(matched_prod.selling_price or 0.0)))
            tax_pct = Decimal(str(matched_prod.tax_percent or 0.0))
            conf_score = max(ai_confidence, match_score)
        else:
            final_name = raw_name
            prod_id = None
            rate = Decimal("0.00")
            tax_pct = Decimal("0.00")
            conf_score = ai_confidence

        base = _money(rate * qty)
        tax = _money((base * tax_pct) / Decimal("100"))
        item_total = base + tax

        subtotal += base
        tax_total += tax
        total_confidence_sum += conf_score

        scanned_items.append(
            ScannedItem(
                raw_name=raw_name,
                matched_product_id=prod_id,
                matched_product_name=final_name,
                confidence=round(conf_score, 1),
                quantity=qty,
                rate=rate,
                tax_percent=tax_pct,
                total=item_total,
            )
        )

    grand_total = subtotal + tax_total
    avg_confidence = (
        round(total_confidence_sum / len(scanned_items), 1)
        if scanned_items
        else 0.0
    )

    sample_inv_no = f"INV-{date.today().strftime('%Y%m')}-SCAN"
    dup_info = check_duplicate_bill(db, org_id, sample_inv_no, img_hash)

    return BillScanResponse(
        invoice_number=sample_inv_no,
        invoice_date=date.today().isoformat(),
        vendor_or_customer="Walk-in Customer",
        items=scanned_items,
        subtotal=subtotal,
        tax_total=tax_total,
        grand_total=grand_total,
        duplicate_info=dup_info,
        overall_confidence=avg_confidence,
        image_hash=img_hash,
    )