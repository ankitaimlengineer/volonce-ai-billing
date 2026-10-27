import re
from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Product


def _clean(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return " ".join(cleaned.split())


def match_product_with_catalog(
    raw_name: str,
    db: Session,
    org_id=None,
    threshold: float = 40.0,
) -> tuple[Product | None, float]:
    if not raw_name or not raw_name.strip():
        return None, 0.0

    clean_raw = _clean(raw_name)
    raw_words = set(clean_raw.split())

    stmt = select(Product).where(Product.is_active.is_(True))
    if org_id:
        products = db.scalars(stmt.where(Product.organization_id == org_id)).all()
        if not products:
            products = db.scalars(stmt).all()
    else:
        products = db.scalars(stmt).all()

    if not products:
        return None, 0.0

    best_prod = None
    best_score = 0.0

    for prod in products:
        p_name = _clean(prod.name)
        p_words = set(p_name.split())

        # Exact match
        if p_name == clean_raw:
            return prod, 100.0

        # મહત્વના શબ્દોની મેચિંગ (Kreo, GoRec, Duo)
        common = raw_words.intersection(p_words)
        meaningful = [w for w in common if len(w) > 2]
        if meaningful:
            score = 80.0 + min(20.0, len(meaningful) * 10.0)
            if score > best_score:
                best_score = score
                best_prod = prod

        score_fuzz = fuzz.token_set_ratio(clean_raw, p_name)
        if score_fuzz > best_score:
            best_score = score_fuzz
            best_prod = prod

    # જો સ્કોર 40% કે તેથી વધુ હોય તો જ મેચ કરો
    if best_score >= threshold and best_prod is not None:
        return best_prod, round(best_score, 1)

    # ખોટો Urea ફૉલબેક કાઢી નાખ્યો છે!
    return None, 0.0