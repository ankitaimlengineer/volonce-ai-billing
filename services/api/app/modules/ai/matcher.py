from decimal import Decimal
from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Product


def match_product_with_catalog(
    raw_name: str,
    db: Session,
    org_id,
    threshold: float = 65.0,
):
    """
    Fuzzy matches raw OCR text against products in the organization's catalog.
    Returns matched Product, confidence (0-100), or None if below threshold.
    """
    if not raw_name or not raw_name.strip():
        return None, 0.0

    clean_name = raw_name.strip().lower()

    # Fetch active products for this organization
    products = db.scalars(
        select(Product).where(
            Product.organization_id == org_id,
            Product.is_active.is_(True),
        )
    ).all()

    best_product = None
    best_score = 0.0

    for prod in products:
        candidates = [prod.name.lower()]
        if prod.sku:
            candidates.append(prod.sku.lower())
        if prod.barcode:
            candidates.append(prod.barcode.lower())

        # Exact match
        for cand in candidates:
            if clean_name == cand:
                return prod, 100.0

            # Fuzzy comparison (Token Set Ratio handles reordered words well)
            score = fuzz.token_set_ratio(clean_name, cand)
            if score > best_score:
                best_score = score
                best_product = prod

    if best_score >= threshold and best_product is not None:
        return best_product, round(best_score, 1)

    return None, round(best_score, 1)