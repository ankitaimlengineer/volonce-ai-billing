import json
import os
from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.storage import storage
from app.models import Customer
from app.modules.sales.customers import outstanding

def match_customer_by_face(
    face_image_bytes: bytes,
    db: Session,
    org_id,
) -> dict | None:
    """
    Uses Gemini Vision to match the captured customer face 
    against registered customer photos in this organization.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    # Fetch customers who have registered photos
    customers = db.scalars(
        select(Customer).where(
            Customer.organization_id == org_id,
            Customer.is_active.is_(True),
            Customer.photo_key.is_not(None),
        )
    ).all()

    if not customers:
        return None

    try:
        client = genai.Client(api_key=api_key)

        # Prepare candidate images for Gemini
        candidate_parts = []
        customer_lookup = {}

        for c in customers:
            photo_data = storage.read(c.photo_key) if c.photo_key else None
            if photo_data:
                cid_str = str(c.id)
                customer_lookup[cid_str] = c
                candidate_parts.append(f"Candidate ID: {cid_str}")
                candidate_parts.append(types.Part.from_bytes(data=photo_data, mime_type="image/jpeg"))

        if not candidate_parts:
            return None

        prompt = """
        You are a face recognition AI for a retail store cashier.
        Compare the TARGET face image with the candidate customer images.
        Identify which candidate is the same person.
        
        Return ONLY a JSON object:
        {
          "matched_id": "candidate_id_string_or_null",
          "confidence": 95.0,
          "matched": true_or_false
        }
        """

        contents = [
            "Target Face Image to identify:",
            types.Part.from_bytes(data=face_image_bytes, mime_type="image/jpeg"),
            *candidate_parts,
            prompt,
        ]

        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=contents,
        )

        text_out = response.text.strip()
        if "```" in text_out:
            text_out = text_out.replace("```json", "").replace("```", "").strip()

        res_data = json.loads(text_out)

        matched_id = res_data.get("matched_id")
        if res_data.get("matched") and matched_id in customer_lookup:
            matched_cust = customer_lookup[matched_id]
            current_due = outstanding(db, org_id, matched_cust)
            return {
                "id": str(matched_cust.id),
                "name": matched_cust.name,
                "mobile": matched_cust.mobile,
                "outstanding": float(current_due),
                "confidence": float(res_data.get("confidence", 90.0)),
            }
        return None
    except Exception as e:
        print("Customer Face Match Error:", e)
        return None