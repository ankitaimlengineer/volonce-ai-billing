import csv
import io
import json
import uuid
from decimal import Decimal, InvalidOperation

COLUMNS = [
    "name", "sku", "barcode", "brand", "category", "unit", "pack_size",
    "purchase_price", "selling_price", "mrp", "tax_percent", "min_stock",
    "aliases", "search_keywords", "attributes",
]

MAX_ROWS = 2000


def safe_cell(value) -> str:
    """Stop Excel from running a cell as a formula (CSV injection)."""
    text = "" if value is None else str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


def build_csv(rows: list[list]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(COLUMNS)
    for row in rows:
        writer.writerow([safe_cell(v) for v in row])
    return buf.getvalue()


def template_csv() -> str:
    return build_csv(
        [[
            "Parle-G", "PG001", "", "Parle", "Grocery", "pcs", "100g",
            "8.50", "10", "10", "5", "20",
            "parle|biscuit", "glucose biscuit", '{"size": "100g"}',
        ]]
    )


def _dec(value: str, field: str, errors: list[str], line: int,
         default: Decimal | None = Decimal("0"), maximum: Decimal | None = None):
    value = (value or "").strip()
    if value == "":
        return default
    try:
        d = Decimal(value)
    except InvalidOperation:
        errors.append(f"Line {line}: {field} number nathi ('{value}')")
        return default
    if d < 0 or (maximum is not None and d > maximum) or not d.is_finite():
        errors.append(f"Line {line}: {field} valid range ma nathi")
        return default
    return d


def parse_csv(text: str, category_ids: dict[str, uuid.UUID]):
    """Return (rows, errors). category_ids maps lower-case name -> id."""
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "name" not in [f.strip().lower() for f in reader.fieldnames]:
        return [], ["CSV ma 'name' column hovu joiye. Template download karo."]

    rows: list[dict] = []
    errors: list[str] = []
    seen_skus: set[str] = set()

    for index, raw in enumerate(reader, start=2):  # line 1 = header
        if index - 1 > MAX_ROWS:
            errors.append(f"Maximum {MAX_ROWS} rows j allowed che")
            break
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        if not any(r.values()):
            continue  # blank line

        if not r.get("name"):
            errors.append(f"Line {index}: name khali che")
            continue
        if len(r["name"]) > 200:
            errors.append(f"Line {index}: name bahu lambu che")
            continue

        sku = r.get("sku") or None
        if sku:
            if len(sku) > 64:
                errors.append(f"Line {index}: SKU bahu lambo che")
            if sku.lower() in seen_skus:
                errors.append(f"Line {index}: SKU '{sku}' file ma repeat thayo che")
            seen_skus.add(sku.lower())

        category_id = None
        cat_name = r.get("category", "")
        if cat_name:
            category_id = category_ids.get(cat_name.lower())  # None -> will be created

        attributes: dict = {}
        if r.get("attributes"):
            try:
                attributes = json.loads(r["attributes"])
                if not isinstance(attributes, dict):
                    raise ValueError
            except ValueError:
                errors.append(f"Line {index}: attributes valid JSON object nathi")
                attributes = {}

        aliases = [a.strip() for a in r.get("aliases", "").split("|") if a.strip()][:20]

        mrp = _dec(r.get("mrp", ""), "mrp", errors, index, default=None,
                   maximum=Decimal("999999999999.99"))
        rows.append({
            "line": index,
            "name": r["name"],
            "sku": sku,
            "barcode": r.get("barcode") or None,
            "brand": r.get("brand") or None,
            "category_name": cat_name or None,
            "category_id": category_id,
            "unit": r.get("unit") or "pcs",
            "pack_size": r.get("pack_size") or None,
            "purchase_price": _dec(r.get("purchase_price", ""), "purchase_price", errors, index,
                                   maximum=Decimal("999999999999.99")),
            "selling_price": _dec(r.get("selling_price", ""), "selling_price", errors, index,
                                  maximum=Decimal("999999999999.99")),
            "mrp": mrp,
            "tax_percent": _dec(r.get("tax_percent", ""), "tax_percent", errors, index,
                                maximum=Decimal("100")),
            "min_stock": _dec(r.get("min_stock", ""), "min_stock", errors, index,
                              maximum=Decimal("99999999999.999")),
            "aliases": aliases,
            "search_keywords": r.get("search_keywords") or None,
            "attributes": attributes,
        })
    return rows, errors